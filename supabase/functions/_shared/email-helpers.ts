/**
 * Shared Email Edge Function Helpers
 * ═══════════════════════════════════════════════════════════
 * Auth, RBAC, crypto, audit — reusable across all email functions.
 * NEVER log tokens. NEVER return tokens to frontend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ─── Supabase Clients ───────────────────────────────────────
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// ─── Auth + RBAC ────────────────────────────────────────────
export interface AuthContext {
  userId: string;
  email: string;
  appRole: string | null;
}

const EMAIL_VIEW_ROLES = ["admin", "super_admin", "cskh", "sale"];
const EMAIL_REPLY_ROLES = ["admin", "super_admin", "cskh"];
const EMAIL_MANAGE_ROLES = ["admin", "super_admin"];

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabase = getUserClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const userId = user.id;
  const email = user.email ?? "";

  // Fetch app role
  const svc = getServiceClient();
  const { data: appRole } = await svc.rpc("get_user_role", { _user_id: userId });

  return { userId, email, appRole: (appRole as string) ?? null };
}

export function requireEmailView(auth: AuthContext): boolean {
  return !!auth.appRole && EMAIL_VIEW_ROLES.includes(auth.appRole);
}
export function requireEmailReply(auth: AuthContext): boolean {
  return !!auth.appRole && EMAIL_REPLY_ROLES.includes(auth.appRole);
}
export function requireEmailManage(auth: AuthContext): boolean {
  return !!auth.appRole && EMAIL_MANAGE_ROLES.includes(auth.appRole);
}

// ─── AES-256-GCM Encryption (Deno) ─────────────────────────

function getKeyBytes(): Uint8Array {
  const hex = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function hexEncode(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function encrypt(plaintext: string): Promise<string> {
  const keyBytes = getKeyBytes();
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encoded);

  const cipherArr = new Uint8Array(cipherBuf);
  const ciphertext = cipherArr.slice(0, cipherArr.length - 16);
  const tag = cipherArr.slice(cipherArr.length - 16);

  return `${hexEncode(iv)}:${hexEncode(ciphertext)}:${hexEncode(tag)}`;
}

export async function decrypt(cipherString: string): Promise<string> {
  const [ivHex, encHex, tagHex] = cipherString.split(":");
  if (!ivHex || !encHex || !tagHex) throw new Error("Invalid cipher format");

  const keyBytes = getKeyBytes();
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const iv = hexDecode(ivHex);
  const ciphertext = hexDecode(encHex);
  const tag = hexDecode(tagHex);

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 }, key, combined.buffer as ArrayBuffer);
  return new TextDecoder().decode(plainBuf);
}

// ─── Audit ──────────────────────────────────────────────────
export type AuditAction =
  | "ACCOUNT_CONNECT" | "ACCOUNT_DISCONNECT" | "ACCOUNT_ERROR"
  | "TOKEN_REFRESH" | "TOKEN_REFRESH_FAILED"
  | "SYNC_START" | "SYNC_COMPLETE" | "SYNC_ERROR"
  | "THREAD_BODY_FETCH" | "REPLY_SEND" | "REPLY_ERROR";

interface AuditParams {
  action: AuditAction;
  actorUserId: string;
  tenantId?: string;
  emailAccountId?: string;
  threadId?: string;
  messageId?: string;
  meta?: Record<string, unknown>;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    const svc = getServiceClient();
    await svc.from("email_actions_audit").insert({
      tenant_id: params.tenantId ?? params.actorUserId,
      actor_user_id: params.actorUserId,
      action: params.action,
      email_account_id: params.emailAccountId ?? null,
      thread_id: params.threadId ?? null,
      message_id: params.messageId ?? null,
      meta: params.meta ?? {},
    });
  } catch (err) {
    console.error("[AUDIT_WRITE_ERROR]", params.action, err);
  }
}

// ─── Gmail OAuth helpers ────────────────────────────────────
const GMAIL_SCOPES_READ = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];
const GMAIL_SCOPES_REPLY = [
  ...GMAIL_SCOPES_READ,
  "https://www.googleapis.com/auth/gmail.send",
];

export function getGoogleAuthUrl(state: string, scopeLevel: "READ_ONLY" | "REPLY"): string {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const redirectUri = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-gmail-callback`;
  const scopes = scopeLevel === "REPLY" ? GMAIL_SCOPES_REPLY : GMAIL_SCOPES_READ;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number | null;
}> {
  const redirectUri = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-gmail-callback`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? "Token exchange failed");

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  };
}

export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

// ─── OAuth Error Classification ─────────────────────────────
const PERMANENT_GOOGLE_ERRORS = [
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "access_denied",
];

/**
 * Classify Google token endpoint error.
 * CRITICAL: HTTP status alone is NOT sufficient.
 * Must match a known permanent error string to avoid false REAUTH on transient 403s.
 */
