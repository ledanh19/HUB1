# 🧪 ROOMRISE PERMISSION AUDIT - REPRO PASS (Test Matrix)

**Date**: January 8, 2026  
**Purpose**: Systematic reproduction of "superadmin OK, user fail" issues  
**Status**: Test scenarios ready for manual execution

---

## TEST MATRIX OVERVIEW

**4 Test Users**:
1. **super_admin** (baseline - should work)
2. **admin** (secondary baseline)
3. **ota_lead** (first OTA role test)
4. **ota_staff** (most restricted OTA role)

**Test Categories**:
- A. Authentication & Role Assignment
- B. Sidebar Visibility
- C. Page Access & Routing
- D. Data Visibility
- E. Action Permissions
- F. Security Boundaries

---

## A) AUTHENTICATION & ROLE ASSIGNMENT

### TEST-A1: User Login & Role Fetch

| User | Email | Expected Role | Expected Auth | Test Steps | Expected Result | Actual Result |
|------|-------|---------------|---------------|------------|-----------------|---------------|
| super_admin | test.superadmin@roomrise.com | `super_admin` | ✅ Success | 1. Log in<br>2. Check browser DevTools → React Query cache → `['user-role']` | Role = `super_admin` | **PENDING** |
| admin | test.admin@roomrise.com | `admin` | ✅ Success | Same as above | Role = `admin` | **PENDING** |
| ota_lead | test.ota_lead@roomrise.com | `ota_lead` | ✅ Success | Same as above | Role = `ota_lead` | **PENDING** |
| ota_staff | test.ota_staff@roomrise.com | `ota_staff` | ✅ Success | Same as above | Role = `ota_staff` | **PENDING** |

**SQL to Create Test Users** (if not exist):
```sql
-- Create test users in Supabase Auth Dashboard first, then:

-- Assign roles
INSERT INTO user_roles (user_id, role) VALUES
  ((SELECT id FROM auth.users WHERE email = 'test.superadmin@roomrise.com'), 'super_admin'),
  ((SELECT id FROM auth.users WHERE email = 'test.admin@roomrise.com'), 'admin'),
  ((SELECT id FROM auth.users WHERE email = 'test.ota_lead@roomrise.com'), 'ota_lead'),
  ((SELECT id FROM auth.users WHERE email = 'test.ota_staff@roomrise.com'), 'ota_staff')
ON CONFLICT DO NOTHING;
```

### TEST-A2: Page Permissions Fetch

| User | Query | Expected Permissions | Test Method | Result |
|------|-------|---------------------|-------------|--------|
| super_admin | RPC `get_user_page_permissions` | ALL pages (60+) | Check DevTools → `['current-user-page-permissions']` | **PENDING** |
| admin | RPC `get_user_page_permissions` | ALL except Test Lab/Test Center | Same | **PENDING** |
| ota_lead | RPC `get_user_page_permissions` | Empty (uses defaults) OR explicit if seeded | Same | **PENDING** |
| ota_staff | RPC `get_user_page_permissions` | Empty (uses defaults) OR explicit if seeded | Same | **PENDING** |

**Note**: If `get_user_page_permissions` returns empty array, system falls back to `getDefaultPagesForRole()` in frontend.

---

## B) SIDEBAR VISIBILITY

### TEST-B1: OTA Operations Group Visibility

| User | Expected Sidebar Groups | Test Method | Expected OTA Items | Result |
|------|------------------------|-------------|-------------------|--------|
| super_admin | ALL groups visible | Open sidebar, scroll | "OTA Operations" group with 4 items:<br>- My Tasks<br>- Projects<br>- All Tasks<br>- KPI | **PENDING** |
| admin | ALL groups visible | Same | Same as super_admin | **PENDING** |
| ota_lead | OTA Ops + Home + Messages | Same | "OTA Operations" group with:<br>- My Tasks ✅<br>- Projects ✅<br>- All Tasks ✅<br>- KPI ✅ | **PENDING** |
| ota_staff | OTA Ops (partial) + Home + Messages | Same | "OTA Operations" group with:<br>- My Tasks ✅<br>- ~~Projects~~ ❌ (hidden)<br>- ~~All Tasks~~ ❌ (hidden)<br>- ~~KPI~~ ❌ (hidden) | **PENDING** |

