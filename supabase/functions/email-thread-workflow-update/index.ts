/**
 * email-thread-workflow-update – Upsert workflow state on a thread (POST)
 * Auth: JWT required
 * RBAC: admin / super_admin / cskh (requireEmailReply)
 * Body: { threadId, status?, assignedTo?, bookingUnifiedId? }
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
    authenticate, requireEmailReply, getServiceClient, audit,
} from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return handleCorsPrelight();
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);

    try {
        const auth = await authenticate(req);
        if (!auth) return errorResponse("Unauthorized", 401);
        if (!requireEmailReply(auth)) return errorResponse("Insufficient permissions", 403);

        const body = await req.json();
        const { threadId, status, assignedTo, bookingUnifiedId } = body;
        if (!threadId) return errorResponse("Missing threadId", 400);

        const svc = getServiceClient();

        // Verify thread exists
        const { data: thread, error: tErr } = await svc
            .from("email_threads")
            .select("id")
            .eq("id", threadId)
            .maybeSingle();

        if (tErr || !thread) return errorResponse("Thread not found", 404);

        // Build upsert payload
        const now = new Date().toISOString();
        const payload: Record<string, unknown> = { thread_id: threadId };

        if (status !== undefined) {
            payload.status = status;
            payload.status_updated_by = auth.userId;
            payload.status_updated_at = now;
        }

        if (assignedTo !== undefined) {
            payload.assigned_to = assignedTo || null; // allow unassign
            payload.assigned_by = auth.userId;
            payload.assigned_at = assignedTo ? now : null;
        }

        if (bookingUnifiedId !== undefined) {
            payload.booking_unified_id = bookingUnifiedId || null; // allow unlink
            payload.booking_linked_by = bookingUnifiedId ? auth.userId : null;
            payload.booking_linked_at = bookingUnifiedId ? now : null;
        }

        // Upsert by thread_id (unique)
        const { data: workflow, error: wErr } = await svc
            .from("email_thread_workflow")
            .upsert(payload, { onConflict: "thread_id" })
            .select("*")
            .single();

        if (wErr) {
            console.error("[WORKFLOW_UPDATE_ERROR]", wErr.message, wErr.details);
            return errorResponse("Failed to update workflow", 500);
        }

        // Audit each change type
        if (status !== undefined) {
            await audit({
                action: "THREAD_STATUS_CHANGE" as any,
                actorUserId: auth.userId,
                threadId,
                meta: { new_status: status },
            });
        }
        if (assignedTo !== undefined) {
            await audit({
                action: "THREAD_ASSIGN" as any,
                actorUserId: auth.userId,
                threadId,
                meta: { assigned_to: assignedTo || null },
            });
        }
        if (bookingUnifiedId !== undefined) {
            await audit({
                action: "THREAD_BOOKING_LINK" as any,
                actorUserId: auth.userId,
                threadId,
                meta: { booking_unified_id: bookingUnifiedId || null },
            });
        }

        return jsonResponse({ success: true, workflow });
    } catch (err) {
        console.error("[WORKFLOW_UPDATE_ERROR]", err);
        return errorResponse("Internal error", 500);
    }
});
