/**
 * email-accounts-disconnect – Disconnect (revoke) an email account (POST)
 * Auth: JWT required, RBAC: admin/super_admin
 * Body: { accountId: string }
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailManage, getServiceClient,
  decrypt, gmailRevokeToken, audit,
} from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailManage(auth)) return errorResponse("Insufficient permissions", 403);

    const { accountId } = await req.json();
    if (!accountId) return errorResponse("Missing accountId", 400);

    const svc = getServiceClient();
    const { data: account, error } = await svc
      .from("email_accounts")
      .select("id, email_address, token_cipher")
      .eq("id", accountId)
      .single();

    if (error || !account) return errorResponse("Account not found", 404);

    // Best-effort revoke
    if (account.token_cipher) {
      try {
        const token = await decrypt(account.token_cipher);
        await gmailRevokeToken(token);
      } catch { /* best-effort */ }
    }

    // Mark REVOKED + clear tokens
    await svc.from("email_accounts").update({
      status: "REVOKED",
      token_cipher: null,
      refresh_cipher: null,
      expiry_at: null,
      sync_cursor: null,
      syncing_since: null,
    }).eq("id", accountId);

    await audit({
      action: "ACCOUNT_DISCONNECT",
      actorUserId: auth.userId,
      emailAccountId: accountId,
      meta: { email_address: account.email_address },
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[DISCONNECT_ERROR]", err);
    return errorResponse("Internal error", 500);
  }
});