**Sidebar Filtering Logic** (File: Sidebar.tsx lines 250-265):
```typescript
// Super admin sees all
if (userRole === 'super_admin') return item;

// If item has children, filter children first
if (item.children && item.children.length > 0) {
  const filteredChildren = item.children.filter(child => hasPageAccess(child.href));
  // Parent only shows if at least one child is accessible
  if (filteredChildren.length === 0) return null;
  return { ...item, children: filteredChildren };
}

// Leaf item - check direct access
return hasPageAccess(item.href) ? item : null;
```

**Critical Check**: Does `ota_staff` see "OTA Operations" group at all?
- **If YES**: Group shows, but only "My Tasks" child visible
- **If NO**: Entire group hidden (bug - user can't access their tasks!)

---

## C) PAGE ACCESS & ROUTING

### TEST-C1: OTA Staff Page Access

| Page URL | Expected Access | Navigation Method | Expected Outcome | Actual Result | Error Details |
|----------|-----------------|-------------------|------------------|---------------|---------------|
| `/` | ✅ Allow | Type URL directly | Dashboard loads | **PENDING** | |
| `/ota-operations` | ⚠️ Auto-redirect | Type URL | Redirect to `/ota-operations/my-tasks` | **PENDING** | |
| `/ota-operations/my-tasks` | ✅ Allow | Click sidebar "My Tasks" | Page loads, shows own tasks | **PENDING** | |
| `/ota-operations/tasks` | ❌ Deny | Type URL directly | **BUG**: May allow (has default permission but not in sidebar) | **PENDING** | |
| `/ota-operations/projects` | ❌ Deny | Type URL directly | Redirect to `/` or `/403` | **PENDING** | |
| `/ota-operations/kpi` | ❌ Deny | Type URL directly | Redirect to `/` or `/403` | **PENDING** | |
| `/ota-messages` | ✅ Allow | Type URL directly | Page loads | **PENDING** | |

**CRITICAL TEST**: 
1. Log in as `ota_staff`
2. Look at sidebar - do you see "My Tasks" link?
3. Click "My Tasks"
4. **IF REDIRECTED** → BUG CONFIRMED (permission path mismatch)
5. Check console for error: `"No permission for /ota-operations/my-tasks"`

### TEST-C2: OTA Lead Page Access

| Page URL | Expected Access | Expected Outcome | Actual Result | Error Details |
|----------|-----------------|------------------|---------------|---------------|
| `/` | ✅ Allow | Dashboard loads | **PENDING** | |
| `/ota-operations/my-tasks` | ✅ Allow | Page loads, shows assigned tasks | **PENDING** | |
| `/ota-operations/tasks` | ✅ Allow | Page loads, shows ALL tasks | **PENDING** | |
| `/ota-operations/projects` | ✅ Allow | Page loads, shows all projects | **PENDING** | Check for RLS errors in console |
| `/ota-operations/kpi` | ✅ Allow | Page loads, shows KPI data | **PENDING** | |
| `/ota-messages` | ✅ Allow | Page loads | **PENDING** | |
| `/bookings` | ❌ Deny | Redirect to `/` or `/403` | **PENDING** | |
| `/payments/requests` | ❌ Deny | Redirect to `/` or `/403` | **PENDING** | |

### TEST-C3: Admin Baseline (should all work)

| Page URL | Expected Access | Actual Result |
|----------|-----------------|---------------|
| ALL pages except `/test-lab`, `/test-center-live` | ✅ Allow | **PENDING** |
| `/ota-operations/my-tasks` | ✅ Allow | **PENDING** |
| `/ota-operations/projects` | ✅ Allow | **PENDING** |
| `/ota-operations/tasks` | ✅ Allow | **PENDING** |
| `/ota-operations/kpi` | ✅ Allow | **PENDING** |

---

## D) DATA VISIBILITY

### TEST-D1: OTA Projects Data Access

**Setup**: Create 3 test projects:
```sql
-- Project A: ota_staff is member (STAFF role)
-- Project B: ota_lead is member (LEAD role)
-- Project C: No OTA members (admin only)

-- See SQL KIT section for full setup
```

| User | Page | Expected Data | SQL to Verify | Actual Result |
|------|------|---------------|---------------|---------------|
| ota_staff | `/ota-operations/projects` | ❌ Deny (no access to page) | N/A | **PENDING** |
| ota_lead | `/ota-operations/projects` | ✅ See Project A, B (member of)<br>❌ Should NOT see Project C | `SELECT * FROM ota_projects WHERE id IN (SELECT project_id FROM ota_project_members WHERE user_id = <lead_id>)` | **PENDING** |
| admin | `/ota-operations/projects` | ✅ See ALL projects (A, B, C) | `SELECT * FROM ota_projects` | **PENDING** |

**Test Method**:
1. Log in as `ota_lead`
2. Navigate to `/ota-operations/projects`
3. Count visible projects in UI
4. Open browser DevTools → Network tab → Find query to `ota_projects`
5. Check response: Does it include Project C? (should NOT)

**Expected RLS Behavior** (if policy exists):
```sql
-- Policy should be:
CREATE POLICY "ota_projects_select" ON ota_projects
FOR SELECT USING (
  has_ota_project_access(id) -- Returns true if user is member or admin
);
```

**Bug Indicators**:
- If `ota_lead` sees Project C → RLS too permissive
- If page shows error "RLS policy denied" → RLS too restrictive
- If page shows empty state but should have data → RLS may not exist

### TEST-D2: OTA Tasks Data Access

**Setup**: Create tasks in Projects A, B, C

| User | Page | Expected Data | Actual Result |
|------|------|---------------|---------------|
| ota_staff | `/ota-operations/my-tasks` | ✅ Only tasks assigned to self | **PENDING** |
| ota_staff | `/ota-operations/tasks` | ❌ Deny (no page access) | **PENDING** |
| ota_lead | `/ota-operations/tasks` | ✅ Tasks from Project A, B (member projects)<br>❌ NOT tasks from Project C | **PENDING** |
| admin | `/ota-operations/tasks` | ✅ ALL tasks from A, B, C | **PENDING** |

**Critical Check**: Does `ota_lead` use RPC or direct SELECT?

**File**: useOtaOperations.ts line 227
```typescript
// Uses RPC: ota_get_tasks_with_assignees (secure)
const { data, error } = await supabase.rpc('ota_get_tasks_with_assignees', {
  p_project_id: filters?.projectId || null,
});
```

**Expected**: RPC filters by project membership internally  
**Test**: Verify by checking Network tab → RPC call response

### TEST-D3: bookings_mirror Security Violation

**CRITICAL SECURITY TEST**:

| User | Action | Expected | Test Method | Actual Result |
|------|--------|----------|-------------|---------------|
| ota_staff | Query `bookings_mirror` directly | ❌ Deny | Open browser console:<br>`supabase.from('bookings_mirror').select('*').limit(1)` | **PENDING** |
| ota_lead | Query `bookings_mirror` directly | ❌ Deny | Same | **PENDING** |
| admin | Query `bookings_mirror` directly | ✅ Allow | Same | **PENDING** |

**Expected Error** (after fix):
```json
{
  "code": "42501",
  "message": "new row violates row-level security policy"
}
```

**Current Behavior** (BROKEN):
- Returns data ✅ (should be ❌)
- No error

**Proof of Violation**:
```sql
-- Current policy (WRONG):
CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true); -- ❌ Allows ALL authenticated users
```

---

## E) ACTION PERMISSIONS

### TEST-E1: Task Status Changes (Drag & Drop)

**Setup**: 
- Project X has ota_staff as STAFF role
- Task T1: Assigned to ota_staff, status TODO
- Task T2: Assigned to other user, status TODO

| User | Action | Expected | Test Method | Actual Result |
|------|--------|----------|-------------|---------------|
| ota_staff | Drag T1 from TODO → IN_PROGRESS | ✅ Allow | Board view, drag task | **PENDING** |
| ota_staff | Drag T1 from REVIEW → DONE | ❌ Deny<br>"Cần Lead/Admin duyệt hoàn thành" | Same | **PENDING** |
| ota_staff | Drag T2 (not assigned) | ❌ Deny<br>"Staff chỉ có thể thao tác task được giao cho mình" | Same | **PENDING** |
| ota_lead | Drag any task in Project X | ✅ Allow | Same | **PENDING** |
| ota_lead | Approve T1 (REVIEW → DONE) | ✅ Allow (no modal) | Same | **PENDING** |

**File**: src/lib/otaOps.ts `getDropBehavior()`  
**Validation**: Frontend logic only (no RPC for drag & drop yet)

### TEST-E2: Payment Request Approval

**Setup**: Create test payment request

| User | Action | Expected | Test Method | Actual Result |
|------|--------|----------|-------------|---------------|
| ota_staff | Approve payment request | ❌ Deny<br>"Không có quyền phê duyệt" | Click "Phê duyệt" button | **PENDING** |
| ota_lead | Approve payment request | ❌ Deny | Same | **PENDING** |
| ke_toan | Approve payment request | ✅ Allow | Same | **PENDING** |
| admin | Approve payment request | ✅ Allow | Same | **PENDING** |

**RPC**: `approve_payment_request_secure`  
**Check**: Does RPC verify `can_use` permission for `/payments/requests`?

---

## F) SECURITY BOUNDARIES

### TEST-F1: Cross-Project Access Attempt

**Setup**:
- Project X: ota_staff is member (STAFF role)
- Project Y: ota_staff is NOT member
- Task TY1 in Project Y

| User | Action | Expected | Test Method | Actual Result |
|------|--------|----------|-------------|---------------|
| ota_staff | Open `/ota-operations/tasks/TY1` (Task in Project Y) | ❌ Deny<br>"Bạn không thuộc dự án này" | Type URL directly | **PENDING** |
| ota_staff | Try to drag TY1 (if visible in UI) | ❌ Deny<br>Show 🔒 icon | Board view (if task somehow visible) | **PENDING** |

**File**: TaskDetailPage uses RPC `ota_get_task_detail` which checks project membership

### TEST-F2: Role Privilege Escalation Attempt

**Attack Vector**: Can ota_staff access Lead-only features?

| Attack | Expected Defense | Test Method | Result |
|--------|------------------|-------------|--------|
| Navigate to `/ota-operations/kpi` | ❌ Deny, redirect | Type URL | **PENDING** |
| Modify frontend React Query cache to inject fake `userRole: 'ota_lead'` | ❌ Backend RPC should still deny | DevTools → React Query DevTools → Mutate cache | **PENDING** |
| Call RPC `ota_kpi_get_data` directly via browser console | ❌ RPC checks `is_ota_lead_or_admin()` | `supabase.rpc('ota_kpi_get_data', {...})` | **PENDING** |

**Expected**: RPC uses `auth.uid()` and `user_roles` table (server-side), cannot be spoofed

---

## 🐛 BUG REPRODUCTION CHECKLIST

### BUG-1: "ota_staff cannot access My Tasks page"

**Steps to Reproduce**:
1. Create user with `ota_staff` role
2. Assign to at least one project via `ota_project_members`
3. Log in as this user
4. Observe sidebar - "My Tasks" should be visible
5. Click "My Tasks"
6. **EXPECTED BUG**: Redirected to `/` or `/403`

**Verification**:
```typescript
// Check in useUserPagePermissions.ts line 257-262
case 'ota_staff':
  return [
    '/',
    '/ota-operations/tasks', // ❌ WRONG - should be /ota-operations/my-tasks
    '/ota-messages',
  ];
```

**Console Error**:
```
No permission for path: /ota-operations/my-tasks
Redirecting to first accessible page: /
```

**Status**: ❌ **NOT TESTED YET** | ✅ **REPRODUCED** | ⚠️ **CANNOT REPRODUCE**

---

### BUG-2: "ota_lead same issue (My Tasks)"

**Steps**: Same as BUG-1, but with `ota_lead` role

**Status**: ❌ **NOT TESTED YET** | ✅ **REPRODUCED** | ⚠️ **CANNOT REPRODUCE**

---

### BUG-3: "OTA users can query bookings_mirror"

**Steps to Reproduce**:
1. Log in as `ota_staff` or `ota_lead`
2. Open browser DevTools → Console
3. Run:
```javascript
const { data, error } = await supabase
  .from('bookings_mirror')
  .select('*')
  .limit(10);

console.log('Data:', data);
console.log('Error:', error);
```
4. **EXPECTED BUG**: `data` is populated (should be null)
5. **EXPECTED AFTER FIX**: `error.code === '42501'` (RLS policy denied)

**Status**: ❌ **NOT TESTED YET** | ✅ **REPRODUCED** | ⚠️ **CANNOT REPRODUCE**

---

### BUG-4: "ota_lead can see projects they're not member of"

**Prerequisites**: 
- Create Project C with no ota_project_members entry for test lead

**Steps to Reproduce**:
1. Log in as `ota_lead`
2. Navigate to `/ota-operations/projects`
3. Count visible projects
4. Check DevTools Network tab → Find Supabase query
5. Inspect response: Does it include projects where user is NOT member?

**If YES**: RLS policy missing or too permissive  
**If NO**: Check if page shows error instead (RLS too restrictive)

**Status**: ❌ **NOT TESTED YET** | ✅ **REPRODUCED** | ⚠️ **CANNOT REPRODUCE**

---

### BUG-5: "Sidebar shows 'All Tasks' but user has 'tasks' permission"

**Observation**: Sidebar label mismatch  
**File**: Sidebar.tsx line 197

```typescript
{ label: "All Tasks", href: "/ota-operations/tasks", icon: ListChecks },
```

**Issue**: Label says "All Tasks" but permission/route is `/ota-operations/tasks`  
**Impact**: LOW (naming confusion only, no access issue)

**Status**: ⚠️ **COSMETIC BUG** (document but low priority fix)

---

## 📊 TESTING CHECKLIST

### Prerequisites
- [ ] Test users created in Supabase Auth
- [ ] Roles assigned via `user_roles` table
- [ ] Test projects created (`ota_projects`)
- [ ] Test project memberships created (`ota_project_members`)
- [ ] Test tasks created (`ota_tasks`)
- [ ] Browser DevTools ready (Network + Console tabs)

### Execution Order
- [ ] TEST-A1: Authentication & Role Fetch (all users)
- [ ] TEST-A2: Page Permissions Fetch
- [ ] TEST-B1: Sidebar Visibility (all users)
- [ ] TEST-C1: ota_staff Page Access ⭐ **CRITICAL**
- [ ] TEST-C2: ota_lead Page Access ⭐ **CRITICAL**
- [ ] TEST-C3: admin Baseline
- [ ] TEST-D1: Projects Data Access ⭐ **CRITICAL**
- [ ] TEST-D2: Tasks Data Access
- [ ] TEST-D3: bookings_mirror Security Violation ⭐ **CRITICAL**
- [ ] TEST-E1: Task Status Changes (Drag & Drop)
- [ ] TEST-E2: Payment Request Approval
- [ ] TEST-F1: Cross-Project Access Attempt
- [ ] TEST-F2: Role Privilege Escalation Attempt

### Bug Reproduction
- [ ] BUG-1: ota_staff cannot access My Tasks ⭐ **CRITICAL**
- [ ] BUG-2: ota_lead same issue ⭐ **CRITICAL**
- [ ] BUG-3: OTA users can query bookings_mirror ⭐ **SECURITY CRITICAL**
- [ ] BUG-4: ota_lead sees non-member projects
- [ ] BUG-5: Sidebar label mismatch (low priority)

---

## 📝 TESTING NOTES TEMPLATE

**Tester**: _____________  
**Date**: _____________  
**Browser**: _____________  
**Environment**: Production | Staging | Local

### Test Results Summary
- Total Tests: 25
- Passed: ___
- Failed: ___
- Blocked: ___
- Security Issues Found: ___

### Critical Bugs Confirmed
1. BUG-1 (ota_staff My Tasks): ☐ Reproduced | ☐ Not Reproduced
2. BUG-2 (ota_lead My Tasks): ☐ Reproduced | ☐ Not Reproduced
3. BUG-3 (bookings_mirror RLS): ☐ Reproduced | ☐ Not Reproduced
4. BUG-4 (Project visibility): ☐ Reproduced | ☐ Not Reproduced

### Additional Findings
_Document any unexpected behaviors here..._

---

**Document Version**: 1.0  
**Status**: READY FOR EXECUTION  
**Next Step**: Run tests → Update "Actual Result" columns → Move to PATCH PLAN
