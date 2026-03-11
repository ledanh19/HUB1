# 🔧 ROOMRISE PERMISSION AUDIT - PATCH PLAN

**Date**: January 8, 2026  
**Status**: Implementation roadmap ready  
**Priority**: HIGH - Fixes "superadmin OK, user fail" syndrome

---

## 🎯 PATCH OVERVIEW

**Total Patches**: 5 critical + 2 high-priority  
**Estimated Effort**: 4-6 hours implementation + 2 hours testing  
**Risk Level**: MEDIUM (requires SQL migration + frontend changes)

---

## PATCH EXECUTION ORDER (SAFE SEQUENCE)

```
1. [SQL] Fix bookings_mirror RLS (CRITICAL - security)
2. [SQL] Add OTA table RLS policies (HIGH - data isolation)
3. [TypeScript] Fix OTA role default permissions (CRITICAL - access)
4. [SQL] Seed missing permissions (MEDIUM - consistency)
5. [TypeScript] Add RLS fallback error handling (HIGH - UX)
6. [SQL] Verification queries (VALIDATION)
7. [E2E] Run test matrix (VALIDATION)
```

**Safe Rollback**: Each patch includes rollback SQL/code

---

## PATCH 1: Fix bookings_mirror RLS Policy (SECURITY CRITICAL)

### 🐛 ROOT CAUSE
**File**: `supabase/migrations/20251214075415...sql` line 546

```sql
-- CURRENT (WRONG):
CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true); -- ❌ Allows ALL authenticated users including OTA roles
```

**Problem**: OTA staff/lead can query financial data directly via browser console

**Exploit**:
```javascript
// ota_staff can run this:
const { data } = await supabase.from('bookings_mirror').select('*');
// Returns ALL bookings (security violation)
```

### ✅ PATCH

**File**: `PATCH_001_bookings_mirror_rls_deny_ota.sql`

```sql
-- ============================================================
-- PATCH 001: Deny OTA roles access to bookings_mirror
-- ============================================================
-- Date: 2026-01-08
-- Issue: OTA roles (ota_staff, ota_lead) can SELECT sensitive data
-- Spec: OTA MUST use RPC ota_kpi_get_data ONLY
-- ============================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Bookings mirror viewable by authenticated" ON public.bookings_mirror;

-- New policy: DENY if user is OTA role
CREATE POLICY "bookings_mirror_select_deny_ota" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (
  -- Allow if user is NOT an OTA role
  NOT is_ota_role() 
  -- is_ota_role() returns TRUE if user is ota_staff or ota_lead
);

COMMENT ON POLICY "bookings_mirror_select_deny_ota" ON public.bookings_mirror IS
'Deny SELECT access for OTA roles (ota_staff, ota_lead). They must use RPC ota_kpi_get_data.';

-- Verify helper function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_ota_role'
  ) THEN
    RAISE EXCEPTION 'Helper function is_ota_role() not found. Run migration 20260107_001_ota_helper_functions.sql first.';
  END IF;
END$$;
```

**Rollback**:
```sql
-- Restore old policy (ONLY FOR ROLLBACK)
DROP POLICY IF EXISTS "bookings_mirror_select_deny_ota" ON public.bookings_mirror;

CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true);
```

### 🧪 ACCEPTANCE CRITERIA
- [ ] ota_staff runs `supabase.from('bookings_mirror').select('*')` → Error 42501
- [ ] ota_lead same result → Error 42501
- [ ] admin runs same query → Returns data ✅
- [ ] ke_toan runs same query → Returns data ✅
- [ ] OTA KPI page still works (uses RPC) ✅

### 📊 IMPACT
- **Security**: ✅ Closes data leak vulnerability
- **Performance**: ⚠️ None (policy is simple boolean check)
- **Breaking Changes**: ❌ None (OTA users should already use RPC)

---

## PATCH 2: Add OTA Table RLS Policies (DATA ISOLATION)

### 🐛 ROOT CAUSE
**Status**: RLS policies for `ota_projects`, `ota_tasks`, `ota_project_members` NOT FOUND in migrations

