/**
 * email-thread-note-add – Add internal note to a thread (POST)
 * Auth: JWT required
 * RBAC: admin / super_admin / cskh (requireEmailReply)
 * Body: { threadId, note }
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
        const { threadId, note } = body;
        if (!threadId) return errorResponse("Missing threadId", 400);
        if (!note || !note.trim()) return errorResponse("Missing note", 400);

        const svc = getServiceClient();

        // Verify thread exists
        const { data: thread, error: tErr } = await svc
            .from("email_threads")
            .select("id")
            .eq("id", threadId)
            .maybeSingle();

        if (tErr || !thread) return errorResponse("Thread not found", 404);

        // Insert note
        const { data: noteRow, error: nErr } = await svc
            .from("email_thread_notes")
            .insert({
                thread_id: threadId,
                note: note.trim(),
                created_by: auth.userId,
            })
            .select("*")
            .single();

        if (nErr) {
            console.error("[NOTE_ADD_ERROR]", nErr.message, nErr.details);
            return errorResponse("Failed to add note", 500);
        }

        await audit({
            action: "THREAD_NOTE_ADD" as any,
            actorUserId: auth.userId,
            threadId,
            meta: { note_id: noteRow.id },
        });

        return jsonResponse({ success: true, note: noteRow });
    } catch (err) {
        console.error("[NOTE_ADD_ERROR]", err);
        return errorResponse("Internal error", 500);
    }
});