function isGoogleErrorPermanent(httpStatus: number, errorBody: Record<string, unknown>): boolean {
  const error = ((errorBody.error as string) ?? "").toLowerCase();
  const desc = ((errorBody.error_description as string) ?? "").toLowerCase();

  // Known permanent error codes from Google
  if (PERMANENT_GOOGLE_ERRORS.includes(error)) return true;

  // Known permanent error descriptions
  if (desc.includes("token has been expired or revoked")) return true;
  if (desc.includes("token has been revoked")) return true;

  // HTTP 400/401/403 ONLY when combined with a recognizable auth error
  if ([400, 401, 403].includes(httpStatus) && PERMANENT_GOOGLE_ERRORS.includes(error)) return true;

  // All other errors (500, network, rate_limit) are transient
  return false;
}

/**
 * Mark account as REAUTH_REQUIRED. Idempotent — only transitions ACTIVE → REAUTH_REQUIRED.
 * Prevents duplicate audit logs via eq('status','ACTIVE') guard.
 */
async function markAccountReauthRequired(
  accountId: string,
  createdByUserId: string,
  tenantId: string,
  googleError: string,
  googleDescription: string,
): Promise<void> {
  const svc = getServiceClient();

  const { data } = await svc
    .from("email_accounts")
    .update({
      status: "REAUTH_REQUIRED",
      expiry_at: null,
      error_code: googleError || "TOKEN_REVOKED",
      error_at: new Date().toISOString(),
      token_refresh_locked_at: null,
    })
    .eq("id", accountId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  if (data) {
    await audit({
      action: "TOKEN_REFRESH_FAILED",
      actorUserId: createdByUserId,
      tenantId,
      emailAccountId: accountId,
      meta: {
        google_error: googleError,
        google_description: googleDescription,
        reason: "REFRESH_TOKEN_REVOKED",
      },
    });
  }
}

export async function refreshAccessToken(
  refreshCipher: string,
  accountId: string,
  createdByUserId: string,
  tenantId: string,
): Promise<string> {
  const svc = getServiceClient();

  // ── Acquire refresh lock via RPC (atomic, TTL = 2 min) ──
  const { data: lockAcquired } = await svc.rpc("acquire_refresh_lock", {
    p_account_id: accountId,
  });

  if (!lockAcquired) {
    // Another caller holds the lock — wait briefly, then read fresh token
    await new Promise(r => setTimeout(r, 3000));
    const { data: refreshed } = await svc
      .from("email_accounts")
      .select("token_cipher, status")
      .eq("id", accountId)
      .single();
    if (!refreshed || refreshed.status !== "ACTIVE") {
      throw new Error("Account no longer ACTIVE after concurrent refresh");
    }
    return await decrypt(refreshed.token_cipher as string);
  }

  try {
    const refreshToken = await decrypt(refreshCipher);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (isGoogleErrorPermanent(res.status, data)) {
        await markAccountReauthRequired(
          accountId,
          createdByUserId,
          tenantId,
          data.error ?? `HTTP_${res.status}`,
          data.error_description ?? "",
        );
        throw new Error(`REAUTH_REQUIRED:${data.error ?? res.status}`);
      }
      // Transient error — throw but do NOT change account status
      throw new Error(`TOKEN_REFRESH_TRANSIENT:${data.error_description ?? res.status}`);
    }

    // ── Success: update token + release lock ──
    const newAccessToken = data.access_token;
    const newExpiry = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    const updates: Record<string, unknown> = {
      token_cipher: await encrypt(newAccessToken),
      expiry_at: newExpiry,
      token_refresh_locked_at: null,
      error_code: null,
      error_at: null,
    };

    // CRITICAL: Do NOT overwrite refresh_token unless Google returns a new one
    if (data.refresh_token) {
      updates.refresh_cipher = await encrypt(data.refresh_token);
    }

    await svc.from("email_accounts").update(updates).eq("id", accountId);

    return newAccessToken;
  } catch (err) {
    // Release lock on any error (TTL also self-heals after 2 min)
    await svc.rpc("release_refresh_lock", { p_account_id: accountId });
    throw err;
  }
}