**Problem**: 
- Without RLS, queries may fail or return all data
- Project isolation not enforced at database level

**Current Behavior**:
```typescript
// Frontend code (ProjectsPage.tsx):
const { data: projects } = await supabase
  .from('ota_projects')
  .select('*');
// What happens? Depends on RLS:
// - No policy: Fails with RLS error
// - USING(true): Returns ALL projects (wrong)
// - Proper policy: Returns only accessible projects
```

### ✅ PATCH

**File**: `PATCH_002_ota_table_rls_policies.sql`

```sql
-- ============================================================
-- PATCH 002: Add RLS policies for OTA tables
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Enforce project-based access control at DB level
-- ============================================================

-- ============================================================
-- 1. ota_projects TABLE
-- ============================================================

-- Enable RLS if not already
ALTER TABLE public.ota_projects ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - User must be project member or admin
CREATE POLICY "ota_projects_select" 
ON public.ota_projects 
FOR SELECT TO authenticated 
USING (
  has_ota_project_access(id) 
  -- Returns TRUE if:
  -- 1. User in ota_project_members for this project, OR
  -- 2. User is admin/super_admin
);

-- Policy: INSERT - Only Lead/Admin can create projects
CREATE POLICY "ota_projects_insert" 
ON public.ota_projects 
FOR INSERT TO authenticated 
WITH CHECK (
  is_ota_lead_or_admin()
);

-- Policy: UPDATE - Only Lead/Admin can update projects
CREATE POLICY "ota_projects_update" 
ON public.ota_projects 
FOR UPDATE TO authenticated 
USING (
  has_ota_project_access(id) AND is_ota_lead_or_admin()
);

-- Policy: DELETE - Only admin can delete (soft delete preferred)
CREATE POLICY "ota_projects_delete" 
ON public.ota_projects 
FOR DELETE TO authenticated 
USING (
  has_role(auth.uid(), 'admin')
);

-- ============================================================
-- 2. ota_tasks TABLE
-- ============================================================

ALTER TABLE public.ota_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - User must have access to parent project
CREATE POLICY "ota_tasks_select" 
ON public.ota_tasks 
FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM ota_projects p
    WHERE p.id = project_id
    AND has_ota_project_access(p.id)
  )
);

-- Policy: INSERT - Must be project member (Staff can create)
CREATE POLICY "ota_tasks_insert" 
ON public.ota_tasks 
FOR INSERT TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ota_projects p
    WHERE p.id = project_id
    AND has_ota_project_access(p.id)
  )
);

-- Policy: UPDATE - Must be project member
CREATE POLICY "ota_tasks_update" 
ON public.ota_tasks 
FOR UPDATE TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM ota_projects p
    WHERE p.id = project_id
    AND has_ota_project_access(p.id)
  )
);

-- Policy: DELETE - Only Lead/Admin
CREATE POLICY "ota_tasks_delete" 
ON public.ota_tasks 
FOR DELETE TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM ota_projects p
    WHERE p.id = project_id
    AND has_ota_project_access(p.id)
  )
  AND is_ota_lead_or_admin()
);

-- ============================================================
-- 3. ota_project_members TABLE
-- ============================================================

ALTER TABLE public.ota_project_members ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Can view members of projects you have access to
CREATE POLICY "ota_project_members_select" 
ON public.ota_project_members 
FOR SELECT TO authenticated 
USING (
  has_ota_project_access(project_id)
);

-- Policy: INSERT - Only Lead/Admin can add members
CREATE POLICY "ota_project_members_insert" 
ON public.ota_project_members 
FOR INSERT TO authenticated 
WITH CHECK (
  has_ota_project_access(project_id) AND is_ota_lead_or_admin()
);

-- Policy: UPDATE - Only Lead/Admin can modify members
CREATE POLICY "ota_project_members_update" 
ON public.ota_project_members 
FOR UPDATE TO authenticated 
USING (
  has_ota_project_access(project_id) AND is_ota_lead_or_admin()
);

-- Policy: DELETE - Only Admin (prefer soft delete via is_active)
CREATE POLICY "ota_project_members_delete" 
ON public.ota_project_members 
FOR DELETE TO authenticated 
USING (
  has_role(auth.uid(), 'admin')
);

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check all policies created
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ota_projects' AND policyname = 'ota_projects_select') THEN
    v_missing := v_missing || 'ota_projects_select, ';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ota_tasks' AND policyname = 'ota_tasks_select') THEN
    v_missing := v_missing || 'ota_tasks_select, ';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ota_project_members' AND policyname = 'ota_project_members_select') THEN
    v_missing := v_missing || 'ota_project_members_select, ';
  END IF;
  
  IF v_missing != '' THEN
    RAISE WARNING 'Missing RLS policies: %', v_missing;
  ELSE
    RAISE NOTICE 'All OTA RLS policies created successfully';
  END IF;
END$$;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON POLICY "ota_projects_select" ON public.ota_projects IS
'Users can SELECT projects they are members of (via ota_project_members) or if they are admin/super_admin.';

COMMENT ON POLICY "ota_tasks_select" ON public.ota_tasks IS
'Users can SELECT tasks from projects they have access to. Project membership checked via has_ota_project_access().';

COMMENT ON POLICY "ota_project_members_select" ON public.ota_project_members IS
'Users can view member list of projects they have access to.';
```

