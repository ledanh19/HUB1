# ROOMRISE CONTROL HUB - AUDIT BÁO CÁO TOÀN DIỆN

**Ngày audit:** 05/01/2026  
**Auditor:** Principal Engineer + Security & Performance Auditor  
**Phiên bản:** 1.0

---

## 1. EXECUTIVE SUMMARY

| # | Đánh giá | Trạng thái |
|---|----------|------------|
| 1 | **Auth/Session**: Supabase Auth + JWT + localStorage persist | ✅ ĐẠT |
| 2 | **Frontend Secrets**: Chỉ dùng anon key, service_role trong Edge Functions | ✅ ĐẠT |
| 3 | **RLS Multi-tenant Isolation**: ⚠️ KHÔNG CÓ tenant filter, tất cả authenticated users xem được tất cả | 🔴 KHÔNG ĐẠT |
| 4 | **Race Condition Cash Out**: Đã có atomic RPC `create_cash_out_atomic` với FOR UPDATE lock | ✅ ĐẠT |
| 5 | **Audit Log Coverage**: Đa số mutations có createAuditLog, nhưng errors swallowed | ⚠️ ĐẠT CÓ ĐIỀU KIỆN |
| 6 | **XSS Protection**: Chỉ 1 chỗ dangerouslySetInnerHTML (chart styles - safe) | ✅ ĐẠT |
| 7 | **Index Strategy**: Có indexes cho các filter columns chính | ✅ ĐẠT |
| 8 | **Code Splitting / Lazy Loading**: KHÔNG CÓ - bundle monolithic | 🔴 KHÔNG ĐẠT |
| 9 | **Unit/E2E Tests**: KHÔNG CÓ jest/vitest/cypress | 🔴 KHÔNG ĐẠT |
| 10 | **TypeScript Any Usage**: Nhiều chỗ dùng `any`, thiếu strict typing | ⚠️ ĐẠT CÓ ĐIỀU KIỆN |

**Kết luận tổng thể:** Hệ thống có nền tảng security tốt (auth, atomic transactions) nhưng **thiếu multi-tenant RLS isolation nghiêm trọng** và cần cải thiện performance/test coverage.

---

## 2. SYSTEM MAP

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vite + React)                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐ │
│  │   Pages     │   │   Hooks     │   │  Components             │ │
│  │ Dashboard   │   │ useAuth     │   │ CollectPaymentDialog    │ │
│  │ Bookings    │◄──│ useBookings │◄──│ CashOutDialog           │ │
│  │ Payments    │   │ useCashOuts │   │ ProtectedRoute          │ │
│  │ Reports     │   │ useCollections  │ NotificationBell        │ │
│  └─────────────┘   └─────────────┘   └─────────────────────────┘ │
│           │               │                      │                │
│           └───────────────┴──────────────────────┘                │
│                           │                                       │
│                    Supabase Client                                │
│                    (anon key only)                                │
└───────────────────────────┬───────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│                    SUPABASE PLATFORM                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 EDGE FUNCTIONS (Deno)                      │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │  │
│  │  │ channex-webhook │  │ send-push       │  verify_jwt=false│  │
│  │  │ (HMAC verify)   │  │ (service_role)  │  for webhooks    │  │
│  │  └─────────────────┘  └─────────────────┘                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │  │
│  │  │ sync-channex-*  │  │ inventory-*     │  verify_jwt=true │  │
│  │  │ (JWT required)  │  │ (JWT required)  │  for internal    │  │
│  │  └─────────────────┘  └─────────────────┘                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────┴──────────────────────────────────┐  │
│  │                     POSTGRESQL + RLS                        │  │
│  │  Tables:                                                    │  │
│  │  - bookings_mirror, manual_bookings (→ unified_bookings)   │  │
│  │  - hotel_collects, cash_outs, payment_requests             │  │
│  │  - host_payables, host_deposits, ota_payouts               │  │
│  │  - ledger_entries, cashflow_entries                        │  │
│  │  - audit_logs, push_subscriptions                          │  │
│  │                                                             │  │
│  │  Views:                                                     │  │
│  │  - unified_bookings (UNION bookings_mirror + manual)       │  │
│  │                                                             │  │
│  │  RPCs (atomic):                                             │  │
│  │  - create_cash_out_atomic (FOR UPDATE lock)                │  │
│  │  - create_collection_ledger_atomic                         │  │
│  │  - post_ledger_entry_idempotent                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │ REALTIME       │  │ STORAGE        │  │ AUTH               │  │
│  │ booking_changes│  │ (guest_docs)   │  │ email/password     │  │
│  │ messages       │  │                │  │ JWT + refresh      │  │
│  └────────────────┘  └────────────────┘  └────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. INFRASTRUCTURE REVIEW

