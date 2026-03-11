/**
 * email-gmail-callback – Google OAuth callback handler
 * Public endpoint (no JWT) – validates via DB state atomic claim
 */
import {
  getServiceClient, exchangeGoogleCode, getGoogleUserEmail,
  encrypt, audit, getFrontendUrl,
} from "../_shared/email-helpers.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const frontendUrl = getFrontendUrl();
  const redirect = (path: string) => new Response(null, {
    status: 302,
    headers: { Location: `${frontendUrl}${path}` },
  });

  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) return redirect("/email/accounts?error=oauth_denied");
    if (!code || !state) return redirect("/email/accounts?error=missing_params");

    const svc = getServiceClient();

    // Atomic claim: UPDATE…WHERE used_at IS NULL AND not expired
    const { data: stateData, error: claimErr } = await svc
      .from("email_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state_token", state)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .select("tenant_id, user_id, scope_level")
      .maybeSingle();

    if (claimErr || !stateData) return redirect("/email/accounts?error=invalid_state");

    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return redirect("/email/accounts?error=no_tokens");
    }

    // Get user email
    const emailAddress = await getGoogleUserEmail(tokens.access_token);
    if (!emailAddress) return redirect("/email/accounts?error=no_email");

    // Encrypt tokens
    const tokenCipher = await encrypt(tokens.access_token);
    const refreshCipher = await encrypt(tokens.refresh_token);

    // Check existing account
    const { data: existing } = await svc
      .from("email_accounts")
      .select("id")
      .eq("email_address", emailAddress)
      .neq("status", "REVOKED")
      .maybeSingle();

    const accountData = {
      tenant_id: stateData.user_id,
      created_by: stateData.user_id,
      provider: "gmail",
      email_address: emailAddress,
      status: "ACTIVE",
      scope_level: stateData.scope_level,
      token_cipher: tokenCipher,
      refresh_cipher: refreshCipher,
      expiry_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      visibility: "TEAM",
    };

    if (existing) {
      await svc.from("email_accounts").update({
        ...accountData,
        error_code: null,
        error_at: null,
      }).eq("id", existing.id);
    } else {
      await svc.from("email_accounts").insert(accountData);
    }

    await audit({
      action: "ACCOUNT_CONNECT",
      actorUserId: stateData.user_id,
      emailAccountId: existing?.id,
      meta: { email_address: emailAddress, scope_level: stateData.scope_level },
    });

    return redirect(`/email/accounts?connected=${encodeURIComponent(emailAddress)}`);
  } catch (err) {
    console.error("[OAUTH_CALLBACK_ERROR]", err);
    return redirect("/email/accounts?error=exchange_failed");
  }
});
