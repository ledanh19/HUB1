import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReconcileResult {
  total_in_channex: number;
  total_in_mirror: number;
  missing_from_mirror: string[];
  coverage_pct_before: number;
  coverage_pct_after: number;
  synced_count: number;
  quarantined_count: number;
  errors: string[];
}

interface SyncAttempt {
  booking_id: string;
  status: "SYNCED" | "QUARANTINE" | "ERROR";
  error_code?: string;
  error_message?: string;
}

/**
 * CHANNEX RECONCILIATION JOB (FIXED VERSION)
 * 
 * Fixes applied:
 * 1. Use arrival_date filter for Channex API (not generic "date")
 * 2. Recompute coverage AFTER sync
 * 3. Pass full booking payload to avoid double API calls
 * 4. Quarantine path for mapping failures
 * 5. Better error categorization
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Channex Reconciliation Job Started ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const channexApiKey = Deno.env.get("CHANNEX_API_KEY");

    if (!channexApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CHANNEX_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse parameters
    let params: any = {};
    if (req.method === "POST") {
      try {
        params = await req.json();
      } catch {
        params = {};
      }
    } else {
      const url = new URL(req.url);
      params = Object.fromEntries(url.searchParams);
    }

    const groupId = params.group_id || params.groupId;
    const dryRun = params.dry_run === true || params.dry_run === "true";
    
    // Date range: default last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const since = params.since || thirtyDaysAgo.toISOString().slice(0, 10);
    const until = params.until || today.toISOString().slice(0, 10);

    console.log(`[Reconcile] Parameters:`, { groupId, since, until, dryRun });

    // Step 1: Get list of properties to check (from group or all active properties)
    console.log("[Reconcile] Step 1: Fetching property list for reconciliation...");
    
    let propertyIds: string[] = [];
    
    if (groupId) {
      // Fetch properties in the group
      const { data: groupProperties } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", groupId);
      
      propertyIds = (groupProperties || []).map(p => p.channex_property_id);
      console.log(`[Reconcile] Found ${propertyIds.length} properties in group ${groupId}`);
    } else {
      // Fetch all active properties from channex_user_properties
      const { data: allProperties } = await supabase
        .from("channex_user_properties")
        .select("channex_property_id")
        .eq("property_status", "active");
      
      propertyIds = (allProperties || []).map(p => p.channex_property_id);
      console.log(`[Reconcile] Found ${propertyIds.length} active properties`);
    }

    if (propertyIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No properties found to reconcile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch all booking IDs from Channex API for each property
    console.log("[Reconcile] Step 2: Fetching booking IDs from Channex API (by arrival_date)...");
    
    const channexBookings: Map<string, any> = new Map();
    const limit = 100;
    const MAX_PAGES = 100;

    for (const propertyId of propertyIds) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        // Use same pagination format as sync-channex-bookings
        const channexUrl = new URL("https://app.channex.io/api/v1/bookings");
        channexUrl.searchParams.set("pagination[page]", String(page));
        channexUrl.searchParams.set("pagination[limit]", String(limit));
        channexUrl.searchParams.set("filter[property_id]", propertyId);
        channexUrl.searchParams.set("filter[arrival_date][gte]", since);
        // Also filter by arrival_date lte to bound the range
        channexUrl.searchParams.set("filter[arrival_date][lte]", until);
        channexUrl.searchParams.set("order[arrival_date]", "asc");

        const response = await fetch(channexUrl.toString(), {
          headers: {
            "user-api-key": channexApiKey,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Reconcile] Channex API error for property ${propertyId}: ${response.status} - ${errorText}`);
          // Continue with other properties instead of throwing
          break;
        }

        const data = await response.json();
        const bookings = data.data || [];
        
        for (const booking of bookings) {
          // Store full booking data to avoid re-fetching
          channexBookings.set(booking.id, booking);
        }

        // Check if more pages using same logic as sync-channex-bookings
        const meta = data.meta || {};
        const totalFromApi = meta.total ?? null;
        const totalPages = totalFromApi ? Math.ceil(totalFromApi / limit) : null;

        if (totalPages) {
          if (page < Math.min(totalPages, MAX_PAGES)) {
            page++;
            hasMore = true;
          } else {
            hasMore = false;
          }
        } else {
          // Fallback: keep paginating while we receive full pages
          if (bookings.length === limit && page < MAX_PAGES) {
            page++;
            hasMore = true;
          } else {
            hasMore = false;
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      console.log(`[Reconcile] Property ${propertyId}: accumulated ${channexBookings.size} total bookings`);
    }

    console.log(`[Reconcile] Total bookings in Channex: ${channexBookings.size}`);

    // Step 2: Get booking IDs from our mirror (using check_in_date to match arrival_date)
    console.log("[Reconcile] Step 2: Fetching booking IDs from bookings_mirror (by check_in_date)...");
    
    const { data: mirrorBookings, error: mirrorError } = await supabase
      .from("bookings_mirror")
      .select("provider_booking_id")
      .eq("provider", "channex")
      .gte("check_in_date", since)
      .lte("check_in_date", until);

    if (mirrorError) {
      throw new Error(`Mirror query error: ${mirrorError.message}`);
    }

    const mirrorBookingIdsBefore = new Set(
      (mirrorBookings || []).map((b: any) => b.provider_booking_id)
    );

    console.log(`[Reconcile] Total bookings in mirror (before sync): ${mirrorBookingIdsBefore.size}`);

    // Step 3: Find missing bookings
    const missingIds: string[] = [];
    for (const id of channexBookings.keys()) {
      if (!mirrorBookingIdsBefore.has(id)) {
        missingIds.push(id);
      }
    }

    console.log(`[Reconcile] Missing bookings: ${missingIds.length}`);

    // Calculate coverage BEFORE sync
    const coveragePctBefore = channexBookings.size > 0 
      ? (mirrorBookingIdsBefore.size / channexBookings.size) * 100
      : 100;

    const result: ReconcileResult = {
      total_in_channex: channexBookings.size,
      total_in_mirror: mirrorBookingIdsBefore.size,
      missing_from_mirror: missingIds.slice(0, 100),
      coverage_pct_before: Math.round(coveragePctBefore * 100) / 100,
      coverage_pct_after: 0, // Will be computed after sync
      synced_count: 0,
      quarantined_count: 0,
      errors: [],
    };

    const syncAttempts: SyncAttempt[] = [];

    // Step 4: Sync missing bookings with quarantine path
    if (!dryRun && missingIds.length > 0) {
      console.log(`[Reconcile] Step 4: Syncing ${missingIds.length} missing bookings...`);
      
      for (const bookingId of missingIds) {
        try {
          // FIX: Use already-fetched booking data from step 1
          let booking = channexBookings.get(bookingId);
          
          // If we need full details (rooms, property), fetch once
          if (!booking.attributes?.rooms) {
            const bookingResponse = await fetch(
              `https://app.channex.io/api/v1/bookings/${bookingId}?include=property,rooms`,
              {
                headers: {
                  "user-api-key": channexApiKey,
                  "Content-Type": "application/json",
                },
              }
            );

            if (!bookingResponse.ok) {
              const attempt: SyncAttempt = {
                booking_id: bookingId,
                status: "ERROR",
                error_code: "API_ERROR",
                error_message: `Channex fetch failed: ${bookingResponse.status}`,
              };
              syncAttempts.push(attempt);
              result.errors.push(`Failed to fetch ${bookingId}: ${bookingResponse.status}`);
              continue;
            }

            const bookingJson = await bookingResponse.json();
            booking = bookingJson.data;
          }

          if (!booking) {
            const attempt: SyncAttempt = {
              booking_id: bookingId,
              status: "ERROR",
              error_code: "VALIDATION_FAIL",
              error_message: "Empty booking data",
            };
            syncAttempts.push(attempt);
            result.errors.push(`Empty booking data for ${bookingId}`);
            continue;
          }

          // Process the booking directly here to handle quarantine
          const syncResult = await processBookingForReconcile(supabase, booking, bookingId);
          
          if (syncResult.success) {
            if (syncResult.quarantined) {
              result.quarantined_count++;
              syncAttempts.push({
                booking_id: bookingId,
                status: "QUARANTINE",
                error_code: "MAPPING_MISSING",
                error_message: syncResult.reason,
              });
            } else {
              result.synced_count++;
              syncAttempts.push({ booking_id: bookingId, status: "SYNCED" });
            }
            console.log(`[Reconcile] Processed booking ${bookingId}: ${syncResult.quarantined ? 'QUARANTINE' : 'SYNCED'}`);
          } else {
            syncAttempts.push({
              booking_id: bookingId,
              status: "ERROR",
              error_code: syncResult.error_code || "UNKNOWN",
              error_message: syncResult.error,
            });
            result.errors.push(`Sync failed for ${bookingId}: ${syncResult.error}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown";
          syncAttempts.push({
            booking_id: bookingId,
            status: "ERROR",
            error_code: "UNKNOWN",
            error_message: errorMessage,
          });
          result.errors.push(`Error processing ${bookingId}: ${errorMessage}`);
        }
      }
    }

    // Step 5: Recompute coverage AFTER sync
    const { data: mirrorBookingsAfter } = await supabase
      .from("bookings_mirror")
      .select("provider_booking_id")
      .eq("provider", "channex")
      .gte("check_in_date", since)
      .lte("check_in_date", until);

    const mirrorCountAfter = (mirrorBookingsAfter || []).length;
    result.total_in_mirror = mirrorCountAfter;
    result.coverage_pct_after = channexBookings.size > 0 
      ? Math.round((mirrorCountAfter / channexBookings.size) * 100 * 100) / 100
      : 100;

    // Step 6: Log coverage KPI with accurate post-sync data
    const kpiDate = new Date().toISOString().slice(0, 10);
    await supabase.from("sync_coverage_kpi").upsert({
      provider: "channex",
      kpi_date: kpiDate,
      total_bookings_source: result.total_in_channex,
      total_bookings_mirror: mirrorCountAfter,
      coverage_pct: result.coverage_pct_after,
      missing_booking_ids: missingIds.filter(id => 
        !syncAttempts.find(a => a.booking_id === id && a.status === "SYNCED")
      ).slice(0, 100),
      details: {
        date_range: { since, until },
        group_id: groupId,
        dry_run: dryRun,
        synced: result.synced_count,
        quarantined: result.quarantined_count,
        errors_count: result.errors.length,
        coverage_before: result.coverage_pct_before,
        coverage_after: result.coverage_pct_after,
      },
    }, {
      onConflict: "provider,kpi_date",
    });

    console.log(`[Reconcile] Complete. Coverage: ${result.coverage_pct_before}% → ${result.coverage_pct_after}%, Synced: ${result.synced_count}, Quarantined: ${result.quarantined_count}`);

    return new Response(
      JSON.stringify({
        success: true,
        result,
        sync_attempts: syncAttempts.slice(0, 50), // Limit response size
        message: dryRun 
          ? "Dry run complete - no bookings were synced"
          : `Reconciliation complete. Synced ${result.synced_count}, Quarantined ${result.quarantined_count} of ${missingIds.length} missing bookings.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Reconcile] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Process a single booking for reconciliation with quarantine support
 */
