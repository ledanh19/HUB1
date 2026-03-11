# 🗄️ ROOMRISE PERMISSION AUDIT - SQL KIT

**Date**: January 8, 2026  
**Purpose**: Copy-paste SQL for Supabase SQL Editor  
**Usage**: Execute in order, verify results

---

## 📦 SQL KIT CONTENTS

1. **SETUP**: Test data creation
2. **PATCH 1**: Fix bookings_mirror RLS
3. **PATCH 2**: Add OTA table RLS policies
4. **PATCH 4**: Seed default permissions (optional)
5. **VERIFY**: Verification queries
6. **ROLLBACK**: Emergency rollback scripts

---

## 1️⃣ SETUP: Create Test Data

```sql
-- ============================================================
-- TEST DATA SETUP
-- ============================================================
-- Purpose: Create test users, projects, and memberships
-- Note: Create users in Supabase Auth Dashboard first!
-- ============================================================

-- Step 1: Verify test users exist in auth.users
SELECT 
  email,
  id,
  created_at
FROM auth.users
WHERE email IN (
  'test.superadmin@roomrise.com',
  'test.admin@roomrise.com',
  'test.ota_lead@roomrise.com',
  'test.ota_staff@roomrise.com'
)
ORDER BY email;

-- If users don't exist, create them via:
-- Supabase Dashboard → Authentication → Users → Invite User
-- OR use Auth API (requires service role key)

-- Step 2: Assign roles to test users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE email = 'test.superadmin@roomrise.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'test.admin@roomrise.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'ota_lead'
FROM auth.users
WHERE email = 'test.ota_lead@roomrise.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'ota_staff'
FROM auth.users
WHERE email = 'test.ota_staff@roomrise.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify roles assigned
SELECT 
  u.email,
  ur.role,
  ur.created_at
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email LIKE 'test.%@roomrise.com'
ORDER BY u.email, ur.role;

-- Step 3: Create test properties (if not exist)
INSERT INTO public.properties_mirror (id, property_name, property_code)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Test Property A', 'TEST-A'),
  ('00000000-0000-0000-0000-000000000002', 'Test Property B', 'TEST-B'),
  ('00000000-0000-0000-0000-000000000003', 'Test Property C', 'TEST-C')
ON CONFLICT (id) DO UPDATE SET 
  property_name = EXCLUDED.property_name,
  property_code = EXCLUDED.property_code;

-- Step 4: Create test OTA projects
DO $$
DECLARE
  v_admin_id UUID;
  v_lead_id UUID;
BEGIN
  -- Get admin ID for created_by
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test.admin@roomrise.com';
  SELECT id INTO v_lead_id FROM auth.users WHERE email = 'test.ota_lead@roomrise.com';
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found. Create test.admin@roomrise.com first.';
  END IF;

  -- Project A: OTA Staff is member (STAFF role)
  INSERT INTO public.ota_projects (
    id, 
    name, 
    description, 
    property_id, 
    status, 
    created_at,
    updated_at
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Test Project A - Staff Member',
    'Project where ota_staff is a STAFF member',
    '00000000-0000-0000-0000-000000000001',
    'IN_PROGRESS',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

  -- Project B: OTA Lead is member (LEAD role)
  INSERT INTO public.ota_projects (
    id,
    name,
    description,
    property_id,
    status,
    created_at,
    updated_at
  ) VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Test Project B - Lead Member',
    'Project where ota_lead is a LEAD member',
    '00000000-0000-0000-0000-000000000002',
    'IN_PROGRESS',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

  -- Project C: No OTA members (admin only)
  INSERT INTO public.ota_projects (
    id,
    name,
    description,
    property_id,
    status,
    created_at,
    updated_at
  ) VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Test Project C - Admin Only',
    'Project with no OTA members (should be invisible to OTA roles)',
    '00000000-0000-0000-0000-000000000003',
    'PLANNING',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

END$$;

-- Step 5: Create project memberships
DO $$
DECLARE
  v_staff_id UUID;
  v_lead_id UUID;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_staff_id FROM auth.users WHERE email = 'test.ota_staff@roomrise.com';
  SELECT id INTO v_lead_id FROM auth.users WHERE email = 'test.ota_lead@roomrise.com';
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test.admin@roomrise.com';

  -- Add ota_staff to Project A as STAFF
  INSERT INTO public.ota_project_members (
    project_id,
    user_id,
    project_role,
    is_active,
    assigned_at,
    assigned_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    v_staff_id,
    'STAFF',
    true,
    now(),
    v_admin_id
  ) ON CONFLICT (project_id, user_id) DO UPDATE SET
    project_role = EXCLUDED.project_role,
    is_active = true;

  -- Add ota_lead to Project A as LEAD
  INSERT INTO public.ota_project_members (
    project_id,
    user_id,
    project_role,
    is_active,
    assigned_at,
    assigned_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    v_lead_id,
    'LEAD',
    true,
    now(),
    v_admin_id
  ) ON CONFLICT (project_id, user_id) DO UPDATE SET
    project_role = EXCLUDED.project_role,
    is_active = true;

  -- Add ota_lead to Project B as LEAD
  INSERT INTO public.ota_project_members (
    project_id,
    user_id,
    project_role,
    is_active,
    assigned_at,
    assigned_by
  ) VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    v_lead_id,
    'LEAD',
    true,
    now(),
    v_admin_id
  ) ON CONFLICT (project_id, user_id) DO UPDATE SET
    project_role = EXCLUDED.project_role,
    is_active = true;

  -- Project C: NO OTA members (intentionally empty for testing)
  
  RAISE NOTICE 'Test project memberships created successfully';
END$$;

-- Step 6: Create test tasks
DO $$
DECLARE
  v_staff_id UUID;
  v_lead_id UUID;
BEGIN
  SELECT id INTO v_staff_id FROM auth.users WHERE email = 'test.ota_staff@roomrise.com';
  SELECT id INTO v_lead_id FROM auth.users WHERE email = 'test.ota_lead@roomrise.com';

  -- Task in Project A assigned to ota_staff
  INSERT INTO public.ota_tasks (
    id,
    project_id,
    title,
    description,
    assignee_id,
    status,
    priority,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Test Task A1 - Assigned to Staff',
    'Staff should be able to see and edit this task',
    v_staff_id,
    'TODO',
    'MEDIUM',
    CURRENT_DATE + INTERVAL '7 days',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description;

  -- Task in Project A assigned to someone else
  INSERT INTO public.ota_tasks (
    id,
    project_id,
    title,
    description,
    assignee_id,
    status,
    priority,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Test Task A2 - Assigned to Lead',
    'Staff should see but NOT be able to drag (not assigned to them)',
    v_lead_id,
    'IN_PROGRESS',
    'HIGH',
    CURRENT_DATE + INTERVAL '3 days',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description;

  -- Task in Project B (lead only)
  INSERT INTO public.ota_tasks (
    id,
    project_id,
    title,
    description,
    assignee_id,
    status,
    priority,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    '33333333-3333-3333-3333-333333333333',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Test Task B1 - Project B',
    'Only lead can see this (staff not member of Project B)',
    v_lead_id,
    'TODO',
    'URGENT',
    CURRENT_DATE + INTERVAL '1 day',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description;

  -- Task in Project C (admin only)
  INSERT INTO public.ota_tasks (
    id,
    project_id,
    title,
    description,
    assignee_id,
    status,
    priority,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    '44444444-4444-4444-4444-444444444444',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Test Task C1 - Admin Only Project',
    'OTA roles should NOT see this task',
    NULL,
    'PLANNING',
    'LOW',
    CURRENT_DATE + INTERVAL '30 days',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description;

  RAISE NOTICE 'Test tasks created successfully';
END$$;

-- Step 7: Verify test data setup
SELECT 
  'Projects' as category,
  COUNT(*) as count
FROM ota_projects
WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
)
UNION ALL
SELECT 
  'Memberships',
  COUNT(*)
FROM ota_project_members
WHERE project_id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
)
UNION ALL
SELECT 
  'Tasks',
  COUNT(*)
FROM ota_tasks
WHERE project_id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- Expected output:
-- Projects: 3
-- Memberships: 3 (staff in A, lead in A and B)
-- Tasks: 4

RAISE NOTICE '✅ Test data setup complete!';
RAISE NOTICE 'Project A: Staff + Lead members';
RAISE NOTICE 'Project B: Lead only';
RAISE NOTICE 'Project C: No OTA members (admin only)';
```

