/**
 * email-accounts – List email accounts (GET)
 * Auth: JWT required, RBAC: admin/super_admin/cskh/sale
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authenticate, requireEmailView, getServiceClient } from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailView(auth)) return errorResponse("Insufficient permissions", 403);

    const svc = getServiceClient();
    const { data, error } = await svc
      .from("email_accounts")
      .select("id, tenant_id, created_by, provider, email_address, status, scope_level, visibility, last_sync_at, error_code, error_at, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return errorResponse("Failed to list accounts", 500);
    return jsonResponse({ accounts: data });
  } catch (err) {
    console.error("[EMAIL_ACCOUNTS_ERROR]", err);
    return errorResponse("Internal error", 500);
  }
});
