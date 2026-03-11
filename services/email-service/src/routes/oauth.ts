/**
 * OAuth Routes – Gmail Connect / Callback / Disconnect
 * ═══════════════════════════════════════════════════════════
 * SECURITY FIX v2: State persisted in email_oauth_states table
 * with atomic claim (UPDATE…RETURNING) to prevent replay.
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireEmailManage, requireEmailView } from '../middleware/auth';
import { getAuthUrl, exchangeCode, revokeToken } from '../lib/gmail';
import { encrypt } from '../lib/crypto';
import { serviceSupabase } from '../lib/supabase';
import { audit } from '../lib/audit';
import { env } from '../config';
import { google } from 'googleapis';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────
const STATE_TTL_MIN = 10; // OAuth state valid for 10 minutes

async function createOAuthState(userId: string, scopeLevel: string): Promise<string> {
  const stateToken = uuid();
  const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60 * 1000).toISOString();
  await serviceSupabase.from('email_oauth_states').insert({
    state_token: stateToken,
    tenant_id: userId,   // backward compat: NOT NULL column, set to userId
    user_id: userId,
    scope_level: scopeLevel,
    expires_at: expiresAt,
  });
  return stateToken;
}

/**
 * Atomically claim a state token — returns the state row IFF it
 * exists, has not expired, and has not been used yet.
 * Single UPDATE…RETURNING ensures no two concurrent callbacks
 * can use the same state.
 */
async function claimOAuthState(stateToken: string) {
  // Atomic: set used_at only if still NULL and not expired
  const { data, error } = await serviceSupabase
    .from('email_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state_token', stateToken)
    .is('used_at', null)
    .gte('expires_at', new Date().toISOString())
    .select('tenant_id, user_id, scope_level')
    .maybeSingle();

  if (error || !data) return null;
  return data as { tenant_id: string; user_id: string; scope_level: string };
}

/**
 * GET /email/gmail/connect
 * Redirects user to Google OAuth consent screen.
 */
router.get('/gmail/connect', requireAuth, requireEmailManage, async (req: Request, res: Response) => {
  const scopeLevel = (req.query.scope_level as string) ?? 'READ_ONLY';
  const stateToken = await createOAuthState(req.auth!.userId, scopeLevel);
  const url = getAuthUrl(stateToken, scopeLevel as 'READ_ONLY' | 'REPLY');
  res.json({ url });
});

/**
 * GET /email/gmail/callback
 * Exchange code → store encrypted tokens → create email_account.
 */
router.get('/gmail/callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${env.FRONTEND_URL}/email/accounts?error=oauth_denied`);
  }

  if (!code || !state) {
    return res.redirect(`${env.FRONTEND_URL}/email/accounts?error=missing_params`);
  }

  // Atomic claim — prevents replay attacks
  const stateData = await claimOAuthState(state as string);
  if (!stateData) {
    return res.redirect(`${env.FRONTEND_URL}/email/accounts?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code as string);

    if (!tokens.access_token || !tokens.refresh_token) {
      return res.redirect(`${env.FRONTEND_URL}/email/accounts?error=no_tokens`);
    }

    // Get user's email address
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: tokens.access_token });
    const people = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await people.userinfo.get();
    const emailAddress = userInfo.data.email;

    if (!emailAddress) {
      return res.redirect(`${env.FRONTEND_URL}/email/accounts?error=no_email`);
    }

    // Check if account already exists (shared workspace – no tenant filter)
    const { data: existing } = await serviceSupabase
      .from('email_accounts')
      .select('id')
      .eq('email_address', emailAddress)
      .neq('status', 'REVOKED')
      .maybeSingle();

    const accountData = {
      tenant_id: stateData.user_id,  // backward compat: NOT NULL, set to creator
      created_by: stateData.user_id,
      provider: 'gmail' as const,
      email_address: emailAddress,
      status: 'ACTIVE' as const,
      scope_level: stateData.scope_level,
      token_cipher: encrypt(tokens.access_token),
      refresh_cipher: encrypt(tokens.refresh_token),
      expiry_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    };

    if (existing) {
      // Re-connect existing account
      await serviceSupabase
        .from('email_accounts')
        .update({
          ...accountData,
          error_code: null,
          error_at: null,
        })
        .eq('id', existing.id);
    } else {
      await serviceSupabase
        .from('email_accounts')
        .insert(accountData);
    }

    await audit({
      action: 'ACCOUNT_CONNECT',
      actorUserId: stateData.user_id,
      emailAccountId: existing?.id,
      meta: { email_address: emailAddress, scope_level: stateData.scope_level },
    });

    res.redirect(`${env.FRONTEND_URL}/email/accounts?connected=${emailAddress}`);
  } catch (err) {
    console.error('[OAUTH_CALLBACK_ERROR]', err);
    res.redirect(`${env.FRONTEND_URL}/email/accounts?error=exchange_failed`);
  }
});

/**
 * POST /email/accounts/:id/disconnect
 * Revoke token + mark REVOKED.
 */
router.post('/accounts/:id/disconnect', requireAuth, requireEmailManage, async (req: Request, res: Response) => {
  const { id } = req.params;

  // Shared workspace: admin can disconnect any account (RBAC guard above)
  const { data: account, error } = await serviceSupabase
    .from('email_accounts')
    .select('id, email_address')
    .eq('id', id)
    .single();

  if (error || !account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Revoke token (best-effort)
  await revokeToken(id);

  // Mark REVOKED + clear tokens
  await serviceSupabase
    .from('email_accounts')
    .update({
      status: 'REVOKED',
      token_cipher: null,
      refresh_cipher: null,
      expiry_at: null,
      sync_cursor: null,
    })
    .eq('id', id);

  await audit({
    action: 'ACCOUNT_DISCONNECT',
    actorUserId: req.auth!.userId,
    emailAccountId: id,
    meta: { email_address: account.email_address },
  });

  res.json({ success: true });
});

/**
 * GET /email/accounts
 * List all email accounts for current tenant.
 */
router.get('/accounts', requireAuth, requireEmailView, async (req: Request, res: Response) => {
  const { data, error } = await serviceSupabase
    .from('email_accounts')
    .select('id, tenant_id, created_by, provider, email_address, status, scope_level, visibility, last_sync_at, error_code, error_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to list accounts' });
  }
  res.json({ accounts: data });
});

// Cleanup expired states periodically (belt-and-suspenders; DB also has expires_at)
setInterval(async () => {
  try {
    await serviceSupabase
      .from('email_oauth_states')
      .delete()
      .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // older than 1h
  } catch { /* best-effort cleanup */ }
}, 15 * 60 * 1000); // every 15 min

export default router;
