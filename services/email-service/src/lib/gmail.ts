/**
 * Gmail API Wrapper
 * ═══════════════════════════════════════════════════════════
 * Thread-first operations. All methods use OAuth2 per-account.
 * NEVER log tokens. NEVER return tokens to caller beyond this module.
 */
import { google, gmail_v1 } from 'googleapis';
import { env } from '../config';
import { decrypt, encrypt } from './crypto';
import { serviceSupabase } from './supabase';
import { audit } from './audit';

const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);

// ─── Scopes ─────────────────────────────────────────────────
export const GMAIL_SCOPES_READ = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
export const GMAIL_SCOPES_REPLY = [
  ...GMAIL_SCOPES_READ,
  'https://www.googleapis.com/auth/gmail.send',
];

// ─── OAuth Helpers ──────────────────────────────────────────
export function getAuthUrl(state: string, scopeLevel: 'READ_ONLY' | 'REPLY' = 'READ_ONLY'): string {
  const scopes = scopeLevel === 'REPLY' ? GMAIL_SCOPES_REPLY : GMAIL_SCOPES_READ;
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state,
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// ─── Token Error Classification ─────────────────────────────
const PERMANENT_TOKEN_ERRORS = [
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
  'access_denied',
  'token has been expired or revoked',
  'token has been revoked',
];

/**
 * Classify whether an OAuth error is permanent (token revoked/invalid)
 * vs transient (network/server error). Only permanent errors trigger REAUTH.
 */
function isTokenRevoked(err: any): boolean {
  const message = (err?.message ?? '').toLowerCase();
  const code = (err?.code ?? '').toString().toLowerCase();
  const responseError = (err?.response?.data?.error ?? '').toLowerCase();
  const responseDesc = (err?.response?.data?.error_description ?? '').toLowerCase();

  for (const pattern of PERMANENT_TOKEN_ERRORS) {
    if (message.includes(pattern)) return true;
    if (code.includes(pattern)) return true;
    if (responseError.includes(pattern)) return true;
    if (responseDesc.includes(pattern)) return true;
  }

  // HTTP 400/401/403 ONLY when combined with a known error string
  const status = err?.response?.status ?? err?.code;
  if ([400, 401, 403].includes(status) && PERMANENT_TOKEN_ERRORS.some(p => responseError.includes(p))) {
    return true;
  }

  return false;
}

/**
 * Idempotent: only transitions ACTIVE → REAUTH_REQUIRED.
 * Prevents duplicate audit logs and state mutations.
 */
async function markAccountReauthRequired(
  accountId: string,
  createdBy: string,
  err: any,
): Promise<void> {
  const { data } = await serviceSupabase
    .from('email_accounts')
    .update({
      status: 'REAUTH_REQUIRED',
      expiry_at: null,
      error_code: err?.response?.data?.error ?? 'TOKEN_REVOKED',
      error_at: new Date().toISOString(),
      token_refresh_locked_at: null,
    })
    .eq('id', accountId)
    .eq('status', 'ACTIVE')
    .select('id')
    .maybeSingle();

  if (data) {
    await audit({
      action: 'TOKEN_REFRESH_FAILED',
      actorUserId: createdBy,
      emailAccountId: accountId,
      meta: {
        error_message: err?.message,
        response_error: err?.response?.data?.error,
        source: 'node_service',
      },
    });
  }
}

/**
 * Build an authenticated Gmail client for a specific account.
 * ────────────────────────────────────────────────────────────
 * OWNERSHIP MODEL (enterprise-hardened):
 *   - Edge Functions = SOT for token refresh (via acquire_refresh_lock RPC)
 *   - Node service = passive consumer. Does NOT refresh tokens.
 *   - If token is invalid/revoked → marks REAUTH_REQUIRED and throws.
 *
 * The `client.on('tokens')` auto-refresh listener is intentionally REMOVED
 * to prevent dual-ownership race conditions between Edge and Node.
 */
export async function getGmailClient(accountId: string): Promise<gmail_v1.Gmail> {
  const { data: account, error } = await serviceSupabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) throw new Error(`Account not found: ${accountId}`);
  if (account.status === 'REAUTH_REQUIRED') {
    throw new Error(`REAUTH_REQUIRED: ${accountId}`);
  }
  if (account.status !== 'ACTIVE') throw new Error(`Account ${accountId} status: ${account.status}`);

  const accessToken = decrypt(account.token_cipher);
  const refreshToken = decrypt(account.refresh_cipher);

  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.expiry_at ? new Date(account.expiry_at).getTime() : undefined,
  });

  // NO client.on('tokens') listener — Edge Functions own refresh.
  // Validate token works — catch permanent errors immediately.
  try {
    await client.getAccessToken();
  } catch (err: any) {
    if (isTokenRevoked(err)) {
      await markAccountReauthRequired(accountId, account.created_by, err);
      throw new Error(`REAUTH_REQUIRED: ${accountId}`);
    }
    throw err; // transient — let caller retry
  }

  return google.gmail({ version: 'v1', auth: client });
}

// ─── Thread-first Sync ──────────────────────────────────────
export interface ThreadListItem {
  id: string;
  historyId: string;
  snippet: string;
}