---

## 2️⃣ PATCH 1: Fix bookings_mirror RLS

```sql
-- ============================================================
-- PATCH 001: Deny OTA roles access to bookings_mirror
-- ============================================================
-- Date: 2026-01-08
-- Priority: CRITICAL - Security Issue
-- Issue: OTA roles can SELECT sensitive booking data
-- ============================================================

-- Backup current policy (for rollback)
SELECT 
  policyname,
  permissive,
  roles::text[],
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'bookings_mirror';

-- Drop old permissive policy
DROP POLICY IF EXISTS "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror;

-- Create new restrictive policy
CREATE POLICY "bookings_mirror_select_deny_ota" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (
  -- Deny if user is OTA role (ota_staff or ota_lead)
  NOT is_ota_role()
);

-- Add comment
COMMENT ON POLICY "bookings_mirror_select_deny_ota" ON public.bookings_mirror IS
'Security: Deny SELECT access for OTA roles. They must use RPC ota_kpi_get_data for aggregated data only.';

-- Verify policy created
SELECT 
  policyname,
  permissive,
  roles::text[],
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'bookings_mirror'
  AND policyname = 'bookings_mirror_select_deny_ota';

-- Expected: 1 row with qual containing "NOT is_ota_role()"

-- ✅ PATCH 1 COMPLETE
```

