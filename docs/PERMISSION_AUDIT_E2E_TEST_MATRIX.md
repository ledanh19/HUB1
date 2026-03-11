# ✅ ROOMRISE PERMISSION AUDIT - E2E TEST MATRIX

**Date**: January 8, 2026  
**Purpose**: End-to-end validation after patches applied  
**Status**: Ready for execution

---

## 📊 TEST MATRIX OVERVIEW

**Test Coverage**: 4 user roles × 15 page paths × 3 validation types = 180 test points

**Roles Under Test**:
1. super_admin (baseline - all pass)
2. admin (secondary baseline)
3. ota_lead (primary validation)
4. ota_staff (most restricted - critical validation)

**Test Dimensions**:
- **View Access**: Can user see the page?
- **Data Visibility**: Does page show correct data subset?
- **Action Permissions**: Can user perform mutations?

---

## 🔑 TEST USER CREDENTIALS

| Role | Email | Password | Default Pages | Notes |
|------|-------|----------|---------------|-------|
| super_admin | test.superadmin@roomrise.com | *Set in Auth* | ALL | Baseline - should work 100% |
| admin | test.admin@roomrise.com | *Set in Auth* | ALL except Test Lab | Secondary baseline |
| ota_lead | test.ota_lead@roomrise.com | *Set in Auth* | 6 OTA pages | Primary validation target |
| ota_staff | test.ota_staff@roomrise.com | *Set in Auth* | 4 OTA pages | Most critical - restricted role |

**Setup**: Create users via Supabase Dashboard → Authentication → Invite User

---

## ✅ E2E TEST MATRIX

### TEST SECTION A: Page Access (View Permission)

**Test Method**: Log in → Navigate to URL → Observe outcome

| Page URL | super_admin | admin | ota_lead | ota_staff | Expected Outcome if ❌ |
|----------|-------------|-------|----------|-----------|----------------------|
| `/` | ✅ | ✅ | ✅ | ✅ | Redirect to /auth |
| `/ota-operations` | ✅ Auto-redirect | ✅ Auto-redirect | ✅ Auto-redirect | ✅ Auto-redirect | Redirect to /ota-operations/my-tasks |
| `/ota-operations/my-tasks` | ✅ | ✅ | ✅ | ✅ | **CRITICAL**: Should load, not 403 |
| `/ota-operations/projects` | ✅ | ✅ | ✅ | ✅ | Shows accessible projects |
| `/ota-operations/tasks` | ✅ | ✅ | ✅ | ❌ | Redirect to / or /403 |
| `/ota-operations/kpi` | ✅ | ✅ | ✅ | ❌ | Redirect to / or /403 |
| `/ota-messages` | ✅ | ✅ | ✅ | ✅ | Access OTA messages |
| `/bookings` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/payments/requests` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/collections` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/host-payables` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/reports/pnl` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/settings/permissions` | ✅ | ✅ | ❌ | ❌ | Redirect to / or /403 |
| `/test-lab` | ✅ | ❌ | ❌ | ❌ | Redirect to / or /403 |
| `/test-center-live` | ✅ | ❌ | ❌ | ❌ | Redirect to / or /403 |

**Test Results**:
- [ ] super_admin: __/15 pass
- [ ] admin: __/15 pass (expected 13/15 - Test Lab/Center denied)
- [ ] ota_lead: __/15 pass (expected 6/15 - OTA pages only)
- [ ] ota_staff: __/15 pass (expected 4/15 - limited OTA pages)

---

### TEST SECTION B: Sidebar Visibility

**Test Method**: Log in → Observe sidebar → Count visible groups/items

| User Role | Expected Sidebar Items | Count | Actual Items | Pass/Fail |
|-----------|------------------------|-------|--------------|-----------|
| super_admin | ALL groups (10+) | ~60 items | | ☐ |
| admin | ALL except Test Lab/Center | ~58 items | | ☐ |
| ota_lead | Dashboard, OTA Operations (4), Messages | 6 items | | ☐ |
| ota_staff | Dashboard, OTA Operations (2), Messages | 4 items | | ☐ |

**Critical Checks**:
- [ ] ota_staff sees "OTA Operations" group (not hidden)
- [ ] ota_staff sees "My Tasks" inside group
- [ ] ota_staff does NOT see "All Tasks" or "KPI"
- [ ] ota_lead sees all 4 OTA Operations items

---

### TEST SECTION C: Data Visibility (RLS Validation)

**Prerequisites**: Run SQL KIT SETUP section to create test projects (A, B, C)

#### C1: Projects Data

| User | Test | Expected Result | SQL Verification | Actual | Pass/Fail |
|------|------|-----------------|------------------|--------|-----------|
| super_admin | View Projects page | See Project A, B, C (all 3) | `SELECT COUNT(*) FROM ota_projects WHERE...` | | ☐ |
| admin | View Projects page | See Project A, B, C (all 3) | Same | | ☐ |
| ota_lead | View Projects page | See Project A, B ONLY (member of both)<br>❌ NOT see Project C | `SELECT * FROM ota_projects WHERE has_ota_project_access(id)` | | ☐ |
| ota_staff | View Projects page | See Project A ONLY (member)<br>❌ NOT see B, C | Same | | ☐ |

**RLS Test (Browser Console)**:
```javascript
// As ota_staff:
const { data, error } = await supabase
  .from('ota_projects')
  .select('id, name');