**Rollback**:
```sql
-- Drop all OTA RLS policies
DROP POLICY IF EXISTS "ota_projects_select" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_insert" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_update" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_delete" ON public.ota_projects;

DROP POLICY IF EXISTS "ota_tasks_select" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_insert" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_update" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_delete" ON public.ota_tasks;

DROP POLICY IF EXISTS "ota_project_members_select" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_insert" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_update" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_delete" ON public.ota_project_members;

-- Optionally disable RLS (NOT RECOMMENDED)
-- ALTER TABLE public.ota_projects DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.ota_tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.ota_project_members DISABLE ROW LEVEL SECURITY;
```

### 🧪 ACCEPTANCE CRITERIA
- [ ] ota_staff queries `ota_projects` → Returns only projects where user is member
- [ ] ota_lead queries `ota_tasks` → Returns only tasks from accessible projects
- [ ] ota_staff cannot see `ota_project_members` of projects they're not in → Empty result
- [ ] admin queries → Returns all data ✅

### 📊 IMPACT
- **Security**: ✅ Enforces project isolation at DB level
- **Performance**: ⚠️ Adds policy evaluation overhead (minimal - uses indexed foreign keys)
- **Breaking Changes**: ⚠️ May break direct table queries (use RPCs instead)

---

## PATCH 3: Fix OTA Role Default Permissions (CRITICAL - ACCESS)

### 🐛 ROOT CAUSE
**File**: `src/hooks/useUserPagePermissions.ts` lines 247-262

```typescript
case 'ota_lead':
  return [
    '/',
    '/ota-operations/projects',
    '/ota-operations/tasks', // ❌ WRONG - sidebar shows /ota-operations/my-tasks
    '/ota-operations/kpi',
    '/ota-messages',
  ];

case 'ota_staff':
  return [
    '/',
    '/ota-operations/tasks', // ❌ WRONG - sidebar shows /ota-operations/my-tasks
    '/ota-messages',
  ];
```

**Problem**: 
- Sidebar item href: `/ota-operations/my-tasks`
- Default permission: `/ota-operations/tasks`
- **Mismatch** → User clicks sidebar → Redirect to 403

**Impact**: "superadmin OK, ota_staff fail" syndrome

### ✅ PATCH

**File**: `src/hooks/useUserPagePermissions.ts`