---

## 3️⃣ PATCH 2: Add OTA Table RLS Policies

```sql
-- ============================================================
-- PATCH 002: Add RLS policies for OTA tables
-- ============================================================
-- Date: 2026-01-08
-- Priority: HIGH - Data Isolation
-- Purpose: Enforce project-based access at database level
-- ============================================================

-- ============================================================
-- Part 1: ota_projects TABLE
-- ============================================================

-- Enable RLS
ALTER TABLE public.ota_projects ENABLE ROW LEVEL SECURITY;

-- DROP existing policies if any (clean slate)
DROP POLICY IF EXISTS "ota_projects_select" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_insert" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_update" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_delete" ON public.ota_projects;

-- SELECT: User must be project member or admin
CREATE POLICY "ota_projects_select" 
ON public.ota_projects 
FOR SELECT TO authenticated 
USING (
  has_ota_project_access(id)
);

-- INSERT: Only Lead/Admin
CREATE POLICY "ota_projects_insert" 
ON public.ota_projects 
FOR INSERT TO authenticated 
WITH CHECK (
  is_ota_lead_or_admin()
);

-- UPDATE: Only Lead/Admin of accessible projects
CREATE POLICY "ota_projects_update" 
ON public.ota_projects 
FOR UPDATE TO authenticated 
USING (
  has_ota_project_access(id) AND is_ota_lead_or_admin()
);

-- DELETE: Admin only
CREATE POLICY "ota_projects_delete" 
ON public.ota_projects 
FOR DELETE TO authenticated 
USING (
  has_role(auth.uid(), 'admin')
);

-- Verify
SELECT 'ota_projects' as table_name, COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'ota_projects';
-- Expected: 4 policies

-- ============================================================
-- Part 2: ota_tasks TABLE
-- ============================================================

ALTER TABLE public.ota_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ota_tasks_select" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_insert" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_update" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_delete" ON public.ota_tasks;

-- SELECT: Must have access to parent project
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

-- INSERT: Must be project member
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

-- UPDATE: Must be project member
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

-- DELETE: Only Lead/Admin
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

-- Verify
SELECT 'ota_tasks' as table_name, COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'ota_tasks';
-- Expected: 4 policies

-- ============================================================
-- Part 3: ota_project_members TABLE
-- ============================================================

ALTER TABLE public.ota_project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ota_project_members_select" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_insert" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_update" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_delete" ON public.ota_project_members;

-- SELECT: Can view members of accessible projects
CREATE POLICY "ota_project_members_select" 
ON public.ota_project_members 
FOR SELECT TO authenticated 
USING (
  has_ota_project_access(project_id)
);

-- INSERT: Only Lead/Admin
CREATE POLICY "ota_project_members_insert" 
ON public.ota_project_members 
FOR INSERT TO authenticated 
WITH CHECK (
  has_ota_project_access(project_id) AND is_ota_lead_or_admin()
);

-- UPDATE: Only Lead/Admin
CREATE POLICY "ota_project_members_update" 
ON public.ota_project_members 
FOR UPDATE TO authenticated 
USING (
  has_ota_project_access(project_id) AND is_ota_lead_or_admin()
);

-- DELETE: Admin only
CREATE POLICY "ota_project_members_delete" 
ON public.ota_project_members 
FOR DELETE TO authenticated 
USING (
  has_role(auth.uid(), 'admin')
);

-- Verify
SELECT 'ota_project_members' as table_name, COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'ota_project_members';
-- Expected: 4 policies

-- ============================================================
-- FINAL VERIFICATION
-- ============================================================

-- Summary of all policies
SELECT 
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE tablename IN ('ota_projects', 'ota_tasks', 'ota_project_members')
ORDER BY tablename, cmd, policyname;

-- Expected: 12 total policies (4 per table)

-- Check RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('ota_projects', 'ota_tasks', 'ota_project_members')
ORDER BY tablename;

-- Expected: rls_enabled = true for all 3 tables

-- ✅ PATCH 2 COMPLETE
```

