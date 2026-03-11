# 🧪 E2E TEST MATRIX - OTA PRIVILEGE PRECEDENCE FIX

## Test Date: 2026-01-08
## Migration: `20260108_ota_privilege_precedence_fix.sql`

---

## 📋 PRE-REQUISITES

- [ ] Migration `20260108_ota_privilege_precedence_fix.sql` applied
- [ ] Verification script `VERIFY_ota_privilege_fix.sql` run successfully
- [ ] Frontend changes deployed (useUserPagePermissions.ts, ProtectedRoute.tsx)

---

## 👤 TEST USERS

| User | System Role | OTA Role | Expected Behavior |
|------|-------------|----------|-------------------|
| `test_superadmin` | super_admin | (none) | Full access to ALL modules |
| `test_superadmin_ota` | super_admin | ota_lead | Full access + OTA module |
| `test_admin` | admin | (none) | Full access except Test Lab |
| `test_admin_ota` | admin | ota_staff | Full access + OTA module |
| `test_ketoan` | ke_toan | (none) | Finance access only |
| `test_ketoan_ota` | ke_toan | ota_lead | Finance + OTA module |
| `test_ota_lead` | (none) | ota_lead | OTA module + Dashboard ONLY |
| `test_ota_staff` | (none) | ota_staff | Limited OTA module ONLY |

---

## ✅ TEST MATRIX

### 1. SUPER_ADMIN (no OTA role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows ALL items | ✅ | | ☐ |
| Dashboard loads (bookings_mirror) | ✅ | | ☐ |
| /bookings page loads | ✅ | | ☐ |
| /ota-payouts page loads | ✅ | | ☐ |
| /host-payables page loads | ✅ | | ☐ |
| /reports/pnl loads | ✅ | | ☐ |
| /settings/ledger-entries loads | ✅ | | ☐ |
| /ota-operations/projects loads | ✅ | | ☐ |
| /ota-operations/tasks loads | ✅ | | ☐ |
| No 401/403 errors in console | ✅ | | ☐ |

### 2. SUPER_ADMIN + OTA_LEAD (mixed role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows ALL items | ✅ | | ☐ |
| **Dashboard loads (bookings_mirror)** | ✅ | | ☐ |
| **/bookings page loads** | ✅ | | ☐ |
| **/ota-payouts page loads** | ✅ | | ☐ |
| **/host-payables page loads** | ✅ | | ☐ |
| **/reports/pnl loads** | ✅ | | ☐ |
| **/settings/ledger-entries loads** | ✅ | | ☐ |
| /ota-operations/projects loads | ✅ | | ☐ |
| /ota-operations/tasks loads | ✅ | | ☐ |
| Create OTA project works | ✅ | | ☐ |
| **No RLS blocking errors** | ✅ | | ☐ |

> ⚠️ **CRITICAL**: Items in bold were BLOCKED before fix

### 3. ADMIN + OTA_STAFF (mixed role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows all except Test Lab | ✅ | | ☐ |
| **Dashboard loads** | ✅ | | ☐ |
| **/bookings page loads** | ✅ | | ☐ |
| **/partners page loads** | ✅ | | ☐ |
| /ota-operations/my-tasks loads | ✅ | | ☐ |
| /ota-operations/tasks loads | ✅ | | ☐ |
| Cannot access /test-lab | ❌ 403 | | ☐ |
| **No RLS blocking errors** | ✅ | | ☐ |

### 4. KE_TOAN + OTA_LEAD (mixed role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows Finance + OTA items | ✅ | | ☐ |
| **Dashboard loads** | ✅ | | ☐ |
| **/collections page loads** | ✅ | | ☐ |
| **/host-payables page loads** | ✅ | | ☐ |
| **/ledger-entries loads** | ✅ | | ☐ |
| /ota-operations/projects loads | ✅ | | ☐ |
| /ota-operations/kpi loads | ✅ | | ☐ |
| Cannot access /partners | ❌ 403 | | ☐ |
| Cannot access /stays | ❌ 403 | | ☐ |
| **No RLS blocking errors** | ✅ | | ☐ |

### 5. OTA_LEAD ONLY (pure OTA role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows Dashboard + OTA items | ✅ | | ☐ |
| Dashboard loads (limited data) | ✅ | | ☐ |
| /ota-operations/my-tasks loads | ✅ | | ☐ |
| /ota-operations/projects loads | ✅ | | ☐ |
| /ota-operations/tasks loads | ✅ | | ☐ |
| /ota-operations/kpi loads | ✅ | | ☐ |
| Create OTA project works | ✅ | | ☐ |
| Assign tasks works | ✅ | | ☐ |
| **Cannot access /bookings** | ❌ 403 | | ☐ |
| **Cannot access /partners** | ❌ 403 | | ☐ |
| **Cannot access /host-payables** | ❌ 403 | | ☐ |
| **Cannot access /ota-payouts** | ❌ 403 | | ☐ |
| **Cannot access /ledger-entries** | ❌ 403 | | ☐ |

> ✅ **CORRECT**: Pure OTA users MUST be blocked from sensitive tables

### 6. OTA_STAFF ONLY (pure OTA role)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Login successful | ✅ | | ☐ |
| Sidebar shows Dashboard + My Tasks | ✅ | | ☐ |
| Dashboard loads (limited) | ✅ | | ☐ |
| /ota-operations/my-tasks loads | ✅ | | ☐ |
| /ota-operations/tasks loads | ✅ | | ☐ |
| Update task status works | ✅ | | ☐ |
| Upload evidence works | ✅ | | ☐ |
| **Cannot access /ota-operations/projects** | ❌ 403 | | ☐ |
| **Cannot access /ota-operations/kpi** | ❌ 403 | | ☐ |
| **Cannot access /bookings** | ❌ 403 | | ☐ |
| **Cannot access any finance page** | ❌ 403 | | ☐ |

---

## 🔍 NETWORK TAB CHECKS

For each user, open browser DevTools > Network tab and verify:

| Check | Expected |
|-------|----------|
| No 401 Unauthorized responses | ✅ |
| No 403 Forbidden (for authorized pages) | ✅ |
| No "Row level security" errors | ✅ |
| Supabase queries return data | ✅ |

---

## 📊 PASS CRITERIA

| Criteria | Required |
|----------|----------|
| Super_admin can access ALL modules | ✅ |
| Super_admin + OTA can access ALL modules | ✅ |
| Admin + OTA can access admin modules + OTA | ✅ |
| Pure OTA users BLOCKED from sensitive tables | ✅ |
| OTA module works for OTA roles | ✅ |
| No regression in existing functionality | ✅ |

---

## 🐛 KNOWN ISSUES / EDGE CASES

1. **Dashboard for pure OTA**: May show "no data" for charts that query bookings_mirror - this is EXPECTED behavior
2. **OTA KPI page**: Uses RPC `ota_get_kpi()` which aggregates data - OTA users CAN see KPI stats
3. **Detail pages**: `/ota-operations/projects/:id` and `/ota-operations/tasks/:id` require project membership check

---

## ✍️ SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Engineer | | | |
| Dev Lead | | | |
| Security Review | | | |

