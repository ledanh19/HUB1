# EMAIL MODULE – Test Plan & Acceptance Checklist

## Golden Scenarios

### PHASE 1: OAuth Multi-Account

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 1.1 | Connect Gmail (READ_ONLY) | Click "Thêm Gmail (Đọc)" → Google consent → allow | Account appears ACTIVE, scope=READ_ONLY, db: token_cipher + refresh_cipher NOT null, NOT plain text | ☐ |
| 1.2 | Connect Gmail (REPLY) | Click "Thêm Gmail (Đọc + Trả lời)" → consent | Account ACTIVE, scope=REPLY | ☐ |
| 1.3 | Connect same email twice | Same email, same tenant | Upserts (re-activates), no duplicate | ☐ |
| 1.4 | OAuth denied | User clicks "Cancel" on Google consent | Redirect with error=oauth_denied, toast shown | ☐ |
| 1.5 | State TTL expired | Wait >10min then callback | error=invalid_state | ☐ |
| 1.6 | Connect 10 accounts | Add 10 different Gmail accounts | All listed, no performance issue | ☐ |
| 1.7 | Token NOT in frontend | Inspect network tab, check Supabase queries | token_cipher, refresh_cipher columns NEVER returned to browser | ☐ |
| 1.8 | Token NOT logged | Check backend stdout, Supabase logs | No raw token in any log | ☐ |

### PHASE 2: Sync MVP

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 2.1 | Auto sync | Wait ≤3 min after connect | Threads appear in inbox UI | ☐ |
| 2.2 | Manual sync | Click "Sync" on account card | Threads refresh, last_sync_at updated | ☐ |
| 2.3 | Unified inbox | Filter = "All accounts" | Shows threads from all accounts | ☐ |
| 2.4 | Filter by account | Select specific account in dropdown | Only that account's threads shown | ☐ |
| 2.5 | Filter by label | Select "Hộp thư đến" vs "Đã gửi" | Correct label filtering | ☐ |
| 2.6 | Search | Type query in search box | Threads matching subject/snippet shown | ☐ |
| 2.7 | Thread detail | Click thread → open detail | Messages timeline correct chronological order | ☐ |
| 2.8 | Lazy-load body | Open thread first time | body_plain + body_html_sanitized fetched and stored | ☐ |
| 2.9 | HTML sanitized | Open thread with HTML email | No `<script>`, no `<iframe>`, no event handlers, UI not broken | ☐ |
| 2.10 | Rate limit 429 | Simulate 429 from Gmail | Backoff applied, no crash, continues after delay | ☐ |
| 2.11 | Circuit breaker | Simulate 3+ consecutive errors | Account → status=ERROR, error_code set, audit logged | ☐ |
| 2.12 | Error account in UI | Account with status=ERROR | Card shows error badge, error_code visible | ☐ |

### PHASE 3: Reply

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 3.1 | Reply send | Open thread → type reply → send | Mail arrives in recipient inbox, within same Gmail thread | ☐ |
| 3.2 | Threading headers | Check sent message raw headers | In-Reply-To = original Message-ID, References chain correct | ☐ |
| 3.3 | Reply + CC | Add CC → send | CC recipient receives email | ☐ |
| 3.4 | OUTBOUND in mirror | After reply | New OUTBOUND message row in email_messages_mirror | ☐ |
| 3.5 | Audit log REPLY_SEND | After reply | Audit entry: action=REPLY_SEND, to, subject, provider_message_id | ☐ |
| 3.6 | READ_ONLY cannot reply | Account scope=READ_ONLY | Reply composer disabled, shows message about scope | ☐ |
| 3.7 | REVOKED cannot reply | Account status=REVOKED | Reply returns error, no send attempt | ☐ |

### PHASE 4: Disconnect

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 4.1 | Disconnect account | Click "Ngắt kết nối" | status=REVOKED, tokens cleared, sync stops | ☐ |
| 4.2 | Threads preserved | After disconnect | Historical threads still visible in inbox (read-only) | ☐ |
| 4.3 | Reply blocked after disconnect | Try reply on disconnected account's thread | Error: account not active | ☐ |
| 4.4 | Reconnect | Disconnect then connect same email | Account re-activated, new tokens stored | ☐ |

### PHASE 5: Security & RLS

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 5.1 | Tenant A ≠ Tenant B | Login as tenant A, query tenant B's threads | 0 results from Supabase RLS | ☐ |
| 5.2 | Client token columns | Direct Supabase query from browser for email_accounts | token_cipher, refresh_cipher: permission denied | ☐ |
| 5.3 | No token in API response | GET /email/accounts response | No token_cipher/refresh_cipher fields | ☐ |
| 5.4 | Token refresh | Wait for access_token expiry | Auto-refresh via google-auth, no user re-auth needed | ☐ |
| 5.5 | Encryption at rest | Check DB directly (service_role) | token_cipher format = "iv:ciphertext:tag" (hex), not plain | ☐ |
| 5.6 | JWT validation | Call API with expired/invalid JWT | 401 Unauthorized | ☐ |
| 5.7 | Missing tenant_id in JWT | Token without tenant_id claim | 403 Forbidden | ☐ |

### PHASE 6: Quota & Rate Limits

| # | Scenario | Steps | Expected | Pass? |
|---|----------|-------|----------|-------|
| 6.1 | Gmail API quota | Sync accounts rapidly | Per-account throttle, backoff on 429 | ☐ |
| 6.2 | Worker not crash | Trigger sync with network issues | Worker logs error, continues next account | ☐ |
| 6.3 | Concurrent sync safety | Two sync triggers for same account | No duplicate threads, upsert idempotent | ☐ |

### UI/UX

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| U.1 | Dark mode | All email pages consistent with app dark theme | ☐ |
| U.2 | Light mode | All email pages consistent with app light theme | ☐ |
| U.3 | Mobile responsive | Inbox + thread detail usable on 375px width | ☐ |
| U.4 | Loading states | Skeleton placeholders while loading | ☐ |
| U.5 | Empty state | No accounts / no threads → helpful messages | ☐ |
| U.6 | Error toast | API errors → sonner toast | ☐ |

---

## File Inventory

```
supabase/migrations/20260220100001_email_module.sql
services/email-service/
  package.json, tsconfig.json, .env.example
  src/
    index.ts, config.ts
    lib/crypto.ts, audit.ts, gmail.ts, supabase.ts
    middleware/auth.ts
    routes/oauth.ts, threads.ts, reply.ts, sync.ts
    workers/syncWorker.ts
src/types/email.ts
src/modules/email/
  index.ts, api.ts
  hooks/index.ts, useEmailAccounts.ts, useEmailThreads.ts, useEmailThreadDetail.ts, useEmailReply.ts
  components/index.ts, EmailAccountCard.tsx, EmailFilters.tsx, ThreadList.tsx, ThreadListItem.tsx, ThreadDetail.tsx, ReplyComposer.tsx
src/pages/email/
  index.ts, EmailAccountsPage.tsx, EmailInboxPage.tsx, EmailThreadDetailPage.tsx
src/App.tsx              (updated: +4 routes)
src/constants/navigation.ts (updated: +Email nav group, +Mail icon import)
```

## Startup Commands

```bash
# 1. Run migration
cd supabase && supabase db push

# 2. Backend
cd services/email-service
cp .env.example .env    # fill in values
npm install
npm run dev             # http://localhost:4100

# 3. Frontend
# Add to .env: VITE_EMAIL_SERVICE_URL=http://localhost:4100
npm run dev             # http://localhost:5173
```
