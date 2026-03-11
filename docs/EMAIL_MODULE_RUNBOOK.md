# Email Module — End-to-End Runbook

> **Module**: Internal Gmail Management  
> **Version**: 3.0 (RBAC Shared Workspace)  
> **Last Audit**: 2026-02-21  
> **Applies To**: ROOMRISE CONTROL HUB

---

## Table of Contents

1. [Setup Prerequisites](#1-setup-prerequisites)
2. [Database Migration](#2-database-migration)
3. [Backend Service Configuration & Start](#3-backend-service-configuration--start)
4. [Google Cloud OAuth Setup](#4-google-cloud-oauth-setup)
5. [Frontend Integration Verification](#5-frontend-integration-verification)
6. [End-to-End Smoke Test](#6-end-to-end-smoke-test)
7. [Security Audit Summary](#7-security-audit-summary)
8. [Monitoring & Ops](#8-monitoring--ops)
9. [Rollback Procedure](#9-rollback-procedure)

---

## 1. Setup Prerequisites

| Requirement          | Version / Detail                             |
|----------------------|----------------------------------------------|
| Node.js              | ≥ 18 LTS                                    |
| npm / bun            | ≥ 9 / ≥ 1.0                                 |
| Supabase CLI         | ≥ 1.100                                     |
| Supabase Project     | Running, with service_role key + JWT secret  |
| Google Cloud Project | OAuth 2.0 consent screen configured          |

---

## 2. Database Migration

### 2.1 Apply Migration

```bash
supabase db push
# or apply manually:
psql $DATABASE_URL < supabase/migrations/20260220100001_email_module.sql
```

### 2.2 Tables Created

| Table                     | Purpose                                 | RLS  |
|---------------------------|-----------------------------------------|------|
| `email_accounts`          | Connected Gmail accounts + encrypted tokens | ✅ RBAC `has_email_access()` |
| `email_threads_mirror`    | Thread metadata (subject, snippet, participants) | ✅ RBAC |
| `email_messages_mirror`   | Individual messages (headers, sanitized body) | ✅ RBAC |
| `email_actions_audit`     | All actions logged for compliance       | ✅ admin-only SELECT |
| `email_oauth_states`      | CSRF-safe state tokens for OAuth flow   | ✅ service_role only |

### 2.3 Verify RLS

```sql
-- RBAC shared workspace model – policies use has_email_access() / has_role()
SELECT policyname, tablename, qual
  FROM pg_policies
 WHERE tablename LIKE 'email_%';
```

**Expected**: Policies use `has_email_access()` for SELECT and `has_role(auth.uid(), 'admin'::app_role)` for INSERT/UPDATE. No `tenant_id = auth.uid()` predicates.

**Permission Matrix**:

| Role | View Inbox | Reply | Manage Accounts | Audit Logs |
|------|-----------|-------|----------------|------------|
| admin | ✅ | ✅ | ✅ | ✅ |
| super_admin | ✅ | ✅ | ✅ | ✅ |
| cskh | ✅ | ✅ | ❌ | ❌ |
| sale | ✅ | ❌ | ❌ | ❌ |
| ke_toan | ❌ (403) | ❌ | ❌ | ❌ |
| ota_staff | ❌ (403) | ❌ | ❌ | ❌ |

### 2.4 Column-Level Security

```sql
-- Verify: authenticated role CANNOT select token_cipher / refresh_cipher
SELECT grantee, privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE table_name = 'email_accounts'
   AND grantee = 'authenticated';
```

`token_cipher` and `refresh_cipher` must NOT appear in the result.

---

## 3. Backend Service Configuration & Start

### 3.1 Install Dependencies

```bash
cd services/email-service
npm install
```

### 3.2 Configure Environment

```bash
cp .env.example .env
# Fill in all required values:
```

| Variable                | Required | Description |
|-------------------------|----------|-------------|
| `SUPABASE_URL`          | ✅       | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅  | From Supabase dashboard |
| `SUPABASE_JWT_SECRET`   | ✅       | From Supabase → Settings → API → JWT Secret |
| `GOOGLE_CLIENT_ID`      | ✅       | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET`  | ✅       | Google Cloud Console |
| `GOOGLE_REDIRECT_URI`   | ✅       | `http://localhost:4100/email/gmail/callback` |
| `TOKEN_ENCRYPTION_KEY`  | ✅       | 64 hex chars (32 bytes). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FRONTEND_URL`          | ✅       | `http://localhost:5173` |
| `PORT`                  | ❌       | Default: `4100` |
| `SYNC_CRON`             | ❌       | Default: `*/2 * * * *` |
| `SYNC_MAX_THREADS`      | ❌       | Default: `50` |
| `SYNC_LOCK_STALE_MIN`   | ❌       | Default: `10` |

### 3.3 Start Service

```bash
# Development
npx tsx watch src/index.ts

# Production
npx tsx src/index.ts
```

### 3.4 Health Check

```bash
curl http://localhost:4100/health
# → {"status":"ok","service":"email-service","timestamp":"..."}
```

---

## 4. Google Cloud OAuth Setup

### 4.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized redirect URI: `http://localhost:4100/email/gmail/callback`
4. Copy Client ID + Client Secret to `.env`

### 4.2 Enable Gmail API

1. APIs & Services → Library → Search "Gmail API" → Enable
2. Also enable "Google OAuth2 API" (for userinfo endpoint)

### 4.3 Configure Consent Screen

1. OAuth consent screen → External (or Internal for Workspace)
2. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` (READ_ONLY)
   - `https://www.googleapis.com/auth/gmail.send` (REPLY scope)
   - `https://www.googleapis.com/auth/userinfo.email`

### 4.4 Production Setup

For production, update:
- `GOOGLE_REDIRECT_URI` → `https://api.yourdomain.com/email/gmail/callback`
- `FRONTEND_URL` → `https://app.yourdomain.com`
- Submit app for Google verification if > 100 users

---

## 5. Frontend Integration Verification

### 5.1 Environment Variable

In the frontend `.env` (or `.env.local`):

```bash
VITE_EMAIL_SERVICE_URL=http://localhost:4100
```

### 5.2 Routes Available

| Route                    | Page                  |
|--------------------------|-----------------------|
| `/email`                 | → redirects to `/email/inbox` |
| `/email/accounts`        | Account management    |
| `/email/inbox`           | Thread list           |
| `/email/thread/:id`      | Thread detail + reply |

### 5.3 Navigation

"Email" group with Mail icon appears in the sidebar navigation under `src/constants/navigation.ts`.

---

## 6. End-to-End Smoke Test

### Step-by-step verification:

```
□ 1. Start backend:         cd services/email-service && npx tsx src/index.ts
□ 2. Start frontend:        npm run dev
□ 3. Login to Control Hub
□ 4. Navigate to /email/accounts
□ 5. Click "Kết nối Gmail" → Opens Google OAuth consent
□ 6. Authorize → Redirected back to /email/accounts?connected=your@gmail.com
□ 7. Verify account card shows ACTIVE status + email address
□ 8. Navigate to /email/inbox
□ 9. Wait ~2 min for auto-sync OR click manual sync
□ 10. Thread list populates with INBOX threads
□ 11. Click a thread → Messages load (lazy body fetch)
□ 12. Verify HTML email renders correctly (no script tags, no iframes)
□ 13. Type reply → Click send
□ 14. Verify "Đã gửi" badge appears on outbound message
□ 15. Check Gmail web — reply appears in same thread
□ 16. Navigate to /email/accounts → Disconnect account
□ 17. Verify account status changes to REVOKED, threads hidden
□ 18. Check email_actions_audit table — all actions logged
```

### Verification Queries

```sql
-- Check connected accounts (shared workspace – all visible to email roles)
SELECT id, email_address, status, scope_level, visibility, last_sync_at
  FROM email_accounts
 ORDER BY created_at DESC;

-- Check synced threads (shared inbox)
SELECT subject, snippet, unread_count, last_message_at
  FROM email_threads_mirror
 ORDER BY last_message_at DESC
 LIMIT 10;

-- Check audit trail (admin only via RLS)
SELECT action, actor_user_id, created_at, meta
  FROM email_actions_audit
 ORDER BY created_at DESC
 LIMIT 20;

-- Check OAuth states (should be empty after callback)
SELECT * FROM email_oauth_states WHERE used_at IS NULL;
```

### 6.2 Scale Smoke Test – RBAC Shared Workspace

This test validates the shared workspace model with role-based access control.

**Prerequisites**: Test accounts with roles: admin, cskh, sale, ke_toan.

#### Phase 1: Connect Accounts (Admin Only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as **admin** | Dashboard loads |
| 2 | Navigate to `/email/accounts` | Empty or existing account list |
| 3 | Connect Gmail 1 (REPLY scope) | Card shows ACTIVE + TEAM badge |
| 4 | Connect Gmail 2-5 (mix READ_ONLY + REPLY) | 5 cards total, each correct scope |
| 5 | Verify Connect/Disconnect/Sync buttons visible | ✅ (admin has manage rights) |
| 6 | Logout → Login as **cskh** | |
| 7 | Navigate to `/email/accounts` | **Sees all 5 accounts** (shared workspace) |
| 8 | Verify NO Connect/Disconnect/Sync buttons | ✅ (cskh lacks manage rights) |
| 9 | Logout → Login as **sale** | |
| 10 | Navigate to `/email/accounts` | **Sees all 5 accounts** (view only) |
| 11 | Logout → Login as **ke_toan** | |
| 12 | Navigate to `/email/accounts` | **403 / empty** (no email access) |

```sql
-- Verify: all accounts visible (no tenant filter)
SELECT email_address, status, visibility FROM email_accounts;
-- → 5 rows, all visibility='TEAM'
```

#### Phase 2: Shared Inbox + Per-Account Filtering

| Step | Action | Expected |
|------|--------|----------|
| 9 | As admin → `/email/inbox` | All threads from all accounts, sorted by date |
| 10 | As cskh → `/email/inbox` | Same threads visible (shared) |
| 11 | As sale → `/email/inbox` | Same threads visible (read only) |
| 12 | Filter: select account 1 only | Threads from account 1 only |
| 13 | Filter: "all" | All threads return |
| 14 | Search: enter subject keyword | Matches across all accounts |

```sql
-- Verify shared threads (no tenant filter)
SELECT t.subject, ea.email_address
  FROM email_threads_mirror t
  JOIN email_accounts ea ON ea.id = t.email_account_id
 ORDER BY t.last_message_at DESC
 LIMIT 20;
```

#### Phase 3: Reply Threading (Role-Gated)

| Step | Action | Expected |
|------|--------|----------|
| 15 | As admin: open thread from acct 1 (REPLY scope) | Messages load, reply composer visible |
| 16 | Send reply | "Đã gửi" badge, message appended in thread |
| 17 | As cskh: open same thread | Reply composer visible (cskh can reply) |
| 18 | As sale: open same thread | Reply composer hidden (sale = view only) |

#### Phase 4: RBAC Permission Verification

| Step | Action | Expected |
|------|--------|----------|
| 19 | As sale, try POST reply | **403 Insufficient permissions** |
| 20 | As cskh, try POST `/email/sync/<acct-id>` | **403 Insufficient permissions** |
| 21 | As ke_toan, try GET `/email/accounts` | **403 Insufficient permissions** |
| 22 | As admin, POST `/email/sync/<acct-id>` | **200 success** |

```sql
-- Verify RBAC policies are in effect
SELECT policyname, qual FROM pg_policies WHERE tablename = 'email_accounts';
-- → email_accounts_rbac_select, email_accounts_rbac_insert, email_accounts_rbac_update
-- All use has_email_access() or has_role()
```

#### Phase 5: Disconnect + Cleanup

| Step | Action | Expected |
|------|--------|----------|
| 22 | As User A, disconnect A3 | A3 card → REVOKED |
| 23 | Navigate to inbox | A3 threads no longer appear in sync |
| 24 | Reconnect A3 (REPLY scope) | Card returns ACTIVE, sync resumes |
| 25 | Verify audit trail | ACCOUNT_DISCONNECT + ACCOUNT_CONNECT logged |

---

## 7. Security Audit Summary

### 7.1 Audit #1 — JWT / User Context

| Check | Status | Evidence |
|-------|--------|----------|
| Backend reads `sub` claim as `userId` | ✅ PASS | `middleware/auth.ts`: `const userId = decoded.sub as string` |
| App role fetched from `user_roles` table | ✅ PASS | `middleware/auth.ts`: `serviceSupabase.rpc('get_user_role', { _user_id: userId })` |
| Missing sub → 403 | ✅ PASS | `middleware/auth.ts`: `if (!userId) { res.status(403)...` |
| JWT verified with HS256 | ✅ PASS | `middleware/auth.ts`: `algorithms: ['HS256']` |
| Role guards enforce permission matrix | ✅ PASS | `requireEmailView`, `requireEmailReply`, `requireEmailManage` middleware |

**v2 → v3 CHANGE**: Removed `tenantId = userId` personal inbox model. Replaced with RBAC shared workspace: `appRole` fetched per-request from `get_user_role()` RPC.

### 7.2 Audit #2 — RLS / Token Deny

| Check | Status | Evidence |
|-------|--------|----------|
| All 4 data tables have RLS enabled | ✅ PASS | Migration: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |
| SELECT uses `has_email_access()` (RBAC) | ✅ PASS | Migration: `email_accounts_rbac_select`, `email_threads_rbac_select`, `email_messages_rbac_select` |
| INSERT/UPDATE on accounts: admin only | ✅ PASS | Migration: `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)` |
| No INSERT/UPDATE for authenticated on threads/messages | ✅ PASS | Writes only via service_role (sync worker) |
| `token_cipher` + `refresh_cipher` denied to client | ✅ PASS | Migration: `REVOKE ALL ... FROM authenticated` + column-level GRANT excluding token columns |
| `email_oauth_states` locked to service_role | ✅ PASS | Migration: `GRANT ALL ... TO service_role` + `REVOKE ALL ... FROM anon, authenticated` |
| `visibility` column controls account-level access | ✅ PASS | `email_accounts_rbac_select`: `visibility = 'TEAM' OR created_by = auth.uid()` |

**v2 → v3 CHANGE**: Replaced all 11 `tenant_id = auth.uid()` policies with 7 RBAC policies using `has_email_access()` / `has_role()` functions.

### 7.3 Audit #3 — OAuth State Security

| Check | Status | Evidence |
|-------|--------|----------|
| State persisted in DB (survives restart) | ✅ PASS | `oauth.ts` L29-37: `createOAuthState()` inserts into `email_oauth_states` |
| Atomic claim (UPDATE…RETURNING, single-use) | ✅ PASS | `oauth.ts` L45-56: `.update({used_at})` with `.is('used_at', null)` + `.gte('expires_at', ...)` |
| 10 min TTL | ✅ PASS | `oauth.ts` L26: `STATE_TTL_MIN = 10` |
| Expired states cleaned up | ✅ PASS | `oauth.ts` L197-202: `setInterval` deletes states older than 1h every 15 min |
| Replay attack prevented | ✅ PASS | Atomic `used_at` ensures single-use |

**v1 BUG FIXED**: State was stored in `Map<>` (in-memory) → lost on process restart, not shareable across instances, no atomic claim.

### 7.4 Audit #4 — Reply Threading (RFC 2822)

| Check | Status | Evidence |
|-------|--------|----------|
| `In-Reply-To` set from last message's `Message-ID` | ✅ PASS | `reply.ts` L78-79: `messageId = lastMessage?.headers?.['Message-ID']` → passed as `inReplyTo` |
| `References` chain built correctly | ✅ PASS | `reply.ts` L80: `references = existingRefs ? ${existingRefs} ${messageId} : messageId` |
| `threadId` passed to Gmail API | ✅ PASS | `reply.ts` L90: `threadId: thread.provider_thread_id` |
| Subject prefixed with `Re:` (idempotent) | ✅ PASS | `reply.ts` L81-83: checks `startsWith('Re:')` before prepending |
| Account scope check (READ_ONLY blocked) | ✅ PASS | `reply.ts` L67: `if (account.scope_level === 'READ_ONLY')` → 403 |
| Outbound message stored in mirror | ✅ PASS | `reply.ts` L95-118: INSERT into `email_messages_mirror` with `direction: 'OUTBOUND'` |

### 7.5 Audit #5 — HTML Sanitization

| Check | Status | Evidence |
|-------|--------|----------|
| Server-side DOMPurify with allowlist | ✅ PASS | `threads.ts` L105-116: `ALLOWED_TAGS` + `ALLOWED_ATTR` |
| `style` attribute removed | ✅ PASS | `threads.ts` L114: `ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target']` (no `style`) |
| `ALLOW_DATA_ATTR: false` | ✅ PASS | `threads.ts` L115 |
| Client-side re-sanitize (defense-in-depth) | ✅ PASS | `ThreadDetail.tsx` L87-98: `DOMPurify.sanitize()` with same allowlist before `dangerouslySetInnerHTML` |
| No `<script>`, `<iframe>`, `onXxx` handlers | ✅ PASS | Only allowlisted tags/attrs pass through both layers |

**v1 BUG FIXED**: `style` attribute was allowed (CSS data-exfil via `background-image: url(...)`). Client had no re-sanitization.

### 7.6 Audit #6 — Sync Quota / Backoff

| Check | Status | Evidence |
|-------|--------|----------|
| Exponential backoff on 429 | ✅ PASS | `syncWorker.ts` L224-228: `BACKOFF_BASE_MS * 2^consecutiveErrors` ms wait on 429 |
| Circuit breaker (3 consecutive → ERROR) | ✅ PASS | `syncWorker.ts` L231: `if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS)` → status=ERROR |
| Concurrency lock (prevents dual-sync) | ✅ PASS | `syncWorker.ts` L49-65: `acquireSyncLock()` / `releaseSyncLock()` via `syncing_since` column |
| Stale lock auto-expires | ✅ PASS | `syncWorker.ts` L51: `SYNC_LOCK_STALE_MIN` (default 10 min) threshold |
| Lock released in finally block | ✅ PASS | `syncWorker.ts` L275: `finally { await releaseSyncLock(accountId) }` |
| Config tunable via env | ✅ PASS | `syncWorker.ts` L26-31: `SYNC_CRON`, `SYNC_MAX_THREADS`, etc. from `process.env` |
| Inter-account delay | ✅ PASS | `syncWorker.ts` L298: `await sleep(SYNC_INTER_DELAY)` |
| Manual sync verifies tenant ownership | ✅ PASS | `sync.ts` L21-28: `.eq('tenant_id', req.auth!.tenantId)` check before sync |

**v1 BUGS FIXED**: (a) No concurrency lock → dual sync possible. (b) Manual sync had no tenant check → IDOR. (c) All params hardcoded.

---

## 8. Monitoring & Ops

### 8.1 Audit Log Queries

```sql
-- All errors in last 24h
SELECT * FROM email_actions_audit
 WHERE action IN ('SYNC_ERROR', 'ACCOUNT_ERROR', 'REPLY_ERROR')
   AND created_at > now() - interval '24 hours'
 ORDER BY created_at DESC;

-- Accounts in ERROR state
SELECT id, email_address, error_code, error_at
  FROM email_accounts
 WHERE status = 'ERROR';

-- Stuck sync locks (older than 10 min)
SELECT id, email_address, syncing_since
  FROM email_accounts
 WHERE syncing_since IS NOT NULL
   AND syncing_since < now() - interval '10 minutes';
```

### 8.2 Recovery: Reset Stuck Account

```sql
UPDATE email_accounts
   SET status = 'ACTIVE', error_code = NULL, error_at = NULL, syncing_since = NULL
 WHERE id = '<account-id>';
```

### 8.3 Token Rotation

If `TOKEN_ENCRYPTION_KEY` is compromised:

1. Generate new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `.env` with new key
3. All existing accounts will fail to decrypt → users must re-connect via OAuth
4. Or: write a migration script to re-encrypt with old key → new key

---

## 9. Rollback Procedure

### 9.1 Remove Email Module (Reversible)

```sql
-- Drop tables (cascades all data)
DROP TABLE IF EXISTS public.email_messages_mirror CASCADE;
DROP TABLE IF EXISTS public.email_threads_mirror CASCADE;
DROP TABLE IF EXISTS public.email_actions_audit CASCADE;
DROP TABLE IF EXISTS public.email_oauth_states CASCADE;
DROP TABLE IF EXISTS public.email_accounts CASCADE;
DROP FUNCTION IF EXISTS public.email_set_updated_at() CASCADE;
```

### 9.2 Revert Frontend

1. Remove routes from `src/App.tsx` (4 email routes)
2. Remove "Email" group from `src/constants/navigation.ts`
3. Delete `src/modules/email/` directory
4. Delete `src/pages/email/` directory
5. Delete `src/types/email.ts`
6. `npm uninstall dompurify @types/dompurify`

### 9.3 Revert Backend

```bash
rm -rf services/email-service/
```

---

## Appendix: File Inventory

| File | Purpose |
|------|---------|
| `supabase/migrations/20260220100001_email_module.sql` | 5 tables + RLS + triggers |
| `services/email-service/src/index.ts` | Express server entry |
| `services/email-service/src/config.ts` | Env var validation (Zod) |
| `services/email-service/src/middleware/auth.ts` | JWT verification + tenant extraction |
| `services/email-service/src/routes/oauth.ts` | Connect / Callback / Disconnect |
| `services/email-service/src/routes/threads.ts` | Thread list + detail + sanitization |
| `services/email-service/src/routes/reply.ts` | Send reply with threading headers |
| `services/email-service/src/routes/sync.ts` | Manual sync trigger (tenant-checked) |
| `services/email-service/src/workers/syncWorker.ts` | Cron sync + backoff + circuit breaker |
| `services/email-service/src/lib/gmail.ts` | Gmail API wrappers |
| `services/email-service/src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `services/email-service/src/lib/supabase.ts` | service_role Supabase client |
| `services/email-service/src/lib/audit.ts` | Structured audit logging |
| `src/modules/email/api.ts` | Frontend API client |
| `src/modules/email/hooks/useEmailAccounts.ts` | React Query hooks for accounts |
| `src/modules/email/hooks/useEmailThreads.ts` | React Query hooks for threads |
| `src/modules/email/components/*.tsx` | UI components (7 files) |
| `src/pages/email/*.tsx` | Page components (3 files) |
| `src/types/email.ts` | Shared TypeScript types |
