/**
 * email-gmail-connect – Initiate Google OAuth flow
 * Auth: JWT required, RBAC: admin/super_admin only
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, requireEmailManage, getGoogleAuthUrl, getServiceClient } from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailManage(auth)) return errorResponse("Insufficient permissions", 403);

    const url = new URL(req.url);
    const scopeLevel = (url.searchParams.get("scope_level") ?? "READ_ONLY") as "READ_ONLY" | "REPLY";

    // Create OAuth state
    const stateToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const svc = getServiceClient();
    const { error } = await svc.from("email_oauth_states").insert({
      state_token: stateToken,
      tenant_id: auth.userId,
      user_id: auth.userId,
      scope_level: scopeLevel,
      expires_at: expiresAt,
    });

    if (error) {
      console.error("[OAUTH_STATE_INSERT]", error);
      return errorResponse("Failed to create OAuth state", 500);
    }

    const authUrl = getGoogleAuthUrl(stateToken, scopeLevel);
    return jsonResponse({ url: authUrl });
  } catch (err) {
    console.error("[EMAIL_CONNECT_ERROR]", err);
    return errorResponse("Internal error", 500);
  }
});
