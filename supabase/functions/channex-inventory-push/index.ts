import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  pushRestrictionsToChannex,
  type ChannexRestrictionValue,
} from "../_shared/channexClient.ts";
import {
  corsHeaders,
  handleCorsPrelight,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";

/**
 * channex-inventory-push — Outbound sync processor
 * 
 * Consumes `inventory_sync_jobs` (status = PENDING) and pushes
 * changed inventory_cells to Channex via PUT /restrictions.
 * 
 * PMS SOT §5.6 — After any rate/restriction update, push delta to Channex.
 * 
 * Can be invoked:
 * 1. POST (no body) — process ALL pending jobs
 * 2. POST { job_id } — process a specific job
 * 3. POST { property_id } — process pending jobs for one property
 * 
 * Retry logic: up to 5 attempts with exponential backoff.
 * After 5 failures → status = 'DEAD_LETTER'
 */

const MAX_RETRIES = 5;

interface PushRequest {
  job_id?: string;
  property_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPrelight();
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional request body
    let params: PushRequest = {};
    try {
      params = await req.json();
    } catch {
      // No body — process all pending
    }

    // ──────────────────────────────────────────────
    // 1. Fetch pending sync jobs
    // ──────────────────────────────────────────────
    let jobQuery = supabase
      .from("inventory_sync_jobs")
      .select("*")
      .in("status", ["PENDING", "FAILED"])
      .order("created_at", { ascending: true })
      .limit(50); // Process max 50 jobs per invocation

    if (params.job_id) {
      jobQuery = supabase
        .from("inventory_sync_jobs")
        .select("*")
        .eq("id", params.job_id)
        .limit(1);
    } else if (params.property_id) {
      jobQuery = jobQuery.eq("property_id", params.property_id);
    }

    // Only retry FAILED jobs that haven't exceeded max retries
    // and whose retry_count < MAX_RETRIES
    const { data: jobs, error: jobsError } = await jobQuery;

    if (jobsError) {
      throw new Error(`Failed to fetch sync jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return jsonResponse({
        success: true,
        message: "No pending sync jobs",
        duration_ms: Date.now() - startTime,
      });
    }

    // Filter out FAILED jobs that exceeded max retries
    const eligibleJobs = jobs.filter((job) => {
      if (job.status === "FAILED") {
        return (job.retry_count || 0) < MAX_RETRIES;
      }
      return true; // PENDING jobs always eligible
    });

    // Mark exceeded-retry jobs as DEAD_LETTER
    const deadLetterJobs = jobs.filter(
      (job) => job.status === "FAILED" && (job.retry_count || 0) >= MAX_RETRIES
    );
    if (deadLetterJobs.length > 0) {
      for (const dlJob of deadLetterJobs) {
        await supabase
          .from("inventory_sync_jobs")
          .update({
            status: "DEAD_LETTER",
            error: `Max retries (${MAX_RETRIES}) exceeded. Last error: ${dlJob.error || "unknown"}`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", dlJob.id);
      }
      console.log(
        `[inventory-push] ${deadLetterJobs.length} jobs moved to DEAD_LETTER`
      );
    }

    console.log(
      `[inventory-push] Processing ${eligibleJobs.length} jobs (${deadLetterJobs.length} dead-lettered)`
    );

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      cells_pushed: 0,
      dead_lettered: deadLetterJobs.length,
      errors: [] as string[],
    };

    // ──────────────────────────────────────────────
    // 2. Process each job
    // ──────────────────────────────────────────────
    for (const job of eligibleJobs) {
      try {
        // Mark job as processing
        await supabase
          .from("inventory_sync_jobs")
          .update({
            status: "PROCESSING",
            started_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // ──────────────────────────────────────────
        // 2a. Resolve property mapping (internal ID → Channex ID)
        // ──────────────────────────────────────────
        const { data: mapping } = await supabase
          .from("channex_mappings")
          .select("id, channex_property_id, status")
          .eq("id", job.property_id)
          .single();

        if (!mapping || !mapping.channex_property_id) {
          throw new Error(
            `No Channex mapping for property_id ${job.property_id}`
          );
        }

        const channexPropertyId = mapping.channex_property_id;

        // ──────────────────────────────────────────
        // 2b. Fetch the actual PENDING cells for this property
        // ──────────────────────────────────────────
        const { data: pendingCells, error: cellsError } = await supabase
          .from("inventory_cells")
          .select(
            "id, room_type_id, rate_plan_id, channel_id, cell_date, rate, availability, stop_sell, closed_to_arrival, closed_to_departure, min_stay_arrival, min_stay_through, max_stay, max_availability, availability_offset"
          )
          .eq("property_id", job.property_id)
          .eq("sync_status", "PENDING");

        if (cellsError) {
          throw new Error(`Failed to fetch pending cells: ${cellsError.message}`);
        }

        if (!pendingCells || pendingCells.length === 0) {
          // No pending cells — mark job complete
          await supabase
            .from("inventory_sync_jobs")
            .update({
              status: "COMPLETED",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          results.processed++;
          results.succeeded++;
          continue;
        }

        // ──────────────────────────────────────────
        // 2c. Resolve rate plan IDs (internal → Channex)
        // ──────────────────────────────────────────
        const uniqueRatePlanIds = [
          ...new Set(pendingCells.map((c) => c.rate_plan_id).filter(Boolean)),
        ] as string[];

        const { data: ratePlans } = await supabase
          .from("rate_plans_mirror")
          .select("id, provider_rate_plan_id")
          .in("id", uniqueRatePlanIds);

        const rpMap = new Map(
          (ratePlans || []).map((rp) => [rp.id, rp.provider_rate_plan_id])
        );

        // ──────────────────────────────────────────
        // 2d. Group cells by rate plan + consecutive dates
        //     and build Channex restriction values
        // ──────────────────────────────────────────
        const channexValues: ChannexRestrictionValue[] = [];
        const skippedCellIds: string[] = [];

        for (const cell of pendingCells) {
          const channexRatePlanId = cell.rate_plan_id
            ? rpMap.get(cell.rate_plan_id)
            : null;

          if (!channexRatePlanId) {
            // Can't push — no Channex rate plan mapping
            skippedCellIds.push(cell.id);
            continue;
          }

          // Each cell is a single date restriction value
          const value: ChannexRestrictionValue = {
            property_id: channexPropertyId,
            rate_plan_id: channexRatePlanId,
            date_from: cell.cell_date,
            date_to: cell.cell_date, // single date
          };

          // Only include fields that have actual values
          if (cell.rate !== null && cell.rate !== undefined) {
            value.rate = cell.rate;
          }
          if (cell.availability !== null && cell.availability !== undefined) {
            value.availability = cell.availability;
          }
          if (cell.stop_sell !== null && cell.stop_sell !== undefined) {
            value.stop_sell = cell.stop_sell;
          }
          if (cell.closed_to_arrival !== null && cell.closed_to_arrival !== undefined) {
            value.closed_to_arrival = cell.closed_to_arrival;
          }
          if (cell.closed_to_departure !== null && cell.closed_to_departure !== undefined) {
            value.closed_to_departure = cell.closed_to_departure;
          }
          if (cell.min_stay_arrival !== null && cell.min_stay_arrival !== undefined) {
            value.min_stay_arrival = cell.min_stay_arrival;
          }
          if (cell.min_stay_through !== null && cell.min_stay_through !== undefined) {
            value.min_stay_through = cell.min_stay_through;
          }
          if (cell.max_stay !== null && cell.max_stay !== undefined) {
            value.max_stay = cell.max_stay;
          }
          if (cell.max_availability !== null && cell.max_availability !== undefined) {
            value.max_availability = cell.max_availability;
          }
          if (cell.availability_offset !== null && cell.availability_offset !== undefined) {
            value.availability_offset = cell.availability_offset;
          }

          channexValues.push(value);
        }

        // Mark skipped cells as FAILED (unmapped rate plan)
        if (skippedCellIds.length > 0) {
          await supabase
            .from("inventory_cells")
            .update({
              sync_status: "FAILED",
              sync_error: "Rate plan not mapped to Channex",
            })
            .in("id", skippedCellIds);
        }

        if (channexValues.length === 0) {
          // All cells were skipped — mark job as partial
          await supabase
            .from("inventory_sync_jobs")
            .update({
              status: skippedCellIds.length > 0 ? "PARTIAL" : "COMPLETED",
              completed_at: new Date().toISOString(),
              error: skippedCellIds.length > 0
                ? `${skippedCellIds.length} cells skipped (unmapped rate plans)`
                : null,
            })
            .eq("id", job.id);
          results.processed++;
          results.succeeded++;
          continue;
        }

        // ──────────────────────────────────────────
        // 2e. Push to Channex
        // ──────────────────────────────────────────
        console.log(
          `[inventory-push] Pushing ${channexValues.length} values for property ${channexPropertyId}`
        );

        const pushResult = await pushRestrictionsToChannex(channexValues);

        if (pushResult.ok) {
          // ── Success — update cells and job ──
          const pushedCellIds = pendingCells
            .filter((c) => !skippedCellIds.includes(c.id))
            .map((c) => c.id);

          await supabase
            .from("inventory_cells")
            .update({
              sync_status: "SYNCED",
              sync_error: null,
              updated_at: new Date().toISOString(),
            })
            .in("id", pushedCellIds);

          await supabase
            .from("inventory_sync_jobs")
            .update({
              status: "COMPLETED",
              completed_at: new Date().toISOString(),
              error: null,
            })
            .eq("id", job.id);

          results.succeeded++;
          results.cells_pushed += channexValues.length;
          console.log(
            `[inventory-push] Job ${job.id} completed: ${channexValues.length} values pushed`
          );
        } else {
          // ── Failed — increment retry, set error ──
          const newRetryCount = (job.retry_count || 0) + 1;
          const errorMsg = `Channex API ${pushResult.status}: ${JSON.stringify(pushResult.data).slice(0, 500)}`;

          await supabase
            .from("inventory_sync_jobs")
            .update({
              status: newRetryCount >= MAX_RETRIES ? "DEAD_LETTER" : "FAILED",
              retry_count: newRetryCount,
              error: errorMsg,
              completed_at:
                newRetryCount >= MAX_RETRIES
                  ? new Date().toISOString()
                  : null,
            })
            .eq("id", job.id);

          // Mark cells as FAILED
          const failedCellIds = pendingCells
            .filter((c) => !skippedCellIds.includes(c.id))
            .map((c) => c.id);

          await supabase
            .from("inventory_cells")
            .update({
              sync_status: "FAILED",
              sync_error: errorMsg.slice(0, 255),
            })
            .in("id", failedCellIds);

          results.failed++;
          results.errors.push(`Job ${job.id}: ${errorMsg.slice(0, 200)}`);
          console.error(`[inventory-push] Job ${job.id} failed: ${errorMsg}`);
        }

        results.processed++;
      } catch (jobError) {
        const errorMsg =
          jobError instanceof Error ? jobError.message : String(jobError);
        console.error(`[inventory-push] Job ${job.id} error: ${errorMsg}`);

        // Increment retry count
        const newRetryCount = (job.retry_count || 0) + 1;
        await supabase
          .from("inventory_sync_jobs")
          .update({
            status: newRetryCount >= MAX_RETRIES ? "DEAD_LETTER" : "FAILED",
            retry_count: newRetryCount,
            error: errorMsg.slice(0, 500),
          })
          .eq("id", job.id);

        results.processed++;
        results.failed++;
        results.errors.push(`Job ${job.id}: ${errorMsg.slice(0, 200)}`);
      }
    }

    // ──────────────────────────────────────────────
    // 3. Update sync metrics
    // ──────────────────────────────────────────────
    const duration = Date.now() - startTime;
    console.log(
      `[inventory-push] Completed in ${duration}ms: ${results.succeeded} ok, ${results.failed} failed, ${results.cells_pushed} cells`
    );

    return jsonResponse({
      success: true,
      duration_ms: duration,
      results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[inventory-push] Fatal error:", errorMsg);
    return errorResponse(errorMsg, 500);
  }
});