console.log('Projects visible:', data?.length); 
// Expected: 1 (Project A only)
// If sees 3 → RLS NOT working
```

#### C2: Tasks Data

| User | Page | Expected Data | Actual | Pass/Fail |
|------|------|---------------|--------|-----------|
| super_admin | /ota-operations/tasks | See Task A1, A2, B1, C1 (all 4) | | ☐ |
| admin | /ota-operations/tasks | See Task A1, A2, B1, C1 (all 4) | | ☐ |
| ota_lead | /ota-operations/my-tasks | See Task A2, B1 (assigned to lead) | | ☐ |
| ota_lead | /ota-operations/tasks | See Task A1, A2, B1 (from Project A, B)<br>❌ NOT see C1 (not member of C) | | ☐ |
| ota_staff | /ota-operations/my-tasks | See Task A1 ONLY (assigned to staff) | | ☐ |
| ota_staff | /ota-operations/tasks | ❌ Page denied (no access) | | ☐ |

#### C3: bookings_mirror Security Test

**CRITICAL SECURITY VALIDATION**:

| User | Test | Expected | Actual | Pass/Fail |
|------|------|----------|--------|-----------|
| super_admin | `supabase.from('bookings_mirror').select('*').limit(1)` | ✅ Returns data | | ☐ |
| admin | Same query | ✅ Returns data | | ☐ |
| ota_lead | Same query | ❌ Error 42501 (RLS denied) | | ☐ |
| ota_staff | Same query | ❌ Error 42501 (RLS denied) | | ☐ |

**Test Steps**:
1. Log in as `ota_staff`
2. Open browser DevTools → Console
3. Paste:
```javascript
const { data, error } = await supabase
  .from('bookings_mirror')
  .select('*')
  .limit(1);

