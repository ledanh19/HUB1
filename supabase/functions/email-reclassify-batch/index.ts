/**
 * email-reclassify-batch — Batch reclassify existing email threads
 * ═══════════════════════════════════════════════════════════════
 * POST with body { dryRun?: boolean, limit?: number }
 *
 * PROTECTION RULES (never overwrite):
 * - manual_override = true
 * - tag_source = 'MANUAL'
 * - workflow_status != 'OPEN' (human moved to different state)
 * - AI suggestion with apply_status = 'IGNORED' (human rejected)
 *
 * PERFORMANCE: Prefetches sender emails in batch to avoid N+1.
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, requireEmailManage, getServiceClient } from "../_shared/email-helpers.ts";
import { classifyEmailTagV2 } from "../_shared/email-classifier.ts";

const DEFAULT_LIMIT = 500;
const BATCH_SIZE = 100; // Prefetch sender emails in batches

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return handleCorsPrelight();
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);

    try {
        const auth = await authenticate(req);
        if (!auth) return errorResponse("Unauthorized", 401);
        if (!requireEmailManage(auth)) return errorResponse("Insufficient permissions", 403);

        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun === true;
        const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, 2000);

        const svc = getServiceClient();

        // Fetch threads to reclassify (paginate past Supabase 1000-row default)
        const PAGE_SIZE = 1000;
        interface ThreadRow {
            id: string;
            tenant_id: string;
            email_account_id: string;
            subject: string;
            snippet: string;
            labels: string[] | null;
            primary_participant: string | null;
            tag: string;
            tag_source: string | null;
            manual_override: boolean | null;
            priority: string | null;
            workflow_status: string | null;
        }
        const threads: ThreadRow[] = [];
        let fetchErr: unknown = null;
        for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
            const pageSize = Math.min(PAGE_SIZE, limit - offset);
            const { data: page, error: pageErr } = await svc
                .from("email_threads")
                .select("id, tenant_id, email_account_id, subject, snippet, labels, primary_participant, tag, tag_source, manual_override, priority, workflow_status")
                .order("last_message_at", { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (pageErr) { fetchErr = pageErr; break; }
            if (page) threads.push(...page);
            if (!page || page.length < pageSize) break; // no more rows
        }

        if (fetchErr) {
            console.error("[RECLASSIFY] Fetch error:", fetchErr);
            return errorResponse("Failed to fetch threads", 500);
        }

        // Fetch ignored suggestions (human-rejected) — batch lookup
        const threadIds = (threads ?? []).map(t => t.id);
        const ignoredSet = new Set<string>();
        if (threadIds.length > 0) {
            const { data: ignoredSuggestions } = await svc
                .from("email_thread_ai_suggestions")
                .select("thread_id")
                .in("thread_id", threadIds)
                .eq("apply_status", "IGNORED");
            for (const s of (ignoredSuggestions ?? [])) {
                ignoredSet.add(s.thread_id);
            }
        }

        // PERFORMANCE: Prefetch latest inbound sender for all threads in one query
        const senderMap = new Map<string, string>();
        for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
            const batch = threadIds.slice(i, i + BATCH_SIZE);
            const { data: msgs } = await svc
                .from("email_messages")
                .select("thread_id, sender, from_json")
                .in("thread_id", batch)
                .eq("direction", "INBOUND")
                .order("sent_at", { ascending: false });

            for (const msg of (msgs ?? [])) {
                const tid = msg.thread_id as string;
                if (!senderMap.has(tid)) {
                    const email = msg.sender
                        || (Array.isArray(msg.from_json) ? (msg.from_json as Array<{email?: string}>)[0]?.email : (msg.from_json as {email?: string})?.email)
                        || "";
                    if (email) senderMap.set(tid, email as string);
                }
            }
        }

        const results = {
            total: threads?.length ?? 0,
            skipped_manual: 0,
            skipped_workflow: 0,
            skipped_ignored: 0,
            skipped_same: 0,
            updated: 0,
            errors: 0,
            changes: [] as Array<{
                thread_id: string;
                old_tag: string;
                new_tag: string;
                confidence: number;
                review_flag: boolean;
                reasons: string[];
            }>,
        };

        // Batch arrays for bulk operations
        const updatePayloads: Array<{ id: string; payload: Record<string, unknown> }> = [];
        const auditPayloads: Array<Record<string, unknown>> = [];
        const suggestionPayloads: Array<Record<string, unknown>> = [];

        for (const thread of (threads ?? [])) {
            // ── PROTECTION: Skip manually overridden threads ────
            if (thread.manual_override || thread.tag_source === "MANUAL") {
                results.skipped_manual++;
                continue;
            }

            // ── PROTECTION: Skip threads with human workflow decisions ──
            // If someone moved it out of OPEN, they made a deliberate choice
            if (thread.workflow_status && thread.workflow_status !== "OPEN") {
                results.skipped_workflow++;
                continue;
            }

            // ── PROTECTION: Skip threads where human rejected AI suggestion ──
            if (ignoredSet.has(thread.id)) {
                results.skipped_ignored++;
                continue;
            }

            const senderEmail = senderMap.get(thread.id) ?? "";

            const classResult = classifyEmailTagV2({
                subject: thread.subject ?? "",
                snippet: thread.snippet ?? "",
                labels: (thread.labels as string[]) ?? [],
                senderEmail,
            });

            // Skip if tag didn't change
            if (classResult.tag === thread.tag) {
                results.skipped_same++;
                continue;
            }

            results.changes.push({
                thread_id: thread.id,
                old_tag: thread.tag,
                new_tag: classResult.tag,
                confidence: classResult.confidence,
                review_flag: classResult.review_flag,
                reasons: classResult.reasons,
            });

            if (!dryRun) {
                const updatePayload: Record<string, unknown> = {
                    tag: classResult.tag,
                    tag_source: "AI_RULES",
                    updated_at: new Date().toISOString(),
                };
                if (classResult.priority !== thread.priority) {
                    updatePayload.priority = classResult.priority;
                }

                updatePayloads.push({ id: thread.id, payload: updatePayload });

                auditPayloads.push({
                    tenant_id: thread.tenant_id,
                    thread_id: thread.id,
                    user_id: auth.userId,
                    action: "AI_APPLIED_TAG",
                    before_data: {
                        tag: thread.tag,
                        tag_source: thread.tag_source,
                        priority: thread.priority,
                    },
                    after_data: {
                        tag: classResult.tag,
                        tag_source: "AI_RULES",
                        priority: classResult.priority,
                        confidence: classResult.confidence,
                        review_flag: classResult.review_flag,
                        reasons: classResult.reasons,
                        model: classResult.model,
                    },
                });

                suggestionPayloads.push({
                    tenant_id: thread.tenant_id,
                    thread_id: thread.id,
                    suggested_tag: classResult.tag,
                    suggested_priority: classResult.priority,
                    confidence: classResult.confidence,
                    reasons: classResult.reasons,
                    model: classResult.model,
                    apply_status: "APPLIED",
                    scored_at: new Date().toISOString(),
                    applied_at: new Date().toISOString(),
                    applied_by: auth.userId,
                });
            }
        }

        // ── Execute updates ─────────────────────────────────────
        if (!dryRun && updatePayloads.length > 0) {
            // Thread updates (must be individual due to different payloads per row)
            for (const { id, payload } of updatePayloads) {
                const { error: updateErr } = await svc
                    .from("email_threads")
                    .update(payload)
                    .eq("id", id);
                if (updateErr) {
                    console.error(`[RECLASSIFY] Update error for ${id}:`, updateErr);
                    results.errors++;
                } else {
                    results.updated++;
                }
            }

            // Audit logs — bulk insert
            if (auditPayloads.length > 0) {
                const { error: auditErr } = await svc
                    .from("email_audit_logs")
                    .insert(auditPayloads);
                if (auditErr) {
                    console.error("[RECLASSIFY] Audit bulk insert error:", auditErr);
                }
            }

            // Suggestions — bulk upsert
            if (suggestionPayloads.length > 0) {
                const { error: sugErr } = await svc
                    .from("email_thread_ai_suggestions")
                    .upsert(suggestionPayloads, { onConflict: "tenant_id,thread_id" });
                if (sugErr) {
                    console.error("[RECLASSIFY] Suggestion bulk upsert error:", sugErr);
                }
            }
        }

        console.log(`[RECLASSIFY] ${dryRun ? "DRY RUN" : "APPLIED"}: ${results.updated} updated, ${results.skipped_manual} manual, ${results.skipped_workflow} workflow, ${results.skipped_ignored} ignored, ${results.skipped_same} same, ${results.errors} errors`);

        return jsonResponse({
            success: true,
            dryRun,
            ...results,
        });
    } catch (err: unknown) {
        console.error("[RECLASSIFY_ERROR]", err);
        return errorResponse((err as Error).message ?? "Reclassify failed", 500);
    }
});