```typescript
// REPLACE lines 247-262 with:

case 'ota_lead':
  return [
    '/',
    '/ota-operations/my-tasks',      // ✅ FIXED - matches sidebar
    '/ota-operations/projects',       // ✅ Can view all projects
    '/ota-operations/tasks',          // ✅ Can view all tasks page
    '/ota-operations/kpi',            // ✅ Can view KPI dashboard
    '/ota-messages',                  // ✅ Can view OTA messages
  ];

case 'ota_staff':
  return [
    '/',
    '/ota-operations/my-tasks',      // ✅ FIXED - matches sidebar
    '/ota-operations/projects',       // ⚠️ NEW - view-only (to see which projects exist)
    '/ota-messages',                  // ✅ Can view OTA messages
  ];
  
// Note: ota_staff should NOT have:
// - /ota-operations/tasks (all tasks - Lead only)
// - /ota-operations/kpi (KPI dashboard - Lead only)
```

**Full Patch Code**:

```typescript
export function getDefaultPagesForRole(role: AppRole): string[] {
  switch (role) {
    case 'super_admin':
      return ALL_PAGES.map((p) => p.path);
      
    case 'admin':
      return ALL_PAGES.filter((p) => 
        p.path !== '/test-lab' && p.path !== '/test-center-live'
      ).map((p) => p.path);
      
    case 'ke_toan':
      return [
        '/',
        '/bookings',
        '/collections',
        '/ota-payouts',
        '/disputes',
        '/host-deposits',
        '/host-payables',
        '/host-payables/aging',
        '/host-payables/settlement',
        '/services/payables',
        '/settlements/history',
        '/payments/requests',
        '/payments/cashout',
        '/settings/cash-transfers',
        '/settings/cash-accounts',
        '/settings/mapping-rules',
        '/settings/ledger-entries',
        '/reports/pnl',
        '/reports/cashflow',
        '/audit-logs',
      ];
      
    case 'cskh':
      return [
        '/', 
        '/stays',
        '/stays/declarations',
        '/bookings', 
        '/customers',
        '/partners',
        '/ota-messages',
        '/services', 
        '/services/reports',
        '/collections', 
        '/disputes'
      ];
      
    case 'sale':
      return [
        '/', 
        '/stays',
        '/stays/declarations', 
        '/bookings', 
        '/customers',
        '/partners',
        '/ota-messages',
        '/services', 
        '/collections'
      ];
      
    // ✅ FIXED OTA ROLES
    case 'ota_lead':
      return [
        '/',
        '/ota-operations/my-tasks',      // ✅ FIXED
        '/ota-operations/projects',
        '/ota-operations/tasks',          // All tasks view
        '/ota-operations/kpi',
        '/ota-messages',
      ];
      
    case 'ota_staff':
      return [
        '/',
        '/ota-operations/my-tasks',      // ✅ FIXED
        '/ota-operations/projects',       // ✅ ADDED - view-only access
        '/ota-messages',
      ];
      
    default:
      return ['/'];
  }
}
```

**Rollback**:
```typescript
// Revert to original (ONLY IF NEEDED):
case 'ota_lead':
  return [
    '/',
    '/ota-operations/projects',
    '/ota-operations/tasks',
    '/ota-operations/kpi',
    '/ota-messages',
  ];

case 'ota_staff':
  return [
    '/',
    '/ota-operations/tasks',
    '/ota-messages',
  ];
```

### 🧪 ACCEPTANCE CRITERIA
- [ ] ota_staff logs in → Sidebar shows "My Tasks" ✅
- [ ] ota_staff clicks "My Tasks" → Page loads (no redirect) ✅
- [ ] ota_staff clicks "Projects" → Page loads (view-only) ✅
- [ ] ota_staff does NOT see "All Tasks" or "KPI" in sidebar ✅
- [ ] ota_lead logs in → Sidebar shows all 4 OTA items ✅
- [ ] ota_lead clicks "My Tasks" → Page loads ✅