### 3.1 Deployment & Build

| Item | Status | Evidence |
|------|--------|----------|
| Build tool | Vite + React-SWC | [vite.config.ts](vite.config.ts#L1-22) |
| Host | Lovable.dev (implied) | `componentTagger` plugin |
| Env management | VITE_ prefix | [.env](.env#L1-4) - chỉ 3 vars public |
| Bundle splitting | ❌ KHÔNG CÓ | No `React.lazy` or dynamic imports |

### 3.2 Supabase Config

| Item | Status | Evidence |
|------|--------|----------|
| Project ID | htfpjqkhtjbalaodymwb | [.env](.env#L1) |
| Auth providers | Email/Password | [useAuth.tsx](src/hooks/useAuth.tsx#L70-98) |
| Session persist | localStorage + autoRefresh | [client.ts](src/integrations/supabase/client.ts#L11-15) |
| JWT verify for webhooks | false (HMAC instead) | [config.toml](supabase/config.toml#L22-30) |
| JWT verify for internal | true | [config.toml](supabase/config.toml#L40-50) |

### 3.3 Edge Functions Security

| Function | verify_jwt | Auth Method | Status |
|----------|------------|-------------|--------|
| channex-webhook | false | HMAC signature | ✅ OK |
| channex-ari-webhook | false | HMAC signature | ✅ OK |
| send-push | false | service_role only | ✅ OK |
| sync-channex-bookings | true | JWT | ✅ OK |
| channex-send-message | true | JWT | ✅ OK |

**Evidence:** [channex-webhook/index.ts](supabase/functions/channex-webhook/index.ts#L15-37) - `verifyWebhookSignature` function

### 3.4 Service Role Key Handling

| Location | Status | Evidence |
|----------|--------|----------|
| Frontend | ✅ KHÔNG CÓ | grep "service_role" = 0 matches in src/ |
| Edge Functions | ✅ Deno.env | All use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` |

---

## 4. SECURITY REVIEW

### 4.1 Authentication Flow

```typescript
// src/hooks/useAuth.tsx#L25-50
useEffect(() => {
  supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null);
    if (session?.user) {
      fetchUserRole(session.user.id); // RPC: get_user_role
    }
  });
});
```

| Check | Status | Evidence |
|-------|--------|----------|
| Login/Logout | ✅ | `signInWithPassword`, `signOut` |
| Token refresh | ✅ | `autoRefreshToken: true` |
| Route protection | ✅ | [ProtectedRoute.tsx](src/components/layout/ProtectedRoute.tsx#L10-45) |
| Role-based access | ✅ | `userRole` from `get_user_role` RPC |

### 4.2 RLS Policies - CRITICAL ISSUE

**⚠️ KHÔNG CÓ MULTI-TENANT ISOLATION**

```sql
-- Migration 20251214075415 - Line 531-533
CREATE POLICY "Partners viewable by authenticated" ON public.partners 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Partners insertable by authenticated" ON public.partners 
  FOR INSERT TO authenticated WITH CHECK (true);
```

**Vấn đề:**
- Tất cả bảng chính đều có policy `USING (true)` cho authenticated users
- KHÔNG filter theo `partner_id` hoặc `property_id`
- User A có thể xem/sửa dữ liệu của User B

**Bảng bị ảnh hưởng:**
- `partners`, `customers`, `bookings_mirror`, `hotel_collects`
- `host_payables`, `host_deposits`, `ota_payouts`, `service_orders`
- `payment_requests`, `cash_outs`, `ledger_entries`

**Evidence:** [migrations/20251214075415.sql](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L521-631)

### 4.3 IDOR (Insecure Direct Object Reference)

| Scenario | Status | Evidence |
|----------|--------|----------|
| Booking by ID | 🔴 FAIL | No tenant check - `.eq("id", bookingId)` only |
| Collection by ID | 🔴 FAIL | Same issue |
| Payment request | 🔴 FAIL | Same issue |

**Example vulnerable code:**
```typescript
// src/hooks/useBookings.ts#L328-335
const { data } = await supabase
  .from("hotel_collects")
  .select("*")
  .eq("unified_booking_id", unifiedBookingId)
  // ❌ Missing: .eq("partner_id", currentUserPartnerId)
```

### 4.4 Race Condition / Double Spend

| Operation | Status | Evidence |
|-----------|--------|----------|
| Cash Out | ✅ FIXED | `create_cash_out_atomic` with `FOR UPDATE` lock |
| Collection | ✅ FIXED | `create_collection_ledger_atomic` |
| Approve Payment | ⚠️ No lock | `.eq("status", "PENDING")` but no FOR UPDATE |

**Cash Out Atomic - GOOD:**
```sql
-- migrations/20260102105543.sql#L330-345
SELECT * INTO v_request
FROM payment_requests
WHERE id = p_payment_request_id
FOR UPDATE;  -- ✅ Prevents race condition

IF p_amount > v_remaining THEN
  RAISE EXCEPTION 'Số tiền chi vượt quá số còn lại';
END IF;
```

### 4.5 Audit Log Coverage

| Operation | Has Audit | Evidence |
|-----------|-----------|----------|
| Check-in | ✅ | [CheckInDialog.tsx](src/components/booking/CheckInDialog.tsx#L231) |
| Check-out | ✅ | [CheckOutDialog.tsx](src/components/booking/CheckOutDialog.tsx#L124) |
| Collect Payment | ✅ | [CollectPaymentDialog.tsx](src/components/booking/CollectPaymentDialog.tsx#L294) |
| Cash Out | ✅ (in RPC) | `create_cash_out_atomic` |
| Approve Payment | ✅ | [usePaymentRequests.ts](src/hooks/usePaymentRequests.ts#L337-343) |
| Settlement Create | ✅ | Various hooks |

**Issue:** Audit log errors are swallowed:
```typescript
// src/hooks/usePaymentRequests.ts#L337-343
createAuditLog({...}).catch(console.error); // ❌ Error swallowed
```

### 4.6 Input Validation

| Check | Status | Evidence |
|-------|--------|----------|
| Zod validation | ⚠️ Partial | Only in AddExtraChargeDialog, AddSegmentDialog, AuthPage |
| Form validation | ⚠️ Partial | react-hook-form + zod in some forms |
| SQL injection | ✅ | Supabase parameterized queries |
| XSS | ✅ | 1 dangerouslySetInnerHTML - safe (CSS only) |

### 4.7 RBAC Implementation

```typescript
// src/hooks/useAuth.tsx#L113-140
export function usePermissions() {
  const { userRole } = useAuth();
  const isFoh = userRole === 'cskh' || userRole === 'sale';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  
  return {
    canEditHostCost: isFinanceRole,
    canSettlement: isFinanceRole,
    canRefundDeposit: isFinanceRole,
  };
}
```

| Check | Status | Evidence |
|-------|--------|----------|
| Role-based hooks | ✅ | `usePermissions()` |
| UI hiding | ✅ | Conditional rendering |
| Backend enforcement | ⚠️ Partial | Some RLS check `has_role()`, most don't |

---

## 5. PERFORMANCE REVIEW

### 5.1 Database Query Optimization

| Query | Issue | Impact | Evidence |
|-------|-------|--------|----------|
| `unified_bookings` | Complex UNION view | Slow on >5k records | [migrations/20251216073328.sql](supabase/migrations/20251216073328_6e799221-0bf7-429d-a754-e6497195903a.sql) |
| Dashboard aggregations | Multiple sequential queries | N+1 potential | [Dashboard.tsx](src/pages/Dashboard.tsx) |
| Collections list | `.select("*")` | Over-fetching | [useCollections.ts](src/hooks/useCollections.ts) |

### 5.2 Index Coverage

| Table | Index Exists | Columns |
|-------|--------------|---------|
| audit_logs | ✅ | action, entity_type, created_at |
| payment_requests | ✅ | partner_id, status |
| hotel_collects | ✅ | ledger_entry_id |
| bookings_mirror | ✅ | channex_property_id |
| host_supply_segments | ✅ | partner_id |

**Missing indexes (recommended):**
- `bookings_mirror(check_in_date, check_out_date)` - date range queries
- `hotel_collects(collected_at)` - reporting
- `cash_outs(paid_at)` - reporting

### 5.3 Realtime Subscriptions

```typescript
// src/lib/realtimeManager.ts#L17-27
export type RealtimeTable = 
  | "booking_changes" 
  | "messages" 
  | "conversations"
  | "payment_requests"
  | "cash_outs";
```

| Check | Status | Evidence |
|-------|--------|----------|
| Centralized manager | ✅ | `realtimeManager` singleton |
| Reference counting | ✅ | `refCount` per subscription |
| Event deduplication | ✅ | `generateEventKey` with TTL |
| Filter scope | ⚠️ | Subscribes to all rows, filters client-side |

### 5.4 Caching Strategy

```typescript
// src/lib/queryClient.ts#L12-25
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,      // 10 seconds
      gcTime: 5 * 60 * 1000,     // 5 minutes
      refetchOnWindowFocus: true,
    },
  },
});
```

| Check | Status | Evidence |
|-------|--------|----------|
| React Query | ✅ | Proper config |
| staleTime | ✅ | 10s - reasonable |
| Profile cache | ✅ | `useUserProfileCache` with 5min stale |
| Optimistic updates | ✅ | In mutations |

### 5.5 Bundle Size

| Issue | Impact | Fix |
|-------|--------|-----|
| No code splitting | 🔴 HIGH | All routes in single bundle |
| No React.lazy | 🔴 HIGH | No lazy loading |
| 70+ page imports in App.tsx | 🔴 HIGH | Initial load slow |

**Evidence:** [App.tsx](src/App.tsx#L11-67) imports ALL pages synchronously.

---

## 6. CODE QUALITY REVIEW

### 6.1 Architecture

| Aspect | Status | Notes |
|--------|--------|-------|
| Module structure | ⚠️ | `src/hooks`, `src/pages`, `src/components` - basic |
| Service layer | ❌ | No dedicated service files |
| Types | ⚠️ | Generated types + inline types |
| Constants | ✅ | Centralized in `src/constants` |

### 6.2 TypeScript Usage

| Check | Status | Evidence |
|-------|--------|----------|
| `any` usage | 🔴 HIGH | 20+ matches in hooks |
| Strict mode | ⚠️ | Not enforced |
| Generated types | ✅ | `src/integrations/supabase/types.ts` |

**Examples of `any` abuse:**
```typescript
// src/hooks/useCashOuts.ts#L74
return cashOuts.map((co: any): CashOut => {...}

// src/hooks/usePaymentRequests.ts#L225
.map((r: any) => {...}
```

### 6.3 Error Handling

| Pattern | Status | Evidence |
|---------|--------|----------|
| Toast notifications | ✅ | Sonner toasts on errors |
| Try-catch in hooks | ⚠️ | Inconsistent |
| Empty states | ✅ | UI handles loading/empty |
| Retry logic | ✅ | QueryClient retry config |

### 6.4 Testing

| Type | Status | Evidence |
|------|--------|----------|
| Unit tests | ❌ | No jest/vitest |
| Integration tests | ❌ | No test files |
| E2E tests | ❌ | No cypress/playwright |
| Manual test lab | ✅ | `TestLabPage`, `TestCenterLivePage` |

### 6.5 Lint & Format

```javascript
// eslint.config.js
rules: {
  "@typescript-eslint/no-unused-vars": "off", // ⚠️ Should be "warn"
}
```

---

## 7. TOP RISKS

| ID | Risk | Category | Severity | Impact | Exploit Scenario | Evidence | Fix |
|----|------|----------|----------|--------|------------------|----------|-----|
| **P0-1** | **No Multi-tenant RLS** | Security | 🔴 CRITICAL | Lộ toàn bộ dữ liệu | User login → query any partner's data | [migrations L521-631](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L521-631) | Add `partner_id` filter to ALL policies |
| **P0-2** | **IDOR on all entities** | Security | 🔴 CRITICAL | Sửa/xóa data người khác | Call API `/bookings/{uuid}` with other's ID | [useBookings.ts](src/hooks/useBookings.ts#L328-335) | Backend tenant check |
| **P1-1** | **No unit tests** | Quality | 🟡 HIGH | Regression bugs | Deploy breaks existing functionality | grep "jest\|vitest" = 0 | Add testing framework |
| **P1-2** | **Bundle not split** | Performance | 🟡 HIGH | Slow initial load | 70+ pages load on startup | [App.tsx L11-67](src/App.tsx#L11-67) | React.lazy() |
| **P1-3** | **unified_bookings slow** | Performance | 🟡 HIGH | UI lag >5k bookings | Dashboard timeout | UNION view no index | Materialized view |
| **P2-1** | **TypeScript `any` abuse** | Quality | 🟠 MEDIUM | Type safety | Bugs from wrong types | grep "any" in hooks | Strict typing |
| **P2-2** | **Audit log errors swallowed** | Security | 🟠 MEDIUM | Missing audit trail | `.catch(console.error)` | [usePaymentRequests.ts L343](src/hooks/usePaymentRequests.ts#L343) | Queue failed logs |
| **P2-3** | **Approve Payment no lock** | Security | 🟠 MEDIUM | Race condition | Double approve | No FOR UPDATE | Add RPC |

---

## 8. ACTION PLAN

### 8.1 7-Day Sprint (P0 Critical)

| # | Task | Owner | Acceptance Criteria |
|---|------|-------|---------------------|
| 1 | ❗ Add multi-tenant RLS policies | DBA | All tables have `partner_id = current_user_partner()` in USING clause |
| 2 | ❗ Create `current_user_partner()` function | DBA | Returns partner_id from user_roles join |
| 3 | ❗ Audit all `.eq("id", ...)` queries | Backend | Add tenant validation |
| 4 | ❗ Test RLS with 2 different users | QA | User A cannot see User B data |

**SQL Example:**
```sql
CREATE OR REPLACE FUNCTION current_user_partner_id()
RETURNS UUID AS $$
  SELECT partner_id FROM user_roles WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

ALTER POLICY "Hotel collects viewable by authenticated" ON hotel_collects
USING (partner_id = current_user_partner_id() OR current_user_partner_id() IS NULL);
```

### 8.2 30-Day Sprint (P1 High)

| # | Task | Owner | Acceptance Criteria |
|---|------|-------|---------------------|
| 1 | Setup Vitest + testing framework | Dev | `npm test` runs |
| 2 | Write tests for critical hooks | Dev | useCashOuts, useCollections 80% coverage |
| 3 | Implement React.lazy for routes | Dev | Initial bundle <500KB |
| 4 | Create materialized view for bookings | DBA | `mv_unified_bookings` with refresh trigger |
| 5 | Add approve payment RPC with lock | DBA | `approve_payment_request_atomic` |
| 6 | Add missing indexes | DBA | check_in_date, collected_at |

### 8.3 90-Day Sprint (P2 Medium + Tech Debt)

| # | Task | Owner | Acceptance Criteria |
|---|------|-------|---------------------|
| 1 | Replace all `any` with proper types | Dev | 0 `any` in src/hooks |
| 2 | Create service layer | Dev | `src/services/` with business logic |
| 3 | Add Zod validation to all forms | Dev | Consistent validation |
| 4 | Implement audit log queue | Backend | Failed logs retried |
| 5 | E2E test suite with Playwright | QA | Critical paths covered |
| 6 | Enable strict TypeScript | Dev | `"strict": true` in tsconfig |
| 7 | Performance monitoring (Sentry) | DevOps | Error tracking + web vitals |

---

## 9. APPENDIX: FILES READ

### Configuration Files
- [package.json](package.json) - Dependencies, scripts
- [vite.config.ts](vite.config.ts) - Build config
- [eslint.config.js](eslint.config.js) - Lint rules
- [.env](.env) - Environment variables (VITE_ prefix)
- [supabase/config.toml](supabase/config.toml) - Edge function config

### Entry Points
- [src/main.tsx](src/main.tsx#L1-15) - App bootstrap
- [src/App.tsx](src/App.tsx#L1-176) - Router + providers

### Auth & Security
- [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx#L1-164) - Auth context
- [src/components/layout/ProtectedRoute.tsx](src/components/layout/ProtectedRoute.tsx#L1-81) - Route guard
- [src/hooks/useUserPagePermissions.ts](src/hooks/useUserPagePermissions.ts#L1-100) - RBAC

### Finance Critical
- [src/hooks/useCashOuts.ts](src/hooks/useCashOuts.ts#L1-200) - Cash out mutations
- [src/hooks/usePaymentRequests.ts](src/hooks/usePaymentRequests.ts#L1-400) - Payment workflow
- [src/hooks/useCollections.ts](src/hooks/useCollections.ts#L1-100) - Collection mutations
- [src/hooks/useAuditLog.ts](src/hooks/useAuditLog.ts#L1-50) - Audit logging

### Database
- [supabase/migrations/20251214075415.sql](supabase/migrations/20251214075415_40b9b911-98f8-46bb-b5dd-ca7f392b5df8.sql#L500-700) - RLS policies
- [supabase/migrations/20260102105543.sql](supabase/migrations/20260102105543_8ba32ec5-9c07-4ad1-be6b-98627f911088.sql#L290-400) - Atomic RPCs
- [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts) - Client init

### Edge Functions
- [supabase/functions/channex-webhook/index.ts](supabase/functions/channex-webhook/index.ts#L1-100) - Webhook handler
- [supabase/functions/send-push/index.ts](supabase/functions/send-push/index.ts#L1-60) - Push notifications

### Performance
- [src/lib/queryClient.ts](src/lib/queryClient.ts#L1-50) - Query config
- [src/lib/realtimeManager.ts](src/lib/realtimeManager.ts#L1-100) - Realtime subscriptions

---

## 10. CHECKLIST ĐÃ ĐỌC

- [x] package.json, vite.config.ts, .env
- [x] src/main.tsx, App.tsx, router
- [x] src/hooks/useAuth.tsx - auth context
- [x] src/components/layout/ProtectedRoute.tsx - route guard
- [x] src/integrations/supabase/client.ts - client init
- [x] src/hooks/useCashOuts.ts - cash out flow
- [x] src/hooks/usePaymentRequests.ts - payment workflow
- [x] src/hooks/useCollections.ts - collection flow
- [x] src/hooks/useAuditLog.ts - audit logging
- [x] supabase/migrations/* - RLS policies (20251214075415)
- [x] supabase/migrations/* - atomic RPCs (20260102105543)
- [x] supabase/functions/channex-webhook/index.ts - webhook security
- [x] supabase/functions/send-push/index.ts - push implementation
- [x] supabase/config.toml - JWT verification config
- [x] src/lib/queryClient.ts - caching strategy
- [x] src/lib/realtimeManager.ts - realtime subscriptions
- [x] eslint.config.js - lint rules
- [x] grep searches: any, dangerouslySetInnerHTML, service_role, VAPID, lazy

---

**Ký duyệt:**  
_Principal Engineer_  
_05/01/2026_