if (error) {
  console.log('✅ PASS: RLS blocked query');
  console.log('Error:', error.code, error.message);
} else {
  console.log('❌ FAIL: RLS did NOT block query');
  console.log('Data leaked:', data);
}
```

**Expected Console Output** (after PATCH 1):
```
✅ PASS: RLS blocked query
Error: 42501 new row violates row-level security policy
```

**Before PATCH 1** (bug state):
```
❌ FAIL: RLS did NOT block query
Data leaked: [{...booking data...}]
```

---

### TEST SECTION D: Action Permissions

#### D1: Task Drag & Drop (Board View)

**Prerequisites**: 
- Log in as test user
- Navigate to `/ota-operations/tasks` (if accessible)
- Switch to Board view

| User | Task | From Status | To Status | Expected | Actual | Pass/Fail |
|------|------|-------------|-----------|----------|--------|-----------|
| ota_staff | Task A1 (own) | TODO | IN_PROGRESS | ✅ Allow | | ☐ |
| ota_staff | Task A1 (own) | IN_PROGRESS | REVIEW | ✅ Allow | | ☐ |
| ota_staff | Task A1 (own) | REVIEW | DONE | ❌ Deny<br>Toast: "Cần Lead/Admin duyệt" | | ☐ |
| ota_staff | Task A2 (not assigned) | TODO | IN_PROGRESS | ❌ Deny<br>Toast: "Staff chỉ có thể thao tác task được giao cho mình" | | ☐ |
| ota_lead | Task A1 | TODO | IN_PROGRESS | ✅ Allow | | ☐ |
| ota_lead | Task A1 | REVIEW | DONE | ✅ Allow (approve) | | ☐ |
| ota_lead | Task B1 | TODO | IN_PROGRESS | ✅ Allow | | ☐ |
| admin | Any task | Any transition | ✅ Allow | | ☐ |

**Visual Checks**:
- [ ] ota_staff: Task A2 shows 🔒 icon (cannot drag)
- [ ] ota_staff: Task A1 is draggable (own task)
- [ ] ota_lead: All tasks in Project A, B are draggable
- [ ] ota_lead: Task C1 not visible (Project C not accessible)

#### D2: Create Project (Lead/Admin Only)

| User | Action | Expected | Test Method | Actual | Pass/Fail |
|------|--------|----------|-------------|--------|-----------|
| super_admin | Click "Create Project" button | ✅ Modal opens | Navigate to /ota-operations/projects | | ☐ |
| admin | Same | ✅ Modal opens | Same | | ☐ |
| ota_lead | Same | ✅ Modal opens | Same | | ☐ |
| ota_staff | Same | ❌ Button hidden OR disabled | Same | | ☐ |

#### D3: Payment Request Approval (Finance Only)

| User | Action | Expected | Test Method | Actual | Pass/Fail |
|------|--------|----------|-------------|--------|-----------|
| super_admin | Approve payment request | ✅ Success | Navigate to /payments/requests | | ☐ |
| admin | Same | ✅ Success | Same | | ☐ |
| ke_toan | Same | ✅ Success | Same | | ☐ |
| ota_lead | Click "Phê duyệt" | ❌ Denied OR button disabled | Same | | ☐ |
| ota_staff | Access page | ❌ Page denied (403) | Navigate to URL | | ☐ |

---

### TEST SECTION E: Security Boundaries

#### E1: Cross-Project Access Attempt

**Prerequisites**: ota_staff is member of Project A, NOT member of Project B

| User | Action | Expected | Test Method | Actual | Pass/Fail |
|------|--------|----------|-------------|--------|-----------|
| ota_staff | Navigate to Task B1 detail page<br>`/ota-operations/tasks/33333333-3333-3333-3333-333333333333` | ❌ Error: "Bạn không thuộc dự án này" OR blank page | Type URL directly | | ☐ |
| ota_staff | Try to query Project B via console | ❌ RLS denies | `supabase.from('ota_projects').select('*').eq('id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')` | | ☐ |

**Expected Console Result**:
```javascript
{ data: [], error: null }
// OR
{ data: null, error: { code: '42501', message: 'RLS policy denied' } }
```

#### E2: Role Privilege Escalation Prevention

**Attack Scenario**: Can ota_staff fake ota_lead role?

| Attack Vector | Expected Defense | Test Method | Result | Pass/Fail |
|---------------|------------------|-------------|--------|-----------|
| Modify React Query cache to inject `userRole: 'ota_lead'` | ❌ Backend RPC still checks server-side role | DevTools → React Query DevTools → Edit cache | | ☐ |
| Call RPC `ota_kpi_get_data` directly | ❌ RPC checks `is_ota_lead_or_admin()` | Console: `supabase.rpc('ota_kpi_get_data', {...})` | | ☐ |
| Change URL to `/ota-operations/kpi` | ❌ ProtectedRoute checks real permissions | Type URL in browser | | ☐ |

**Test Steps** (Privilege Escalation Attempt):
1. Log in as `ota_staff`
2. Open React Query DevTools (bottom-right icon)
3. Find query `['user-role', '<user_id>']`
4. Click "Edit" → Change `ota_staff` to `ota_lead`
5. Try to access `/ota-operations/kpi`
6. **Expected**: Still denied (ProtectedRoute re-fetches from server)

---

### TEST SECTION F: User Experience & Error Handling

#### F1: Friendly Error Messages

| Scenario | Expected Error Message | Test Method | Actual | Pass/Fail |
|----------|------------------------|-------------|--------|-----------|
| ota_staff clicks sidebar item not in permissions | Redirect to `/` or friendly "Không có quyền" message | Click restricted sidebar item | | ☐ |
| RLS denies query on Projects page | "Bạn không có quyền xem danh sách dự án" | Log in as user without project access | | ☐ |
| Network error loading data | "Có lỗi xảy ra. Vui lòng thử lại sau." | Disconnect internet → load page | | ☐ |

#### F2: Sidebar Responsiveness to Permission Changes

**Test Steps**:
1. Log in as `ota_staff`
2. Admin adds new permission: `/reports/pnl`
3. User refreshes page (Ctrl+R)
4. **Expected**: "Báo cáo" group now visible in sidebar

| Before Permission | After Permission Added | After Refresh | Pass/Fail |
|-------------------|------------------------|---------------|-----------|
| No "Báo cáo" group | Admin adds `/reports/pnl` | "Báo cáo" group visible | ☐ |

---

## 📊 TEST RESULTS SUMMARY

### Overall Test Statistics

| Test Section | Total Tests | Passed | Failed | Blocked | Pass Rate |
|--------------|-------------|--------|--------|---------|-----------|
| A. Page Access | 60 | ___ | ___ | ___ | ___% |
| B. Sidebar Visibility | 16 | ___ | ___ | ___ | ___% |
| C. Data Visibility | 30 | ___ | ___ | ___ | ___% |
| D. Action Permissions | 20 | ___ | ___ | ___ | ___% |
| E. Security Boundaries | 10 | ___ | ___ | ___ | ___% |
| F. UX & Error Handling | 4 | ___ | ___ | ___ | ___% |
| **TOTAL** | **140** | ___ | ___ | ___ | ___% |

### Critical Bug Tracking

| Bug ID | Description | Reproduced | Fixed | Verified | Status |
|--------|-------------|------------|-------|----------|--------|
| BUG-1 | ota_staff cannot access My Tasks | ☐ | ☐ | ☐ | ⏳ |
| BUG-2 | ota_lead same issue (My Tasks) | ☐ | ☐ | ☐ | ⏳ |
| BUG-3 | OTA users can query bookings_mirror | ☐ | ☐ | ☐ | ⏳ |
| BUG-4 | ota_lead sees non-member projects | ☐ | ☐ | ☐ | ⏳ |
| BUG-5 | Sidebar label mismatch (cosmetic) | ☐ | ☐ | ☐ | ⏳ |

### Role-Specific Results

| Role | Page Access | Data Visibility | Actions | Security | Overall |
|------|-------------|-----------------|---------|----------|---------|
| super_admin | ___/15 | ___/10 | ___/10 | ___/5 | ___% |
| admin | ___/15 | ___/10 | ___/10 | ___/5 | ___% |
| ota_lead | ___/15 | ___/10 | ___/10 | ___/5 | ___% |
| ota_staff | ___/15 | ___/10 | ___/10 | ___/5 | ___% |

---

## ✅ ACCEPTANCE CRITERIA (From Original Spec)

**System passes audit if ALL criteria met**:

- [ ] **No "superadmin OK, user fail"**: All roles can access their designated pages without errors
- [ ] **Sidebar matches routes**: Every sidebar item href has corresponding route and permission
- [ ] **Permissions consistent**: Default permissions align with sidebar visibility
- [ ] **OTA Ops end-to-end**: Staff/Lead can perform all workflow actions per their role
- [ ] **Security hardened**: OTA roles cannot bypass RLS to access sensitive data
- [ ] **Zero 403 false positives**: Users never see 403 for pages they should access
- [ ] **Clear error messages**: Users understand why access is denied (not blank pages)

---

## 🔧 TEST EXECUTION INSTRUCTIONS

### Pre-Test Setup

1. **Database**:
   ```bash
   # Run SQL KIT SETUP section in Supabase SQL Editor
   ```

2. **TypeScript Changes**:
   ```bash
   # Apply PATCH 3 from PATCH_PLAN.md
   # Edit src/hooks/useUserPagePermissions.ts
   git commit -am "fix: OTA role default permissions"
   ```

3. **Clear Cache**:
   ```bash
   # In browser:
   Ctrl+Shift+R (hard reload)
   # Or DevTools → Application → Clear Storage
   ```

### Test Execution

**For Each Role**:
1. Log out completely
2. Log in as test user
3. Open new incognito window (recommended)
4. Work through test sections A-F
5. Mark ✅ pass / ❌ fail in tables
6. Document any unexpected behavior

**Time Estimate**: 2-3 hours for full matrix execution

---

## 📝 TEST REPORT TEMPLATE

```markdown
## Test Execution Report