async function processBookingForReconcile(
  supabase: any,
  booking: any,
  bookingId: string
): Promise<{ success: boolean; quarantined?: boolean; reason?: string; error?: string; error_code?: string }> {
  try {
    const attrs = booking.attributes || booking;
    
    // Extract property ID
    const propertyId = attrs.property_id || 
      booking.relationships?.property?.data?.id ||
      attrs.property?.id;

    if (!propertyId) {
      // Insert with QUARANTINE status if no property ID
      await insertQuarantineBooking(supabase, booking, bookingId, "NO_PROPERTY_ID");
      return { success: true, quarantined: true, reason: "No property ID in booking" };
    }

    // Check if property is mapped
    const { data: mapping } = await supabase
      .from("channex_mappings")
      .select("internal_property_id, status")
      .eq("channex_property_id", propertyId)
      .maybeSingle();

    if (!mapping || mapping.status !== "MAPPED" || !mapping.internal_property_id) {
      // Insert with QUARANTINE status
      await insertQuarantineBooking(supabase, booking, bookingId, "MAPPING_MISSING");
      return { success: true, quarantined: true, reason: `Property ${propertyId} not mapped` };
    }

    // Property is mapped - insert booking normally
    const rooms = attrs.rooms || [];
    const firstRoom = rooms[0] || {};
    const guest = firstRoom.guests?.[0] || attrs.customer || {};

    const checkInDate = attrs.arrival_date || firstRoom.checkin_date;
    const checkOutDate = attrs.departure_date || firstRoom.checkout_date;
    
    if (!checkInDate || !checkOutDate) {
      await insertQuarantineBooking(supabase, booking, bookingId, "MISSING_DATES");
      return { success: true, quarantined: true, reason: "Missing check-in/check-out dates" };
    }

    const nights = Math.ceil(
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine booking status
    let bookingStatus = "CONFIRMED";
    const rawStatus = (attrs.status || "").toLowerCase();
    if (rawStatus.includes("cancel")) bookingStatus = "CANCELLED";
    else if (rawStatus.includes("no_show") || rawStatus.includes("noshow")) bookingStatus = "NO_SHOW";

    // Determine payment type
    let paymentType = "PENDING";
    const paymentCollect = (attrs.payment_collect || "").toLowerCase();
    if (paymentCollect.includes("property")) paymentType = "PAY_AT_PROPERTY";
    else if (paymentCollect.includes("ota") || paymentCollect.includes("channel")) paymentType = "PAY_VIA_OTA";

    const unifiedBookingId = `CHX-${bookingId.slice(0, 8)}`;

    const bookingData = {
      unified_booking_id: unifiedBookingId,
      provider: "channex",
      provider_booking_id: bookingId,
      channex_property_id: propertyId,
      channex_revision_id: attrs.revision_id || null,
      pms_property_id: mapping.internal_property_id,
      ota_source: attrs.ota_name || "Direct",
      ota_booking_code: attrs.ota_reservation_code || null,
      guest_name: guest.name || attrs.customer?.name || "Unknown Guest",
      guest_email: guest.email || attrs.customer?.email || null,
      guest_phone: guest.phone || attrs.customer?.phone || null,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      nights,
      room_type: firstRoom.room_type_name || null,
      total_amount_gross: parseFloat(attrs.amount || "0") || null,
      booking_status: bookingStatus,
      payment_type: paymentType,
      source_updated_at: attrs.inserted_at || new Date().toISOString(),
      synced_at: new Date().toISOString(),
      mapping_status: "MAPPED",
    };

    // Upsert using the unique constraint
    const { error: upsertError } = await supabase
      .from("bookings_mirror")
      .upsert(bookingData, {
        onConflict: "provider,provider_booking_id",
      });

    if (upsertError) {
      return { success: false, error: upsertError.message, error_code: "DB_CONFLICT" };
    }

    return { success: true, quarantined: false };

  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error",
      error_code: "UNKNOWN",
    };
  }
}

