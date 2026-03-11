# Email V2 — Realtime Audit Report

**Date:** 2026-02-27  
**Auditor:** Antigravity AI

---

## Verdict

> **Email V2 is NOT REALTIME. It uses polling (stale timeout) only.**

| Layer | Mechanism | Interval | Table |
|-------|-----------|----------|-------|
| UI Thread List | React Query `staleTime` | 60s | `email_threads_mirror` (V1) |
| UI Messages | React Query `staleTime` | 30s | `email_messages_mirror` (V1) |
| Accounts | React Query `refetchInterval` | 30s | `email_accounts` |
| Supabase Realtime | **None** | — | — |

**No `supabase.channel()` or `postgres_changes` subscription exists anywhere in the email module.**

---

## A) UI Realtime

### Subscribed Tables: **NONE**

Searched all files under `src/modules/email/` for:
- `supabase.channel` → 0 results
- `postgres_changes` → 0 results
- `.on('postgres` → 0 results

### Current Data Flow
```
V2 hooks (useOperationalThreads, useOperationalMessages)
  └── READ FROM: email_threads_mirror / email_messages_mirror (V1 tables)
  └── NOT FROM: email_threads / email_messages (V2 tables)
```

V2 components display data from V1 mirror, with client-side tag classification.

---

## B) Polling

| Hook | `staleTime` | `refetchInterval` | Source Table |
|------|-------------|-------------------|--------------|
| `useOperationalThreads` | 60,000ms | **None** | `email_threads_mirror` |
| `useOperationalMessages` | 30,000ms | **None** | `email_messages_mirror` |
| `useEmailThreads` (V1) | n/a | 60,000ms | `email_threads_mirror` |
| `useEmailAccounts` | n/a | 30,000ms | `email_accounts` |

> [!CAUTION]
> `useOperationalThreads` has `staleTime: 60_000` but **no `refetchInterval`**. This means data only refreshes when the query is **re-mounted**, not periodically. New emails won't appear unless user navigates away and back.

---

## C) Inbound Realtime (Edge Function → DB)

### Sync Path (`email-sync-trigger`)
```
Gmail API → email-sync-trigger edge function
  └── WRITES TO: email_threads (V2)
  └── WRITES TO: email_messages (V2)
  └── DOES NOT WRITE TO: email_threads_mirror (V1)
  └── DOES NOT WRITE TO: email_messages_mirror (V1)
```

### Reply Path (`email-reply`)
```
User reply → email-reply edge function
  └── READS FROM: email_threads_mirror (V1)
  └── WRITES TO: email_messages_mirror (V1)
  └── WRITES TO: email_threads_mirror (V1)
  └── DOES NOT WRITE TO: email_threads (V2)
  └── DOES NOT WRITE TO: email_messages (V2)
```

> [!CAUTION]
> **SOT SPLIT DETECTED**
> - `email-sync-trigger` writes **only to V2** tables
> - `email-reply` writes **only to V1 mirror** tables
> - UI reads **only from V1 mirror** tables
> 
> **Result:** Synced emails go to V2 tables but are invisible to UI. Replies go to V1 mirror. Neither side can see the other's data.

---

## D) Schema Gap Analysis

### V2 `email_messages` — Missing Columns

| Column | Required | Status |
|--------|----------|--------|
| `direction` | ✅ | Exists (INBOUND/OUTBOUND) |
| `status` | ❌ | **Missing** (DRAFT/PENDING/SENT/FAILED/MOCK_SENT) |
| `sent_at` | ❌ | **Missing** |
| `error_code` | ❌ | **Missing** |
| `error_message` | ❌ | **Missing** |
| `client_request_id` | ❌ | **Missing** |
| `email_account_id` | ✅ | Exists |

### V2 `email_threads` — Missing Columns

| Column | Required | Status |
|--------|----------|--------|
| `primary_participant_email` | ❌ | **Missing** (only has `primary_participant` text) |
| `primary_participant_name` | ❌ | **Missing** |
| `tag_source` | ❌ | **Missing** |

### Missing Tables

| Table | Status |
|-------|--------|
| `email_attachments` | **Does not exist** |

### Audit Log Constraint Gap

Current CHECK: `('MARK_DONE', 'REOPEN', 'ASSIGN', 'CHANGE_PRIORITY', 'CHANGE_TAG')`  
Missing: `SEND_REPLY`, `SEND_FORWARD`

---

## Recommendations

1. **Implement Supabase Realtime** subscriptions on V1 mirror tables (immediate path) with tenant_id filter
2. **Add `refetchInterval`** to `useOperationalThreads` as stopgap
3. **Fix SOT split**: Either make sync-trigger write to BOTH V1+V2, or make UI read from V2 with V1 fallback via unified view
4. **Add missing schema columns** via additive migration
5. **Create `email_attachments` table**
6. **Fix `email-reply`** to write to V2 tables (or both)