export async function getAccountAccessToken(
  accountId: string,
): Promise<{ accessToken: string; account: Record<string, unknown> }> {
  const svc = getServiceClient();
  const { data: account, error } = await svc
    .from("email_accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (error || !account) throw new Error(`Account not found: ${accountId}`);

  // Block REAUTH_REQUIRED early — structured error for caller
  if (account.status === "REAUTH_REQUIRED") {
    throw new Error(`REAUTH_REQUIRED:${accountId}`);
  }
  if (account.status !== "ACTIVE") {
    throw new Error(`Account ${accountId} status: ${account.status}`);
  }

  let accessToken = await decrypt(account.token_cipher as string);

  // Refresh if expiring within 5 minutes
  if (
    account.expiry_at &&
    new Date(account.expiry_at as string).getTime() < Date.now() + 5 * 60 * 1000
  ) {
    accessToken = await refreshAccessToken(
      account.refresh_cipher as string,
      accountId,
      account.created_by as string,
      account.tenant_id as string,
    );
    await audit({
      action: "TOKEN_REFRESH",
      actorUserId: account.created_by as string,
      tenantId: account.tenant_id as string,
      emailAccountId: accountId,
    });
  }

  return { accessToken, account: account as Record<string, unknown> };
}

// ─── Gmail API Wrappers ─────────────────────────────────────

const METADATA_HEADERS = ["From", "To", "Cc", "Bcc", "Subject", "Date", "Message-ID", "In-Reply-To", "References", "Reply-To"];

export async function gmailListThreads(
  accessToken: string,
  opts: { maxResults?: number; q?: string; pageToken?: string }
): Promise<{ threads: Array<{ id: string; snippet: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    maxResults: String(opts.maxResults ?? 50),
    labelIds: "INBOX",
  });
  if (opts.q) params.set("q", opts.q);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? `Gmail API ${res.status}`);
  }
  const data = await res.json();
  return {
    threads: (data.threads ?? []).map((t: Record<string, string>) => ({ id: t.id, snippet: t.snippet ?? "" })),
    nextPageToken: data.nextPageToken,
  };
}

export async function gmailGetThread(
  accessToken: string,
  threadId: string,
  format: "metadata" | "full" = "metadata"
): Promise<Record<string, unknown>> {
  // Gmail API requires separate metadataHeaders params for each header name
  const params = new URLSearchParams({ format });
  if (format === "metadata") {
    for (const h of METADATA_HEADERS) {
      params.append("metadataHeaders", h);
    }
  }
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? `Gmail API ${res.status}`);
  }
  return await res.json();
}

export async function gmailGetMessage(
  accessToken: string,
  messageId: string,
  format: "full" | "raw" = "full"
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? `Gmail API ${res.status}`);
  }
  return await res.json();
}

export async function gmailSendMessage(
  accessToken: string,
  raw: string,
  threadId: string
): Promise<Record<string, unknown>> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? `Gmail send ${res.status}`);
  }
  return await res.json();
}

export async function gmailRevokeToken(accessToken: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: "POST" });
  } catch { /* best-effort */ }
}

// ─── Email parsing helpers ──────────────────────────────────
export function parseEmailHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h: { name: string; value: string }) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * RFC 2047 decode for MIME encoded-word headers.
 * Handles =?charset?B?base64?= and =?charset?Q?quoted-printable?=
 */
export function decodeRFC2047(input: string): string {
  if (!input || !input.includes("=?")) return input;

  // Remove folding whitespace between consecutive encoded words
  const normalized = input.replace(/\?=\s+=\?/g, "?==?");

  const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g;

  return normalized.replace(ENCODED_WORD_RE, (_match, charset, encoding, payload) => {
    try {
      const enc = (encoding as string).toUpperCase();
      let bytes: Uint8Array;

      if (enc === "B") {
        // Base64 decode
        const binary = atob(payload as string);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      } else {
        // Quoted-Printable: underscores → spaces, =XX → byte
        const raw = (payload as string).replace(/_/g, " ");
        const parts: number[] = [];
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === "=" && i + 2 < raw.length) {
            parts.push(parseInt(raw.substring(i + 1, i + 3), 16));
            i += 2;
          } else {
            parts.push(raw.charCodeAt(i));
          }
        }
        bytes = new Uint8Array(parts);
      }

      // Normalize charset
      const cs = (charset as string).toLowerCase().replace(/[^a-z0-9]/g, "");
      const charsetMap: Record<string, string> = {
        utf8: "utf-8", ascii: "utf-8", usascii: "utf-8",
        iso88591: "iso-8859-1", latin1: "iso-8859-1",
        windows1252: "windows-1252", cp1252: "windows-1252",
        gb2312: "gb18030", gbk: "gb18030",
        shiftjis: "shift_jis", sjis: "shift_jis",
      };
      const decoderCharset = charsetMap[cs] ?? charset;

      try {
        return new TextDecoder(decoderCharset as string).decode(bytes);
      } catch {
        return new TextDecoder("utf-8").decode(bytes);
      }
    } catch {
      return _match;
    }
  });
}