/**
 * Insert a booking with QUARANTINE status for later review
 */
async function insertQuarantineBooking(
  supabase: any,
  booking: any,
  bookingId: string,
  reason: string
): Promise<void> {
  const attrs = booking.attributes || booking;
  const rooms = attrs.rooms || [];
  const firstRoom = rooms[0] || {};
  const guest = firstRoom.guests?.[0] || attrs.customer || {};

  const checkInDate = attrs.arrival_date || firstRoom.checkin_date || new Date().toISOString().slice(0, 10);
  const checkOutDate = attrs.departure_date || firstRoom.checkout_date || new Date().toISOString().slice(0, 10);
  
  const nights = Math.max(1, Math.ceil(
    (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24)
  ));

  const unifiedBookingId = `QTN-${bookingId.slice(0, 8)}`;

  const quarantineData = {
    unified_booking_id: unifiedBookingId,
    provider: "channex",
    provider_booking_id: bookingId,
    channex_property_id: attrs.property_id || null,
    channex_revision_id: attrs.revision_id || null,
    ota_source: attrs.ota_name || "Unknown",
    guest_name: guest.name || attrs.customer?.name || "Unknown Guest",
    guest_email: guest.email || attrs.customer?.email || null,
    guest_phone: guest.phone || attrs.customer?.phone || null,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    nights,
    total_amount_gross: parseFloat(attrs.amount || "0") || null,
    booking_status: "CONFIRMED",
    payment_type: "PENDING",
    source_updated_at: attrs.inserted_at || new Date().toISOString(),
    synced_at: new Date().toISOString(),
    mapping_status: "QUARANTINE", // Mark for manual review
  };

  await supabase
    .from("bookings_mirror")
    .upsert(quarantineData, {
      onConflict: "provider,provider_booking_id",
    });

  // Also log a warning for review
  await supabase.from("booking_warnings").insert({
    unified_booking_id: unifiedBookingId,
    warning_type: "QUARANTINE",
    warning_code: reason,
    severity: "medium",
    message: `Booking quarantined during reconciliation: ${reason}`,
    metadata: { 
      booking_id: bookingId,
      property_id: attrs.property_id,
      reason,
    },
  }).catch(() => {}); // Ignore if warnings table doesn't exist
}
