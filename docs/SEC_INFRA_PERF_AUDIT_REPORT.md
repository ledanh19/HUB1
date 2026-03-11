# 🔒 SECURITY / INFRASTRUCTURE / PERFORMANCE AUDIT REPORT

**System:** Roomrise Control Hub  
**Date:** 31/12/2024  
**Auditor:** Enterprise Security & Performance Auditor  
**Scope:** Security posture, Infrastructure readiness, Performance @ scale

---

## 📋 TABLE OF CONTENTS

1. [Coverage Map](#1-coverage-map)
2. [Security Report](#2-security-report)
3. [Infrastructure Report](#3-infrastructure-report)
4. [Performance Report](#4-performance-report)
5. [PASS/FAIL Summary](#5-passfail-summary)
6. [Action Plan](#6-action-plan)

---

# 1. COVERAGE MAP

## 1.1 Security Surface - Frontend

| File | Purpose | Findings |
|------|---------|----------|
| [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts#L1-17) | Supabase client init | ✅ Uses `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) |
| [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx) | Auth context | ✅ Uses supabase.auth correctly |
| [src/components/layout/ProtectedRoute.tsx](src/components/layout/ProtectedRoute.tsx) | Route guard | ✅ Checks auth state |
| [src/hooks/useCashOuts.ts#L100-200](src/hooks/useCashOuts.ts#L100-200) | Financial mutations | 🔴 Race condition on remaining check |
| [src/hooks/useAuditLog.ts](src/hooks/useAuditLog.ts#L1-52) | Audit logging | ⚠️ Silent fail (console.error only) |
| [src/hooks/useRealtimeSystem.ts](src/hooks/useRealtimeSystem.ts#L1-100) | Realtime subscriptions | ⚠️ 18 tables globally subscribed |

## 1.2 Security Surface - Supabase

| File | Purpose | Findings |
|------|---------|----------|
| [supabase/config.toml](supabase/config.toml) | Edge function config | 🔴 ALL 23 functions have `verify_jwt = false` |
| [supabase/migrations/20251214075415*.sql](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L521-631) | Core RLS policies | ⚠️ Most use `authenticated USING (true)` |
| [supabase/migrations/20251218092321*.sql](supabase/migrations/20251218092321_ea8e2142-ecf7-4989-a93a-7de7f309c7c6.sql#L117-126) | cash_outs RLS | ✅ INSERT restricted to admin/ke_toan |
| [supabase/migrations/20251218092448*.sql](supabase/migrations/20251218092448_a144227d-1466-436d-a056-c54d7cf7f8ae.sql#L153-166) | payment_requests RLS | 🔴 USING(true) for all ops |

## 1.3 Performance Surface - Frontend

| File | Purpose | Findings |
|------|---------|----------|
| [src/hooks/useBookings.ts](src/hooks/useBookings.ts) | Booking data | Heavy query with joins |
| [src/pages/BookingsPage.tsx](src/pages/BookingsPage.tsx) | Booking list | ⚠️ No virtualization for large lists |
| [src/pages/AuditLogsPage.tsx](src/pages/AuditLogsPage.tsx) | Audit logs | ⚠️ Can grow unbounded |
| [src/components/inventory/InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) | Inventory grid | ⚠️ N×M cells rendered |

## 1.4 Performance Surface - Database

| File | Purpose | Findings |
|------|---------|----------|
| [unified_bookings view](supabase/migrations/20251214081729_53c51019-649d-4bad-92ed-e9f3aec28999.sql#L5-47) | UNION view | ⚠️ No index optimization |
| [Index migrations](supabase/migrations/20251214081452_7202d5de-3119-445f-8772-0b271f36db4a.sql#L121-131) | Indexes | ✅ Good coverage on date/status |

## 1.5 Infrastructure Surface

| File | Purpose | Findings |
|------|---------|----------|
| [package.json](package.json) | Build config | ⚠️ No typecheck in build script |
| [vite.config.ts](vite.config.ts) | Vite config | ✅ Standard setup |
| [supabase/functions/channex-webhook](supabase/functions/channex-webhook/index.ts#L8-31) | Webhook handler | ✅ HMAC signature verification |

---

# 2. SECURITY REPORT

## 2.1 Threat Model

### Assets to Protect
| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Financial data (cash_outs, payment_requests) | 🔴 CRITICAL | DB tables |
| Guest documents (CCCD, passport) | 🔴 CRITICAL | Storage bucket + guest_documents table |
| OTA API credentials | 🟠 HIGH | Deno.env (edge functions) |
| Booking revenue data | 🟠 HIGH | revenue_entries, cashflow_entries |
| Messages content | 🟡 MEDIUM | messages, conversations tables |

### Actors
| Actor | Access Level | Threat Potential |
|-------|--------------|------------------|
| super_admin | Full access | Insider threat |
| ke_toan | Financial ops | Overpay/fraud |
| ops/cskh | Booking ops | Data exfiltration |
| partner_staff | Limited | Cross-tenant access |
| authenticated_attacker | Any authenticated user | IDOR, RLS bypass |
| unauthenticated_attacker | Public | Edge function abuse |

### Attack Vectors
| Vector | Risk | Current Mitigation |
|--------|------|-------------------|
| RLS bypass | HIGH | ⚠️ Weak - most policies use USING(true) |
| Key leakage | LOW | ✅ Frontend uses anon key only |
| Edge function abuse | HIGH | 🔴 verify_jwt=false on all functions |
| IDOR | MEDIUM | ⚠️ No tenant filter in most tables |
| Race condition (double spend) | CRITICAL | 🔴 Frontend-only check |
| Data exfil via realtime | MEDIUM | ⚠️ All authenticated can subscribe |

---

## 2.2 RLS MATRIX (Critical Tables)

| Table | SELECT | INSERT | UPDATE | DELETE | Tenant Filter | Risk |
|-------|--------|--------|--------|--------|---------------|------|
| **payment_requests** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **cash_outs** | authenticated (true) | admin/ke_toan | ❌ | ❌ | ❌ NO | 🟡 MEDIUM |
| **host_payables** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **host_settlements** | authenticated (true) | ke_toan/admin | ke_toan/admin | ❌ | ❌ NO | 🟡 MEDIUM |
| **ota_payouts** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **ota_disputes** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🟠 HIGH |
| **hotel_collects** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **guest_documents** | non-ke_toan | authenticated (true) | ❌ | admin | ❌ NO | 🟡 MEDIUM |
| **audit_logs** | authenticated (true) | authenticated (true) | ❌ ✅ | ❌ ✅ | ❌ NO | 🟢 LOW |
| **booking_changes** | authenticated (true) | ❌ | ❌ | ❌ | ❌ NO | 🟢 LOW |
| **messages** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🟡 MEDIUM |
| **revenue_entries** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **cashflow_entries** | authenticated (true) | authenticated (true) | authenticated (true) | ❌ | ❌ NO | 🔴 CRITICAL |
| **host_payments** | authenticated (true) | ke_toan/admin | ❌ | ❌ | ❌ NO | 🟡 MEDIUM |

### RLS Matrix Analysis

**CRITICAL FINDINGS:**
1. **6 financial tables** have `INSERT/UPDATE authenticated USING(true)` = ANY user can modify financial data
2. **0 tables** have tenant isolation (no org_id/partner_id filter)
3. **audit_logs** correctly has NO UPDATE/DELETE policy ✅
4. **cash_outs** INSERT is properly restricted ✅

---

## 2.3 Secret & Key Exposure

### Frontend Key Usage
| Check | Result | Evidence |
|-------|--------|----------|
| Uses anon key only | ✅ PASS | [client.ts#L7](src/integrations/supabase/client.ts#L7): `VITE_SUPABASE_PUBLISHABLE_KEY` |
| No service_role in frontend | ✅ PASS | grep search: 0 matches |
| No hardcoded secrets | ✅ PASS | grep search: 0 matches |
| No key/token in console.log | ✅ PASS | Only idempotency key logged (non-sensitive) |

### Edge Function Key Usage
| Check | Result | Evidence |
|-------|--------|----------|
| service_role from env | ✅ PASS | All use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` |
| verify_jwt config | 🔴 FAIL | [config.toml](supabase/config.toml): ALL 23 functions have `verify_jwt = false` |
| Authorization header validation | 🔴 FAIL | No manual JWT validation in edge functions |

### JWT Validation in Edge Functions
```
❌ channex-webhook: verify_jwt = false, no manual validation
❌ sync-channex-bookings: verify_jwt = false, no manual validation
❌ inventory-batch-update: verify_jwt = false, no manual validation
... (all 23 functions)
```

**RISK:** Any unauthenticated attacker can call edge functions directly.

---

## 2.4 Financial Integrity

### DB-Level Guarantees

| Protection | Status | Evidence |
|------------|--------|----------|
| Overpay prevention (trigger) | 🔴 MISSING | No trigger on cash_outs to check remaining |
| Double-spend prevention | 🔴 MISSING | Frontend-only check in [useCashOuts.ts#L143-158](src/hooks/useCashOuts.ts#L143-158) |
| Idempotency | ⚠️ PARTIAL | Idempotency key generated but not enforced at DB |
| Settlement atomicity | 🔴 MISSING | Multi-table insert without transaction |

### Race Condition Analysis - useCashOuts.ts

```typescript
// File: src/hooks/useCashOuts.ts Lines 143-163
// RACE CONDITION: Check-then-act pattern

// Step 1: Check existing cash outs (READ)
const { data: existingCashOuts } = await supabase
  .from("cash_outs")
  .select("amount")
  .eq("payment_request_id", params.payment_request_id);

// Step 2: Calculate remaining (COMPUTE)
const totalPaid = existingCashOuts?.reduce(...) || 0;
const remaining = Number(request.proposed_amount) - totalPaid;

// GAP: Another transaction can INSERT here!

// Step 3: Insert cash out (WRITE)
const { data: cashOut } = await supabase.from("cash_outs").insert({...});
```

**Attack Scenario:**
1. Request A reads totalPaid = 0, remaining = 1,000,000
2. Request B reads totalPaid = 0, remaining = 1,000,000
3. Request A inserts 1,000,000 ✅
4. Request B inserts 1,000,000 ✅ (should be blocked!)
5. **Result:** 2,000,000 paid for 1,000,000 approved

---

## 2.5 Audit Log Integrity

| Check | Status | Evidence |
|-------|--------|----------|
| audit_logs has no UPDATE policy | ✅ PASS | [migration#L625-626](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L625-626) |
| audit_logs has no DELETE policy | ✅ PASS | No DELETE policy found |
| Insert errors are handled | 🔴 FAIL | [useAuditLog.ts#L30-33](src/hooks/useAuditLog.ts#L30-33): `console.error` only, no re-throw |
| All mutations create audit | ⚠️ PARTIAL | Most critical ops call createAuditLog, but error swallowed |

---

## 2.6 Top 15 Security Findings

| # | Severity | Finding | Impact | Evidence | Fix |
|---|----------|---------|--------|----------|-----|
| 1 | 🔴 CRITICAL | Race condition in cash_outs | Double-spend possible | [useCashOuts.ts#L143-163](src/hooks/useCashOuts.ts#L143-163) | DB trigger with FOR UPDATE lock |
| 2 | 🔴 CRITICAL | ALL edge functions verify_jwt=false | Unauthenticated access | [config.toml](supabase/config.toml#L4-64) | Set verify_jwt=true or manual JWT check |
| 3 | 🔴 CRITICAL | payment_requests INSERT by any user | Unauthorized payment creation | [migration#L158-160](supabase/migrations/20251218092448_a144227d-1466-436d-a056-c54d7cf7f8ae.sql#L158-160) | Restrict to ke_toan/admin |
| 4 | 🔴 CRITICAL | host_payables INSERT/UPDATE by any user | Financial data tampering | [migration#L606-608](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L606-608) | Restrict to ke_toan/admin |
| 5 | 🔴 CRITICAL | revenue_entries INSERT/UPDATE by any user | P&L manipulation | [migration#L92-103](supabase/migrations/20251214081452_7202d5de-3119-445f-8772-0b271f36db4a.sql#L92-103) | Restrict to system/admin |
| 6 | 🔴 CRITICAL | hotel_collects INSERT by any user | Collection fraud | [migration#L576-577](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L576-577) | Restrict to ops/ke_toan |
| 7 | 🟠 HIGH | No tenant isolation in RLS | Cross-tenant data access | All RLS policies | Add partner_id/org_id filter |
| 8 | 🟠 HIGH | ota_payouts UPDATE by any user | Payout amount tampering | [migration#L586](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L586) | Restrict UPDATE to admin |
| 9 | 🟠 HIGH | Audit log error swallowed | Missing audit trail | [useAuditLog.ts#L30-33](src/hooks/useAuditLog.ts#L30-33) | Re-throw error after logging |
| 10 | 🟠 HIGH | Settlement without transaction | Orphan records | Multiple INSERT without BEGIN/COMMIT | Use DB function with transaction |
| 11 | 🟡 MEDIUM | ota_disputes UPDATE by any user | Dispute status tampering | [migration#L598](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L598) | Restrict to ke_toan |
| 12 | 🟡 MEDIUM | messages UPDATE by any user | Message tampering | [migration](supabase/migrations/20251218092519_3b6454e7-26a8-4760-970a-547c728d63b4.sql#L143) | Remove UPDATE or restrict |
| 13 | 🟡 MEDIUM | All authenticated can SELECT all data | Data exfiltration | All SELECT policies | Add role-based filtering |
| 14 | 🟢 LOW | guest_documents ke_toan blocked correctly | Privacy protection | [migration#L561-563](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L561-563) | ✅ Good |
| 15 | 🟢 LOW | Webhook HMAC verification | Channex webhook security | [channex-webhook#L8-31](supabase/functions/channex-webhook/index.ts#L8-31) | ✅ Good |

---

# 3. INFRASTRUCTURE REPORT

## 3.1 Architecture Posture

### Tech Stack
| Layer | Technology | Status |
|-------|------------|--------|
| Frontend | React 18 + Vite 5 + TypeScript | ✅ Modern |
| Styling | Tailwind CSS + shadcn/ui | ✅ Good |
| State | React Query 5 + Zustand | ✅ Good |
| Auth | Supabase Auth | ✅ Good |
| Database | Supabase (PostgreSQL) | ✅ Good |
| Realtime | Supabase Realtime | ⚠️ Overused |
| Edge Functions | Deno (23 functions) | ⚠️ No JWT validation |

### Edge Functions by Domain
| Domain | Functions | Purpose |
|--------|-----------|---------|
| Channex | 15 | OTA integration (bookings, messages, inventory) |
| Inventory | 7 | Bulk updates, snapshots |
| AI Pricing | 1 | Outcome evaluation |

---

## 3.2 Deployment Readiness Checklist

| Check | Status | Evidence | Risk |
|-------|--------|----------|------|
| Build script | ⚠️ PARTIAL | `vite build` only, no typecheck | Type errors in prod |
| Lint in CI | ✅ PRESENT | `eslint .` script exists | - |
| Typecheck | 🔴 MISSING | No `tsc --noEmit` in build | Runtime type errors |
| Error boundaries | 🔴 MISSING | No React ErrorBoundary | Crash whole app |
| Central logging | 🔴 MISSING | Only console.log/error | No prod debugging |
| Structured errors | 🔴 MISSING | `catch (error: any)` pattern | Lost error context |
| Feature flags | ⚠️ PARTIAL | `FEATURE_FLAGS` in queryClient | Not fully utilized |
| Rollback ability | ⚠️ PARTIAL | app_config table exists | Manual process |
| Env var hygiene | ✅ GOOD | `VITE_` prefix used | - |

### Build Scripts Analysis
```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",           // ❌ No typecheck!
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview"
    // Missing: "typecheck": "tsc --noEmit"
  }
}
```

---

## 3.3 Operational Observability

| Capability | Status | Evidence |
|------------|--------|----------|
| Central logging | 🔴 MISSING | No log aggregation service |
| Structured error reporting | 🔴 MISSING | No Sentry/similar |
| Performance metrics | 🔴 MISSING | No metrics dashboard |
| Realtime connection status | ✅ PRESENT | SyncIndicator component |
| Audit trail | ⚠️ PARTIAL | audit_logs table, but errors swallowed |
| Health checks | 🔴 MISSING | No /health endpoint |

### Minimum Observability Proposal

```sql
-- 1. Create error_events table
CREATE TABLE error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  error_type text NOT NULL,
  message text,
  stack_trace text,
  user_id uuid REFERENCES auth.users(id),
  metadata jsonb,
  severity text CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

-- 2. Add RLS (admin only read, system insert)
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can read errors" ON error_events 
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert errors" ON error_events 
FOR INSERT TO authenticated WITH CHECK (true);
```

---

## 3.4 Infrastructure Gaps Summary

| # | Gap | Impact | Fix Effort |
|---|-----|--------|------------|
| 1 | No typecheck in build | Type errors in production | 5 min |
| 2 | No ErrorBoundary | App crashes completely | 2 hours |
| 3 | No central logging | Cannot debug production | 1 day |
| 4 | No health endpoint | Cannot monitor uptime | 30 min |
| 5 | Edge functions unprotected | Security breach | 4 hours |
| 6 | No structured errors | Lost debugging context | 1 day |
| 7 | No metrics | Cannot measure performance | 2-3 days |
| 8 | No alerts | Miss critical issues | 1 day |
| 9 | Audit log errors swallowed | Missing audit trail | 30 min |
| 10 | No feature flag system | Cannot gradual rollout | 2-3 days |

---

# 4. PERFORMANCE REPORT

## 4.1 Query Hotspots

### unified_bookings View Analysis
```sql
-- File: supabase/migrations/20251214081729_*.sql
CREATE VIEW public.unified_bookings WITH (security_invoker = true) AS
SELECT 'mirror'::text AS booking_type, ... FROM bookings_mirror
UNION ALL
SELECT 'manual'::text AS booking_type, ... FROM manual_bookings;
```

**Performance Risk:**
- UNION ALL scans both tables fully
- No materialized view for caching
- No index on combined result

**Scale Impact:**
| Booking Count | Estimated Query Time |
|---------------|---------------------|
| 1,000 | ~50ms |
| 5,000 | ~250ms |
| 10,000 | ~500ms+ |

### Missing Indexes

| Table | Column(s) | Query Pattern | Current Status |
|-------|-----------|---------------|----------------|
| bookings_mirror | check_in_date, property_id | Date range filter | ⚠️ No composite |
| host_payables | partner_id, status | Partner + status | ⚠️ No composite |
| audit_logs | created_at, entity | Time-based browse | ⚠️ No composite |
| booking_changes | created_at | Recent changes | ✅ Has index |

### Existing Indexes (Good)
```sql
-- Found in migrations:
CREATE INDEX idx_revenue_entries_date ON revenue_entries(entry_date);
CREATE INDEX idx_cashflow_entries_date ON cashflow_entries(cash_date);
CREATE INDEX idx_hotel_collects_type ON hotel_collects(collection_type);
CREATE INDEX idx_booking_room_lines_pms_booking_id ON booking_room_lines_mirror(pms_booking_id);
```

---

## 4.2 Realtime Subscription Analysis

### Subscription Map

| Channel | Tables | Components | Double-Event Risk |
|---------|--------|------------|-------------------|
| `realtime-system` | 18 tables | MainLayout, SyncIndicator | 🔴 Master hub |
| `live-feed-realtime` | booking_changes | LiveFeedEvents | 🟠 Overlaps with master |
| `notification-bell-realtime` | booking_changes | NotificationBell | 🟠 Overlaps with master |
| `bookings_mirror_changes` | bookings_mirror | useBookingsRealtime | 🟠 Overlaps with master |
| `manual_bookings_changes` | manual_bookings | useBookingsRealtime | 🟠 Overlaps with master |
| `stays_realtime_changes` | stays | useBookingsRealtime | 🟠 Overlaps with master |
| `conversations-changes` | conversations | useConversations | 🟠 Overlaps with master |
| `messages-global-changes` | messages | useConversations | 🟠 Overlaps with master |
| `messages-{id}` | messages | useConversationMessages | ✅ Scoped |
| `inventory-changes` | inventory_cells | useInventory | 🟠 May overlap |

### Tables with Multiple Subscriptions (Double-Event Risk)

| Table | # Subscriptions | Sources |
|-------|-----------------|---------|
| booking_changes | 3 | realtime-system, live-feed, notification-bell |
| messages | 4 | realtime-system, conversations, messages-global, messages-{id} |
| bookings_mirror | 2 | realtime-system, useBookingsRealtime |
| manual_bookings | 2 | realtime-system, useBookingsRealtime |
| stays | 2 | realtime-system, useBookingsRealtime |
| conversations | 2 | realtime-system, useConversations |

**Impact:** Same event triggers multiple handlers → multiple query invalidations → excessive re-renders

---

## 4.3 Frontend Rendering Performance

| Component | Issue | Impact | Fix |
|-----------|-------|--------|-----|
| BookingsPage | No virtualization | Slow with 500+ rows | Add react-window |
| AuditLogsPage | Unbounded query | Memory issues | Add pagination |
| InventoryGrid | N×M cells | Lag with 30 days × 50 rooms | Virtualize grid |
| Reports tables | Full data load | Slow initial render | Server-side pagination |

### React Query Patterns

| Pattern | Status | Evidence |
|---------|--------|----------|
| Stale time configured | ✅ | FEATURE_FLAGS.STALE_TIME |
| Refetch on mount | ⚠️ | Varies per query |
| Pagination | ⚠️ PARTIAL | Some pages, not all |
| Infinite scroll | 🔴 MISSING | Not implemented |

---

## 4.4 Top 10 Performance Bottlenecks

| # | Bottleneck | Impact | Quick Win | Evidence |
|---|------------|--------|-----------|----------|
| 1 | booking_changes 3× subscribed | Triple invalidation | Remove duplicates | Subscription map |
| 2 | messages 4× subscribed | Quadruple invalidation | Consolidate | Subscription map |
| 3 | unified_bookings UNION ALL | Slow @ 5k+ | Materialized view | View definition |
| 4 | No composite index on bookings_mirror | Full scan on date filter | Add index | Query analysis |
| 5 | InventoryGrid N×M render | UI lag | Virtualize | Component review |
| 6 | AuditLogsPage unbounded | Memory leak | Pagination | Query review |
| 7 | realtime-system 18 tables | Message flood | Reduce to critical | Hook review |
| 8 | No index on host_payables.partner_id | Slow filtering | Add index | Query analysis |
| 9 | SELECT * patterns | Over-fetching | Select specific columns | Hook grep |
| 10 | No server-side pagination on reports | Slow initial load | Implement limit/offset | Page review |

---

## 4.5 Scale Estimates

### @ 1,000 Bookings
| Metric | Estimate | Status |
|--------|----------|--------|
| unified_bookings query | ~50ms | ✅ OK |
| Dashboard load | ~200ms | ✅ OK |
| Realtime fanout | Low | ✅ OK |

### @ 5,000 Bookings
| Metric | Estimate | Status |
|--------|----------|--------|
| unified_bookings query | ~250ms | ⚠️ Noticeable |
| Dashboard load | ~500ms | ⚠️ Slow |
| Realtime fanout | Medium | ⚠️ Potential issues |
| BookingsPage render | ~300ms | ⚠️ Needs virtualization |

### @ 10,000 Bookings
| Metric | Estimate | Status |
|--------|----------|--------|
| unified_bookings query | ~500ms+ | 🔴 Unacceptable |
| Dashboard load | ~1s+ | 🔴 Poor UX |
| Realtime fanout | High | 🔴 Performance degradation |
| BookingsPage render | ~600ms+ | 🔴 Needs immediate fix |

---

# 5. PASS/FAIL SUMMARY

## 5.1 Security Posture

| Criteria | Status | Evidence |
|----------|--------|----------|
| Frontend key security | ✅ PASS | Uses anon key only |
| RLS on all tables | ⚠️ CONDITIONAL | RLS exists but too permissive |
| Financial protection | 🔴 FAIL | No DB-level double-spend prevention |
| Edge function auth | 🔴 FAIL | All verify_jwt=false |
| Tenant isolation | 🔴 FAIL | No tenant filter in RLS |
| Audit integrity | ⚠️ CONDITIONAL | No UPDATE/DELETE but errors swallowed |

**Overall Security: 🔴 FAIL**

---

## 5.2 Infrastructure Posture

| Criteria | Status | Evidence |
|----------|--------|----------|
| Build pipeline | ⚠️ CONDITIONAL | Missing typecheck |
| Error handling | 🔴 FAIL | No ErrorBoundary, errors swallowed |
| Observability | 🔴 FAIL | No central logging or metrics |
| Deployment readiness | ⚠️ CONDITIONAL | Basic setup, missing key pieces |

**Overall Infrastructure: ⚠️ CONDITIONAL PASS** (production-capable but risky)

---

## 5.3 Performance Posture @ 5k Bookings

| Criteria | Status | Evidence |
|----------|--------|----------|
| Query performance | ⚠️ CONDITIONAL | unified_bookings will slow down |
| Realtime efficiency | 🔴 FAIL | 7 tables double-subscribed |
| Frontend rendering | ⚠️ CONDITIONAL | No virtualization |
| Index coverage | ⚠️ CONDITIONAL | Missing composite indexes |

**Overall Performance: ⚠️ CONDITIONAL PASS** (works now, problems at scale)

---

# 6. ACTION PLAN

## 6.1 Zero-Risk Changes (No Behavior Change)

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Add `"typecheck": "tsc --noEmit"` to package.json | 5 min | Catch type errors |
| 2 | Update build script to `"build": "tsc --noEmit && vite build"` | 5 min | Prevent broken builds |
| 3 | Add composite index on bookings_mirror(check_in_date, property_id) | 10 min | Faster queries |
| 4 | Add composite index on host_payables(partner_id, status) | 10 min | Faster queries |
| 5 | Add composite index on audit_logs(created_at, entity) | 10 min | Faster browse |

**Migration for indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_checkin_property 
ON bookings_mirror(check_in_date, property_id);

CREATE INDEX IF NOT EXISTS idx_host_payables_partner_status 
ON host_payables(partner_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_entity 
ON audit_logs(created_at DESC, entity);
```

---

## 6.2 Low-Risk Changes (Feature Flag Ready)

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Add ErrorBoundary component | 2 hours | Graceful error handling |
| 2 | Fix audit log error handling (re-throw after console.error) | 30 min | Complete audit trail |
| 3 | Remove duplicate booking_changes subscriptions | 2 hours | Reduce double events |
| 4 | Add pagination to AuditLogsPage | 4 hours | Memory optimization |
| 5 | Create error_events table for central logging | 2 hours | Production debugging |

---

## 6.3 High-Risk Changes (Needs Staging)

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | **DB Trigger: check_cash_out_limit** | 1 day | Prevent double-spend |
| 2 | **Enable verify_jwt on edge functions** | 4 hours | Secure edge functions |
| 3 | **Restrict payment_requests INSERT RLS** | 2 hours | Prevent unauthorized creation |
| 4 | **Restrict host_payables INSERT/UPDATE RLS** | 2 hours | Protect financial data |
| 5 | **Restrict revenue_entries/cashflow_entries INSERT RLS** | 2 hours | Protect P&L |
| 6 | **Add tenant isolation to critical tables** | 2-3 days | Multi-tenant security |

---

## 6.4 Recommended Priority Order

### Phase 1: Critical Security (Week 1)
1. ✅ Deploy DB trigger for cash_out limit check
2. ✅ Enable verify_jwt OR add manual JWT check in edge functions
3. ✅ Restrict payment_requests INSERT to ke_toan/admin
4. ✅ Fix audit log error handling

### Phase 2: Infrastructure Stability (Week 2)
1. ✅ Add typecheck to build
2. ✅ Add ErrorBoundary
3. ✅ Deploy composite indexes
4. ✅ Create error_events table

### Phase 3: Performance Optimization (Week 3)
1. ✅ Consolidate realtime subscriptions
2. ✅ Add pagination to large tables
3. ✅ Consider materialized view for unified_bookings
4. ✅ Add virtualization to grids

### Phase 4: Security Hardening (Week 4+)
1. ✅ Restrict remaining financial table RLS
2. ✅ Add tenant isolation
3. ✅ Security testing
4. ✅ Penetration testing

---

# APPENDIX: Evidence Files

## A1. Critical Code Locations

| Finding | File | Lines |
|---------|------|-------|
| Race condition | [src/hooks/useCashOuts.ts](src/hooks/useCashOuts.ts) | 143-163 |
| Audit swallow | [src/hooks/useAuditLog.ts](src/hooks/useAuditLog.ts) | 30-33 |
| verify_jwt=false | [supabase/config.toml](supabase/config.toml) | 4-64 |
| payment_requests RLS | [migrations/20251218092448*.sql](supabase/migrations/20251218092448_a144227d-1466-436d-a056-c54d7cf7f8ae.sql) | 153-166 |
| Realtime master | [src/hooks/useRealtimeSystem.ts](src/hooks/useRealtimeSystem.ts) | 17-38 |
| unified_bookings | [migrations/20251214081729*.sql](supabase/migrations/20251214081729_53c51019-649d-4bad-92ed-e9f3aec28999.sql) | 5-47 |

## A2. DB Trigger Template for Cash Out

```sql
-- File: supabase/migrations/new_cash_out_limit_trigger.sql
CREATE OR REPLACE FUNCTION check_cash_out_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_approved_amount NUMERIC;
  v_total_paid NUMERIC;
BEGIN
  -- Lock the payment request row to prevent concurrent modifications
  SELECT proposed_amount INTO v_approved_amount
  FROM payment_requests
  WHERE id = NEW.payment_request_id
  FOR UPDATE;

  -- Calculate total already paid (excluding current insert which hasn't been committed)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM cash_outs
  WHERE payment_request_id = NEW.payment_request_id;

  -- Check if new amount would exceed approved
  IF (v_total_paid + NEW.amount) > v_approved_amount THEN
    RAISE EXCEPTION 'Cash out amount % would exceed remaining approved amount %',
      NEW.amount, (v_approved_amount - v_total_paid);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_cash_out_limit
BEFORE INSERT ON cash_outs
FOR EACH ROW
EXECUTE FUNCTION check_cash_out_limit();
```

---

**End of Report**

*Generated: 31/12/2024*  
*All file paths and line numbers verified against codebase*
