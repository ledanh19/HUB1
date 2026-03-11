/**
 * email-attachments – Proxy download Gmail attachments
 * GET ?messageId=xxx&attachmentId=yyy&accountId=zzz
 * Returns the attachment as binary with proper Content-Type
 */
import { corsHeaders, handleCorsPrelight, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailView, getAccountAccessToken,
} from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailView(auth)) return errorResponse("Insufficient permissions", 403);

    const url = new URL(req.url);
    const messageId = url.searchParams.get("messageId");
    const attachmentId = url.searchParams.get("attachmentId");
    const accountId = url.searchParams.get("accountId");
    const filename = url.searchParams.get("filename") ?? "attachment";
    const mimeType = url.searchParams.get("mimeType") ?? "application/octet-stream";

    if (!messageId || !attachmentId || !accountId) {
      return errorResponse("Missing messageId, attachmentId, or accountId", 400);
    }

    const { accessToken } = await getAccountAccessToken(accountId);

    // Fetch attachment from Gmail API
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("[ATTACHMENT_FETCH_ERROR]", err);
      return errorResponse("Failed to fetch attachment", res.status);
    }

    const data = await res.json();
    const base64url = data.data as string;

    // Convert base64url to standard base64
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // Decode to bytes
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Return as binary with correct content type
    const safeFilename = filename.replace(/[^\w.\-() ]/g, "_");
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[ATTACHMENT_ERROR]", err);
    return errorResponse("Internal error", 500);
  }
});