---

## 4️⃣ PATCH 4: Seed Default Permissions (Optional)

```sql
-- ============================================================
-- PATCH 004: Seed default permissions for OTA users
-- ============================================================
-- Date: 2026-01-08
-- Priority: MEDIUM (Optional - frontend has fallback)
-- Purpose: Populate user_page_permissions table for auditability
-- ============================================================

-- Check current state
SELECT 
  u.email,
  ur.role,
  COUNT(upp.page_path) as current_permission_count
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
LEFT JOIN user_page_permissions upp ON upp.user_id = ur.user_id
WHERE ur.role IN ('ota_staff', 'ota_lead')
GROUP BY u.email, ur.role
ORDER BY ur.role, u.email;

-- Seed permissions for ota_lead users
INSERT INTO user_page_permissions (user_id, page_path, can_use, created_by, created_at)
SELECT 
  ur.user_id,
  page_path,
  true as can_use,
  (SELECT id FROM auth.users WHERE email = 'test.admin@roomrise.com') as created_by,
  now() as created_at
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
INSERT INTO user_page_permissions (user_id, page_path, can_use, created_by, created_at)
SELECT 
  ur.user_id,
  page_path,
  true as can_use,
  (SELECT id FROM auth.users WHERE email = 'test.admin@roomrise.com') as created_by,
  now() as created_at
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

-- Verify seeding
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
-- ota_staff: 4 permissions
-- ota_lead: 6 permissions

-- ✅ PATCH 4 COMPLETE
```

---

## 5️⃣ VERIFY: Validation Queries