export async function listThreads(
  gmail: gmail_v1.Gmail,
  options: { maxResults?: number; labelIds?: string[]; q?: string; pageToken?: string }
): Promise<{ threads: ThreadListItem[]; nextPageToken?: string }> {
  const res = await gmail.users.threads.list({
    userId: 'me',
    maxResults: options.maxResults ?? 50,
    labelIds: options.labelIds ?? ['INBOX'],
    q: options.q,
    pageToken: options.pageToken,
  });
  return {
    threads: (res.data.threads ?? []).map((t) => ({
      id: t.id!,
      historyId: t.historyId ?? '',
      snippet: t.snippet ?? '',
    })),
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

export async function getThread(gmail: gmail_v1.Gmail, threadId: string, format: 'metadata' | 'full' = 'metadata') {
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format,
    metadataHeaders: format === 'metadata'
      ? ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To', 'References']
      : undefined,
  });
  return res.data;
}

export async function getMessage(gmail: gmail_v1.Gmail, messageId: string, format: 'full' | 'raw' = 'full') {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format,
  });
  return res.data;
}

// ─── Send Reply ─────────────────────────────────────────────
export async function sendReply(
  gmail: gmail_v1.Gmail,
  options: {
    threadId: string;
    to: string;
    cc?: string;
    subject: string;
    bodyPlain: string;
    inReplyTo: string;
    references: string;
    from: string;
  }
): Promise<gmail_v1.Schema$Message> {
  const headers = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    options.cc ? `Cc: ${options.cc}` : '',
    `Subject: ${options.subject}`,
    `In-Reply-To: ${options.inReplyTo}`,
    `References: ${options.references}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ].filter(Boolean).join('\r\n');

  const rawMessage = `${headers}\r\n\r\n${options.bodyPlain}`;
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: options.threadId,
    },
  });
  return res.data;
}

// ─── Revoke Token ───────────────────────────────────────────
export async function revokeToken(accountId: string): Promise<void> {
  try {
    const { data: account } = await serviceSupabase
      .from('email_accounts')
      .select('token_cipher')
      .eq('id', accountId)
      .single();
    if (account?.token_cipher) {
      const token = decrypt(account.token_cipher);
      await oauth2Client.revokeToken(token);
    }
  } catch {
    // Best-effort revoke – token may already be invalid
  }
}

// ─── Helpers ────────────────────────────────────────────────
export function parseEmailHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/**
 * Decode RFC 2047 encoded-words in email headers.
 * Handles =?charset?B?base64?= and =?charset?Q?quoted-printable?=
 */
function decodeRFC2047(input: string): string {
  if (!input || !input.includes('=?')) return input;
  const normalized = input.replace(/\?=\s+=\?/g, '?==?');
  return normalized.replace(/=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g, (_m, charset, enc, payload) => {
    try {
      let buf: Buffer;
      if (enc.toUpperCase() === 'B') {
        buf = Buffer.from(payload, 'base64');
      } else {
        const raw = (payload as string).replace(/_/g, ' ');
        const parts: number[] = [];
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === '=' && i + 2 < raw.length) {
            parts.push(parseInt(raw.substring(i + 1, i + 3), 16));
            i += 2;
          } else {
            parts.push(raw.charCodeAt(i));
          }
        }
        buf = Buffer.from(parts);
      }
      const csLower = charset.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Node's Buffer.toString supports limited encodings; iconv-lite would be
      // needed for exotic charsets. For common ones (utf-8, latin1, ascii) this works.
      const encMap: Record<string, BufferEncoding> = {
        utf8: 'utf-8', ascii: 'utf-8', usascii: 'utf-8',
        iso88591: 'latin1', latin1: 'latin1', windows1252: 'latin1',
      };
      return buf.toString(encMap[csLower] ?? 'utf-8');
    } catch { return _m; }
  });
}

export function parseParticipants(headerValue: string): Array<{ name: string; email: string }> {
  if (!headerValue) return [];
  // Pre-decode the entire header for RFC2047 encoded names
  const decoded = decodeRFC2047(headerValue);
  return decoded.split(',').map((p) => {
    const trimmed = p.trim();
    // Try: "Display Name" <email@domain> or Display Name <email@domain>
    const match = trimmed.match(/^"?(.+?)"?\s*<([^>]+@[^>]+)>$/);
    if (match) return { name: match[1]?.trim() ?? '', email: match[2].trim() };
    // Try: bare email
    const emailOnly = trimmed.match(/^([^@\s]+@[^@\s]+)$/);
    if (emailOnly) return { name: '', email: emailOnly[1] };
    return { name: '', email: trimmed };
  });
}

export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): { plain: string; html: string } {
  if (!payload) return { plain: '', html: '' };

  let plain = '';
  let html = '';

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plain += Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      html += Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.parts) part.parts.forEach(walk);
  }

  // Single-part message
  if (payload.body?.data && payload.mimeType === 'text/plain') {
    plain = Buffer.from(payload.body.data, 'base64').toString('utf8');
  } else if (payload.body?.data && payload.mimeType === 'text/html') {
    html = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  // Multi-part
  if (payload.parts) payload.parts.forEach(walk);

  return { plain, html };
}