export function parseParticipants(headerValue: string): Array<{ name: string; email: string }> {
  if (!headerValue) return [];

  // First decode RFC2047 encoded words
  const decoded = decodeRFC2047(headerValue);

  return decoded.split(",").map((p: string) => {
    const trimmed = p.trim();
    // Match: "Name" <email> or Name <email> or <email>
    const match = trimmed.match(/^"?(.+?)"?\s*<([^>]+@[^>]+)>$/);
    if (match) return { name: match[1]?.trim() ?? "", email: match[2].trim() };
    // Just an email
    const emailOnly = trimmed.match(/^<?([^@\s<>]+@[^@\s<>]+)>?$/);
    if (emailOnly) return { name: "", email: emailOnly[1] };
    return { name: "", email: trimmed };
  }).filter(p => p.email); // Filter out empty entries
}

/**
 * Decode base64url data from Gmail API to UTF-8 string.
 * Gmail API returns body.data as base64url-encoded bytes.
 * CRITICAL: We must decode to bytes first, then to UTF-8.
 * Using atob() directly gives latin1 which corrupts non-ASCII text.
 */
export function decodeBase64UrlToUtf8(data: string): string {
  // Convert base64url to standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  // Decode to binary string (each char = one byte)
  const binary = atob(base64);
  // Convert to byte array
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Decode bytes as UTF-8
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Encode a UTF-8 string to base64url for Gmail API send.
 */
export function encodeUtf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function extractBody(payload: Record<string, unknown> | undefined): { plain: string; html: string } {
  if (!payload) return { plain: "", html: "" };

  let plain = "";
  let html = "";

  function walk(part: Record<string, unknown>) {
    const body = part.body as Record<string, unknown> | undefined;
    if (part.mimeType === "text/plain" && body?.data) {
      plain += decodeBase64UrlToUtf8(body.data as string);
    }
    if (part.mimeType === "text/html" && body?.data) {
      html += decodeBase64UrlToUtf8(body.data as string);
    }
    const parts = part.parts as Record<string, unknown>[] | undefined;
    if (parts) parts.forEach(walk);
  }

  const body = payload.body as Record<string, unknown> | undefined;
  if (body?.data && payload.mimeType === "text/plain") {
    plain = decodeBase64UrlToUtf8(body.data as string);
  } else if (body?.data && payload.mimeType === "text/html") {
    html = decodeBase64UrlToUtf8(body.data as string);
  }

  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) parts.forEach(walk);

  return { plain, html };
}

// ─── PostgREST injection escape ─────────────────────────────
export function escapePostgrestValue(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// ─── HTML Sanitizer (Deno-compatible, no JSDOM) ─────────────
const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "a", "b", "i", "u", "strong", "em",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th", "caption", "colgroup", "col",
  "img", "blockquote", "pre", "code", "hr", "center", "font", "small", "big",
  "sup", "sub", "dl", "dt", "dd", "address",
]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "class", "target", "width", "height", "style", "align", "valign", "bgcolor", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "dir", "lang", "title", "color", "size", "face"]);

export function sanitizeHtml(html: string): string {
  // Remove script and style tags entirely
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Remove event handler attributes
  clean = clean.replace(/\s+on\w+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, "");
  // Remove data: and javascript: URIs from src/href
  clean = clean.replace(/(src|href)\s*=\s*[\"']?\s*(data:|javascript:)[^\"'\s>]*/gi, "$1=\"\"");
  // Keep more tags for proper email rendering (tables, styling, etc.)
  // Only strip truly dangerous tags (script, style already removed above)
  return clean;
}

// ─── Frontend URL ───────────────────────────────────────────
export function getFrontendUrl(): string {
  return Deno.env.get("EMAIL_FRONTEND_URL") ?? "https://id-preview--1506bfa1-78f4-4bcf-9944-cd0360632153.lovable.app";
}