```sql
-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run after all patches to validate fixes
-- ============================================================

-- 1. Verify bookings_mirror RLS policy
SELECT 
  tablename,
  policyname,
  permissive,
  cmd,
  LEFT(qual, 100) as qual_preview
FROM pg_policies
WHERE tablename = 'bookings_mirror'
ORDER BY policyname;

-- ✅ Expected: "bookings_mirror_select_deny_ota" exists
-- ✅ qual should contain "NOT is_ota_role()"

-- 2. Verify OTA table RLS policies count
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN ('ota_projects', 'ota_tasks', 'ota_project_members')
GROUP BY tablename
ORDER BY tablename;

-- ✅ Expected: 4 policies per table

-- 3. Verify OTA user permissions (if seeded)
SELECT 
  u.email,
  ur.role,
  COUNT(upp.page_path) as permission_count,
  array_agg(upp.page_path ORDER BY upp.page_path) as permissions
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
LEFT JOIN user_page_permissions upp ON upp.user_id = ur.user_id
WHERE ur.role IN ('ota_staff', 'ota_lead')
GROUP BY u.email, ur.role
ORDER BY ur.role, u.email;

-- ✅ Expected: 
-- ota_staff: 4 permissions (/, my-tasks, projects, messages)
-- ota_lead: 6 permissions (+ tasks, kpi)

-- 4. Verify helper functions exist
SELECT 
  proname as function_name,
  prokind as kind,
  provolatile as volatility
FROM pg_proc
WHERE proname IN (
  'is_ota_role',
  'is_ota_lead_or_admin',
  'has_ota_project_access',
  'get_ota_project_role'
)
ORDER BY proname;

-- ✅ Expected: 4 functions found

-- 5. Verify RLS enabled on all tables
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

-- ✅ Expected: rls_enabled = true for all

-- 6. Count OTA users affected
SELECT 
  role,
  COUNT(DISTINCT user_id) as user_count
FROM user_roles
WHERE role IN ('ota_staff', 'ota_lead')
GROUP BY role
ORDER BY role;

-- Shows how many real users will be affected

-- 7. Test project visibility (as admin - shows what SHOULD be visible per role)
DO $$
DECLARE
  v_staff_id UUID;
  v_lead_id UUID;
  v_projects_staff INT;
  v_projects_lead INT;
BEGIN
  SELECT id INTO v_staff_id FROM auth.users WHERE email = 'test.ota_staff@roomrise.com';
  SELECT id INTO v_lead_id FROM auth.users WHERE email = 'test.ota_lead@roomrise.com';
  
  -- Projects visible to staff (should be 1: Project A only)
  SELECT COUNT(*) INTO v_projects_staff
  FROM ota_projects p
  WHERE EXISTS (
    SELECT 1 FROM ota_project_members pm
    WHERE pm.project_id = p.id
    AND pm.user_id = v_staff_id
    AND pm.is_active = true
  );
  
  -- Projects visible to lead (should be 2: Project A + B)
  SELECT COUNT(*) INTO v_projects_lead
  FROM ota_projects p
  WHERE EXISTS (
    SELECT 1 FROM ota_project_members pm
    WHERE pm.project_id = p.id
    AND pm.user_id = v_lead_id
    AND pm.is_active = true
  );
  
  RAISE NOTICE 'Projects visible to ota_staff: % (expected: 1)', v_projects_staff;
  RAISE NOTICE 'Projects visible to ota_lead: % (expected: 2)', v_projects_lead;
  
  IF v_projects_staff != 1 OR v_projects_lead != 2 THEN
    RAISE WARNING 'Test data may be incorrect. Run SETUP section first.';
  END IF;
END$$;

-- ✅ ALL VERIFICATION COMPLETE
```

---

## 6️⃣ ROLLBACK: Emergency Rollback Scripts