**Tester**: _______________
**Date**: _______________
**Environment**: Production | Staging | Local
**Browser**: Chrome | Firefox | Safari
**Patches Applied**: PATCH 1 ✅ | PATCH 2 ✅ | PATCH 3 ✅ | PATCH 4 ☐

### Critical Findings

**HIGH Priority**:
1. [Description]
2. [Description]

**MEDIUM Priority**:
1. [Description]

**LOW Priority** (Cosmetic):
1. [Description]

### Overall Assessment

- [ ] System PASSES audit (all criteria met)
- [ ] System FAILS audit (critical issues remain)
- [ ] Partial pass (minor issues only)

### Next Steps

1. [Action item]
2. [Action item]

### Screenshots

[Attach screenshots of failures/errors]
```

---

## 🚨 KNOWN LIMITATIONS

1. **RLS Testing**: Cannot fully test `auth.uid()` RLS policies via SQL - requires actual user login
2. **React Query Cache**: May cache stale permissions - hard reload required
3. **Browser Console RLS Test**: Works for SELECT only - INSERT/UPDATE/DELETE harder to test
4. **Detail Routes**: ProtectedRoute normalization may hide some permission bugs

---

**Document Version**: 1.0  
**Status**: READY FOR EXECUTION  
**Estimated Execution Time**: 2-3 hours  
**Next Step**: Execute tests → Fill in "Actual" columns → Report findings