### 📊 IMPACT
- **Security**: ✅ None (only fixes access, doesn't change permissions)
- **Performance**: ✅ None
- **Breaking Changes**: ❌ None

### 🔍 ADDITIONAL CONSIDERATION

**Question**: Should `ota_staff` have view access to `/ota-operations/projects`?

**Arguments FOR** (current patch):
- Helps staff understand which projects exist
- View-only (cannot create/edit)
- Page uses RLS → only shows projects they're member of

**Arguments AGAINST**:
- Staff should only focus on tasks, not projects
- Reduces surface area

**Recommendation**: **YES, grant view access** with RLS filtering. Helps staff context (which project their task belongs to).

**Alternative** (more restrictive):
```typescript
case 'ota_staff':
  return [
    '/',
    '/ota-operations/my-tasks',      // Only own tasks
    '/ota-messages',                  // Messages
  ];
  // NO /ota-operations/projects
```

---

## PATCH 4: Seed Missing Permissions (CONSISTENCY)

### 🐛 ROOT CAUSE
**Problem**: Users with OTA roles may have NO rows in `user_page_permissions` table

**Current Behavior**:
```typescript
// Frontend useCurrentUserPagePermissions():
if (explicitPermissions.length > 0) {
  return explicitPermissions; // Use DB permissions
} else {
  return getDefaultPagesForRole(userRole); // ✅ Fallback to defaults
}
```

**Status**: ✅ WORKING (fallback handles empty permissions)

**However**: Explicit permissions provide:
- Better auditability
- Can be customized per user
- Shows in admin UI (settings/permissions page)

### ✅ PATCH (OPTIONAL BUT RECOMMENDED)

**File**: `PATCH_004_seed_ota_default_permissions.sql`

```sql
-- ============================================================
-- PATCH 004: Seed default permissions for existing OTA users
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Populate user_page_permissions for OTA roles
-- Note: This is OPTIONAL (frontend has fallback)
-- ============================================================

-- Seed permissions for ota_lead users
INSERT INTO user_page_permissions (user_id, page_path, can_use, created_by)
SELECT 
  ur.user_id,
  page_path,
  true as can_use, -- Grant full can_use by default
  auth.uid() as created_by
FROM user_roles ur
CROSS JOIN (
  VALUES 
    ('/'),
    ('/ota-operations/my-tasks'),
    ('/ota-operations/projects'),
    ('/ota-operations/tasks'),
    ('/ota-operations/kpi'),
    ('/ota-messages')
) AS pages(page_path)
WHERE ur.role = 'ota_lead'
ON CONFLICT (user_id, page_path) DO NOTHING;

-- Seed permissions for ota_staff users
INSERT INTO user_page_permissions (user_id, page_path, can_use, created_by)
SELECT 
  ur.user_id,
  page_path,
  true as can_use, -- Grant full can_use by default
  auth.uid() as created_by
FROM user_roles ur
CROSS JOIN (
  VALUES 
    ('/'),
    ('/ota-operations/my-tasks'),
    ('/ota-operations/projects'),
    ('/ota-messages')
) AS pages(page_path)
WHERE ur.role = 'ota_staff'
ON CONFLICT (user_id, page_path) DO NOTHING;

-- Verification
SELECT 
  u.email,
  ur.role,
  COUNT(upp.page_path) as permission_count
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
LEFT JOIN user_page_permissions upp ON upp.user_id = ur.user_id
WHERE ur.role IN ('ota_staff', 'ota_lead')
GROUP BY u.email, ur.role
ORDER BY ur.role, u.email;
```

**Rollback**:
```sql
-- Remove seeded permissions (ONLY IF NEEDED)
DELETE FROM user_page_permissions
WHERE user_id IN (
  SELECT user_id FROM user_roles 
  WHERE role IN ('ota_staff', 'ota_lead')
)
AND page_path IN (
  '/', '/ota-operations/my-tasks', '/ota-operations/projects',
  '/ota-operations/tasks', '/ota-operations/kpi', '/ota-messages'
);
```

### 🧪 ACCEPTANCE CRITERIA
- [ ] ota_staff user has 4 permission rows (/, my-tasks, projects, messages)
- [ ] ota_lead user has 6 permission rows (+ tasks, kpi)
- [ ] Admin UI shows these permissions in settings/permissions page

### 📊 IMPACT
- **Priority**: MEDIUM (nice-to-have, not required due to frontend fallback)
- **Performance**: ✅ None (small table)
- **Breaking Changes**: ❌ None

---

## PATCH 5: Add RLS Error Handling (UX)

### 🐛 ROOT CAUSE
**Problem**: When RLS denies query, page shows cryptic error or blank state

**Current Behavior**:
```typescript
// ProjectsPage.tsx:
const { data: projects, isLoading, error } = useOtaProjects();

if (error) {
  console.error(error); // Just logs to console
  return null; // Page shows nothing
}
```

**Better UX**: Show user-friendly error message

### ✅ PATCH

**File**: `src/hooks/useOtaOperations.ts`

**Add error handling wrapper**:

```typescript
// Add utility function at top of file
function isRlsError(error: any): boolean {
  return error?.code === '42501' || error?.message?.includes('row-level security');
}

function getRlsErrorMessage(error: any): string {
  if (isRlsError(error)) {
    return 'Bạn không có quyền truy cập dữ liệu này. Vui lòng liên hệ admin để được cấp quyền.';
  }
  return error?.message || 'Có lỗi xảy ra khi tải dữ liệu';
}

// Update useOtaProjects hook:
export function useOtaProjects() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-projects', user?.id],
    queryFn: async () => {
      const { data: projects, error } = await supabase
        .from('ota_projects')
        .select('*')
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false });
      
      if (error) {
        // ✅ NEW: Enhanced error with RLS detection
        if (isRlsError(error)) {
          throw new Error('RLS_DENIED: ' + getRlsErrorMessage(error));
        }
        throw error;
      }
      
      if (!projects || projects.length === 0) return [];
      
      const propertyIds = [...new Set(projects.map(p => p.property_id).filter(Boolean))];
      const propertyNames = await fetchPropertyNames(propertyIds);
      
      return projects.map((project: any) => ({
        ...project,
        property_name: propertyNames[project.property_id] || 'Unknown Property',
      })) as OtaProject[];
    },
    enabled: !!user,
  });
}
```

**Update page components to show friendly error**:

```typescript
// ProjectsPage.tsx:
const { data: projects, isLoading, error } = useOtaProjects();

if (error) {
  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Không thể tải dữ liệu</h2>
          <p className="text-muted-foreground mb-4">
            {error.message.includes('RLS_DENIED') 
              ? 'Bạn không có quyền xem danh sách dự án. Vui lòng liên hệ admin.'
              : 'Có lỗi xảy ra. Vui lòng thử lại sau.'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
```

### 🧪 ACCEPTANCE CRITERIA
- [ ] User with no RLS access sees friendly error message (not blank page)
- [ ] Error message mentions "quyền truy cập" (permission issue)
- [ ] Page provides "Tải lại trang" button

### 📊 IMPACT
- **Security**: ✅ None (doesn't change permissions)
- **Performance**: ✅ None
- **Breaking Changes**: ❌ None (only improves UX)

---

## VALIDATION PHASE

### PATCH 6: Verification Queries (SQL KIT)

**File**: `VERIFY_permission_audit_fixes.sql`

```sql
-- ============================================================
-- VERIFICATION QUERIES - Run after all patches applied
-- ============================================================

-- 1. Verify bookings_mirror RLS policy
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'bookings_mirror'
ORDER BY policyname;
-- Expected: "bookings_mirror_select_deny_ota" policy exists
-- qual should contain "NOT is_ota_role()"

-- 2. Verify OTA table RLS policies
SELECT 
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('ota_projects', 'ota_tasks', 'ota_project_members')
ORDER BY tablename, cmd, policyname;
-- Expected: 4 policies per table (SELECT, INSERT, UPDATE, DELETE)

-- 3. Check OTA user permissions
SELECT 
  u.email,
  ur.role,
  array_agg(upp.page_path ORDER BY upp.page_path) as permissions,
  COUNT(upp.page_path) as permission_count
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
LEFT JOIN user_page_permissions upp ON upp.user_id = ur.user_id
WHERE ur.role IN ('ota_staff', 'ota_lead')
GROUP BY u.email, ur.role
ORDER BY ur.role, u.email;
-- Expected: 
-- ota_staff: 4 permissions (/, my-tasks, projects, messages)
-- ota_lead: 6 permissions (+ tasks, kpi)

-- 4. Test RLS as specific user (SIMULATION)
-- Note: Cannot test auth.uid() in SQL query, need actual login

-- Verify helper functions exist
SELECT 
  proname,
  prosrc
FROM pg_proc
WHERE proname IN (
  'is_ota_role',
  'is_ota_lead_or_admin',
  'has_ota_project_access',
  'get_ota_project_role'
)
ORDER BY proname;
-- Expected: 4 functions found

-- 5. Count OTA users
SELECT 
  role,
  COUNT(*) as user_count
FROM user_roles
WHERE role IN ('ota_staff', 'ota_lead')
GROUP BY role;
-- Shows how many users will be affected

-- 6. Verify RLS enabled on tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN (
  'bookings_mirror', 
  'ota_projects', 
  'ota_tasks', 
  'ota_project_members'
)
ORDER BY tablename;
-- Expected: rls_enabled = true for all
```

---

## PATCH EXECUTION CHECKLIST

### Pre-Execution
- [ ] Backup database (Supabase Dashboard → Settings → Backup)
- [ ] Notify team (maintenance window if needed)
- [ ] Have rollback SQL ready
- [ ] Test environment validated (if available)

### Execution Order
- [ ] **PATCH 1**: Run `PATCH_001_bookings_mirror_rls_deny_ota.sql`
- [ ] **PATCH 2**: Run `PATCH_002_ota_table_rls_policies.sql`
- [ ] **PATCH 3**: Edit `useUserPagePermissions.ts` (git commit)
- [ ] **PATCH 4** (optional): Run `PATCH_004_seed_ota_default_permissions.sql`
- [ ] **PATCH 5**: Edit `useOtaOperations.ts` + page components (git commit)
- [ ] **VERIFY**: Run `VERIFY_permission_audit_fixes.sql`

### Post-Execution
- [ ] Clear browser cache / hard reload (Ctrl+Shift+R)
- [ ] Test as super_admin (baseline)
- [ ] Test as ota_lead (primary validation)
- [ ] Test as ota_staff (critical validation)
- [ ] Run E2E test matrix from REPRO PASS doc
- [ ] Update docs if needed
- [ ] Monitor logs for errors (24 hours)

---

## RISK ASSESSMENT

| Patch | Risk Level | Rollback Ease | Production Impact |
|-------|-----------|---------------|-------------------|
| PATCH 1 (bookings RLS) | LOW | ✅ Easy (1 SQL) | ⚠️ OTA users lose direct access (INTENDED) |
| PATCH 2 (OTA RLS) | MEDIUM | ⚠️ Moderate (12 policies) | ⚠️ May break direct queries (use RPCs) |
| PATCH 3 (Default perms) | LOW | ✅ Easy (git revert) | ✅ None (frontend only) |
| PATCH 4 (Seed perms) | LOW | ✅ Easy (DELETE query) | ✅ None (optional) |
| PATCH 5 (Error handling) | LOW | ✅ Easy (git revert) | ✅ None (UX improvement) |

**Overall Risk**: MEDIUM  
**Recommended Approach**: Deploy to staging first, validate 24 hours, then production

---

## DONE CRITERIA (FROM SPEC)

✅ **No more "superadmin OK, user fail"**: All OTA roles can access assigned pages  
✅ **Sidebar always matches routes**: Path alignment verified  
✅ **Permissions consistent by role**: Default permissions match sidebar items  
✅ **OTA Ops end-to-end**: Staff/Lead can perform all actions per their role  
✅ **Security hardened**: OTA roles cannot bypass RLS to access sensitive data  

---

**Document Version**: 1.0  
**Status**: READY FOR IMPLEMENTATION  
**Next Step**: Execute patches in order → Run verification → Test with users