```sql
-- ============================================================
-- EMERGENCY ROLLBACK
-- ============================================================
-- Use ONLY if patches cause critical issues
-- Run in reverse order (PATCH 4 → PATCH 2 → PATCH 1)
-- ============================================================

-- ============================================================
-- ROLLBACK PATCH 4: Remove seeded permissions
-- ============================================================

DELETE FROM user_page_permissions
WHERE user_id IN (
  SELECT user_id FROM user_roles WHERE role IN ('ota_staff', 'ota_lead')
)
AND page_path IN (
  '/', 
  '/ota-operations/my-tasks',
  '/ota-operations/projects',
  '/ota-operations/tasks',
  '/ota-operations/kpi',
  '/ota-messages'
);

-- Verify rollback
SELECT COUNT(*) as deleted_count FROM user_page_permissions WHERE false; -- Should be 0

-- ============================================================
-- ROLLBACK PATCH 2: Remove OTA table RLS policies
-- ============================================================

-- Drop ota_projects policies
DROP POLICY IF EXISTS "ota_projects_select" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_insert" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_update" ON public.ota_projects;
DROP POLICY IF EXISTS "ota_projects_delete" ON public.ota_projects;

-- Drop ota_tasks policies
DROP POLICY IF EXISTS "ota_tasks_select" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_insert" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_update" ON public.ota_tasks;
DROP POLICY IF EXISTS "ota_tasks_delete" ON public.ota_tasks;

-- Drop ota_project_members policies
DROP POLICY IF EXISTS "ota_project_members_select" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_insert" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_update" ON public.ota_project_members;
DROP POLICY IF EXISTS "ota_project_members_delete" ON public.ota_project_members;

-- OPTIONAL: Disable RLS (NOT RECOMMENDED for production)
-- ALTER TABLE public.ota_projects DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.ota_tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.ota_project_members DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROLLBACK PATCH 1: Restore old bookings_mirror policy
-- ============================================================

DROP POLICY IF EXISTS "bookings_mirror_select_deny_ota" ON public.bookings_mirror;

CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true);

-- ⚠️ WARNING: This restores the security vulnerability!

-- ============================================================
-- ROLLBACK VERIFICATION
-- ============================================================

-- Check policies removed
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN ('ota_projects', 'ota_tasks', 'ota_project_members')
GROUP BY tablename;

-- Expected: 0 policies for OTA tables (if fully rolled back)

-- Check bookings_mirror policy
SELECT policyname FROM pg_policies WHERE tablename = 'bookings_mirror';

-- Expected: "Bookings mirror viewable by authenticated" exists

-- ✅ ROLLBACK COMPLETE
```

---

## 📋 EXECUTION CHECKLIST

### Pre-Execution
- [ ] Backup database (Supabase Dashboard → Settings → Database → Backups)
- [ ] Open Supabase SQL Editor
- [ ] Have rollback SQL ready in separate tab
- [ ] Notify team if on production

### Execution Steps
1. [ ] Run SETUP section (create test data)
2. [ ] Verify test data created (should see 3 projects, 3 memberships, 4 tasks)
3. [ ] Run PATCH 1 (bookings_mirror RLS)
4. [ ] Verify PATCH 1 (policy exists, qual contains "NOT is_ota_role()")
5. [ ] Run PATCH 2 Part 1 (ota_projects RLS)
6. [ ] Run PATCH 2 Part 2 (ota_tasks RLS)
7. [ ] Run PATCH 2 Part 3 (ota_project_members RLS)
8. [ ] Verify PATCH 2 (12 total policies, RLS enabled on 3 tables)
9. [ ] Run PATCH 4 (seed permissions) - OPTIONAL
10. [ ] Verify PATCH 4 (ota_staff has 4 perms, ota_lead has 6)
11. [ ] Run ALL verification queries
12. [ ] Update TypeScript code (PATCH 3 - outside SQL)

### Post-Execution
- [ ] Clear browser cache (Ctrl+Shift+R)
- [ ] Test as super_admin (baseline)
- [ ] Test as ota_staff (critical validation)
- [ ] Test as ota_lead (critical validation)
- [ ] Run E2E test matrix
- [ ] Monitor logs for errors (24 hours)

### If Issues Occur
- [ ] Run ROLLBACK section (reverse order)
- [ ] Document issue in bug report
- [ ] Restore from backup if critical

---

## ⚠️ IMPORTANT NOTES

1. **Order Matters**: Run patches in order (1 → 2 → 4)
2. **Rollback Reverse Order**: If needed, rollback in reverse (4 → 2 → 1)
3. **Test Environment First**: If you have staging, test there first
4. **Auth.uid() Limitation**: SQL queries cannot test `auth.uid()` - must log in as actual user
5. **RLS Performance**: Policies add ~5-10ms per query (acceptable overhead)
6. **Frontend PATCH 3**: Must be deployed alongside SQL patches

---

**Document Version**: 1.0  
**Status**: READY FOR COPY-PASTE EXECUTION  
**Supabase SQL Editor**: Paste sections one at a time, verify results before proceeding
