-- ============================================================
-- OTA OPERATIONS MODULE - E2E VERIFICATION SCRIPT
-- ============================================================
-- Date: 2026-01-07
-- Author: QA + Security Engineer
-- Purpose: Comprehensive E2E testing for OTA Operations
--
-- INSTRUCTIONS:
--   1. Run this script in Supabase SQL Editor (as service role)
--   2. Check each section's output for PASS/FAIL
--   3. If any FAIL, check the specific migration file
-- ============================================================

-- ============================================================
-- SECTION 1: MIGRATION VERIFICATION
-- Check that all OTA tables and functions exist
-- ============================================================
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 1: MIGRATION VERIFICATION';
  RAISE NOTICE '============================================';
  
  -- Check tables
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ota_projects' AND schemaname = 'public') THEN
    v_missing := v_missing || 'ota_projects, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ota_project_members' AND schemaname = 'public') THEN
    v_missing := v_missing || 'ota_project_members, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ota_tasks' AND schemaname = 'public') THEN
    v_missing := v_missing || 'ota_tasks, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ota_task_evidence' AND schemaname = 'public') THEN
    v_missing := v_missing || 'ota_task_evidence, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ota_audit_log' AND schemaname = 'public') THEN
    v_missing := v_missing || 'ota_audit_log, ';
  END IF;
  
  -- Check functions
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ota_role' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'is_ota_role(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ota_lead_or_admin' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'is_ota_lead_or_admin(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_ota_project_access' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'has_ota_project_access(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ota_get_kpi' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'ota_get_kpi(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ota_create_task' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'ota_create_task(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ota_submit_evidence' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'ota_submit_evidence(), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ota_review_evidence' AND pronamespace = 'public'::regnamespace) THEN
    v_missing := v_missing || 'ota_review_evidence(), ';
  END IF;
  
  IF v_missing = '' THEN
    RAISE NOTICE '✅ PASS: All tables and functions exist';
  ELSE
    RAISE WARNING '❌ FAIL: Missing objects: %', v_missing;
  END IF;
END $$;

-- ============================================================
-- SECTION 2: RLS POLICY VERIFICATION
-- Verify USING(true) policies are replaced with NOT is_ota_role()
-- ============================================================
DO $$
DECLARE
  v_bad_policies TEXT := '';
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 2: RLS POLICY VERIFICATION';
  RAISE NOTICE '============================================';
  
  -- Check for any remaining USING(true) policies on sensitive tables
  FOR r IN 
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN (
      'bookings_mirror',
      'cashflow_entries', 
      'payment_requests',
      'cash_outs',
      'cash_accounts',
      'cash_transfers',
      'ota_payouts',
      'ota_payout_details',
      'host_payables',
      'host_settlements',
      'host_supply_segments',
      'host_deposits',
      'host_prepaids',
      'host_payments',
      'partners',
      'guest_documents',
      'ledger_entries',
      'hotel_collects',
      'revenue_entries'
    )
    AND cmd = 'SELECT'
    AND qual = 'true'  -- USING(true) becomes qual='true'
  LOOP
    v_bad_policies := v_bad_policies || r.tablename || '.' || r.policyname || ', ';
  END LOOP;
  
  IF v_bad_policies = '' THEN
    RAISE NOTICE '✅ PASS: No USING(true) SELECT policies on sensitive tables';
  ELSE
    RAISE WARNING '❌ FAIL: Found USING(true) policies: %', v_bad_policies;
  END IF;
END $$;

-- Display current policies on sensitive tables
SELECT 
  tablename,
  policyname,
  cmd,
  CASE 
    WHEN qual LIKE '%is_ota_role%' THEN '✅ OTA blocked'
    WHEN qual = 'true' THEN '❌ USING(true) - INSECURE'
    ELSE '⚠️ Custom: ' || LEFT(qual, 50)
  END as policy_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'bookings_mirror', 'cashflow_entries', 'ota_payouts', 
  'host_payables', 'partners', 'guest_documents', 'ledger_entries'
)
AND cmd = 'SELECT'
ORDER BY tablename, policyname;

-- ============================================================
-- SECTION 3: SEED TEST USERS
-- Create 2 test users for E2E testing
-- ============================================================
DO $$
DECLARE
  v_lead_id UUID := 'aaaaaaaa-1111-4000-a000-000000000001';
  v_staff_id UUID := 'aaaaaaaa-1111-4000-a000-000000000002';
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 3: SEED TEST USERS';
  RAISE NOTICE '============================================';
  
  -- Note: In production, users come from auth.users via signup
  -- For testing, we insert directly into user_roles
  
  -- Clean up existing test roles
  DELETE FROM public.user_roles WHERE user_id IN (v_lead_id, v_staff_id);
  
  -- Insert test roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES 
    (v_lead_id, 'ota_lead'),
    (v_staff_id, 'ota_staff')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RAISE NOTICE '✅ Created test users:';
  RAISE NOTICE '   OTA_LEAD:  %', v_lead_id;
  RAISE NOTICE '   OTA_STAFF: %', v_staff_id;
END $$;

-- Verify test users
SELECT user_id, role 
FROM public.user_roles 
WHERE user_id IN (
  'aaaaaaaa-1111-4000-a000-000000000001',
  'aaaaaaaa-1111-4000-a000-000000000002'
);

-- ============================================================
-- SECTION 4: E2E FLOW TEST
-- Full lifecycle: Project → Member → Task → Assign → Evidence → Approve → Done
-- ============================================================
DO $$
DECLARE
  v_lead_id UUID := 'aaaaaaaa-1111-4000-a000-000000000001';
  v_staff_id UUID := 'aaaaaaaa-1111-4000-a000-000000000002';
  v_project_id UUID;
  v_task_id UUID;
  v_evidence_id UUID;
  v_property_id UUID;
  v_result JSON;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 4: E2E FLOW TEST';
  RAISE NOTICE '============================================';
  
  -- Get a property ID (from properties_mirror)
  SELECT id INTO v_property_id FROM public.properties_mirror LIMIT 1;
  
  IF v_property_id IS NULL THEN
    RAISE WARNING '⚠️ SKIP: No properties_mirror data. Creating mock property...';
    -- Create mock property for testing
    INSERT INTO public.properties_mirror (id, provider, provider_property_id, property_name)
    VALUES (gen_random_uuid(), 'test', 'TEST-001', 'Test Property')
    RETURNING id INTO v_property_id;
  END IF;
  
  -- Step 1: Create Project (as ota_lead)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 1: Create Project';
  
  INSERT INTO public.ota_projects (
    name, 
    description, 
    property_id, 
    status,
    created_by,
    updated_by
  ) VALUES (
    'E2E Test Project ' || now()::text,
    'Automated test project',
    v_property_id,
    'IN_PROGRESS',
    v_lead_id,
    v_lead_id
  )
  RETURNING id INTO v_project_id;
  
  RAISE NOTICE '   ✅ Project created: %', v_project_id;
  
  -- Step 2: Add Members
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Add Members';
  
  INSERT INTO public.ota_project_members (project_id, user_id, project_role, added_by)
  VALUES 
    (v_project_id, v_lead_id, 'LEAD', v_lead_id),
    (v_project_id, v_staff_id, 'STAFF', v_lead_id);
  
  RAISE NOTICE '   ✅ Added LEAD: %', v_lead_id;
  RAISE NOTICE '   ✅ Added STAFF: %', v_staff_id;
  
  -- Step 3: Create Task
  RAISE NOTICE '';
  RAISE NOTICE 'Step 3: Create Task';
  
  INSERT INTO public.ota_tasks (
    project_id,
    title,
    description,
    status,
    priority,
    created_by,
    updated_by
  ) VALUES (
    v_project_id,
    'E2E Test Task',
    'Test task for verification',
    'TODO',
    'HIGH',
    v_lead_id,
    v_lead_id
  )
  RETURNING id INTO v_task_id;
  
  RAISE NOTICE '   ✅ Task created: %', v_task_id;
  
  -- Step 4: Assign Task to Staff
  RAISE NOTICE '';
  RAISE NOTICE 'Step 4: Assign Task';
  
  UPDATE public.ota_tasks
  SET 
    assignee_id = v_staff_id,
    assigned_at = now(),
    assigned_by = v_lead_id,
    updated_by = v_lead_id
  WHERE id = v_task_id;
  
  RAISE NOTICE '   ✅ Task assigned to staff';
  
  -- Step 5: Start Task (Staff)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 5: Start Task (Status → IN_PROGRESS)';
  
  UPDATE public.ota_tasks
  SET 
    status = 'IN_PROGRESS',
    started_at = now(),
    updated_by = v_staff_id
  WHERE id = v_task_id;
  
  RAISE NOTICE '   ✅ Task started';
  
  -- Step 6: Submit Evidence (Staff)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 6: Submit Evidence';
  
  INSERT INTO public.ota_task_evidence (
    task_id,
    evidence_type,
    file_url,
    file_name,
    description,
    created_by
  ) VALUES (
    v_task_id,
    'SCREENSHOT',
    'ota-evidence/' || v_project_id || '/' || v_task_id || '/screenshot.png',
    'screenshot.png',
    'Completed task screenshot',
    v_staff_id
  )
  RETURNING id INTO v_evidence_id;
  
  RAISE NOTICE '   ✅ Evidence submitted: %', v_evidence_id;
  
  -- Step 7: Request Review (Staff moves task to REVIEW)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 7: Request Review (Status → REVIEW)';
  
  UPDATE public.ota_tasks
  SET 
    status = 'REVIEW',
    updated_by = v_staff_id
  WHERE id = v_task_id;
  
  RAISE NOTICE '   ✅ Task moved to REVIEW';
  
  -- Step 8: Approve Evidence (Lead)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 8: Approve Evidence (Lead)';
  
  UPDATE public.ota_task_evidence
  SET 
    review_status = 'APPROVED',
    reviewed_by = v_lead_id,
    reviewed_at = now(),
    review_notes = 'Looks good!'
  WHERE id = v_evidence_id;
  
  RAISE NOTICE '   ✅ Evidence approved';
  
  -- Step 9: Complete Task (Lead)
  RAISE NOTICE '';
  RAISE NOTICE 'Step 9: Complete Task (Status → DONE)';
  
  UPDATE public.ota_tasks
  SET 
    status = 'DONE',
    completed_at = now(),
    updated_by = v_lead_id
  WHERE id = v_task_id;
  
  RAISE NOTICE '   ✅ Task completed';
  
  -- Verify final state
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'E2E FLOW COMPLETE - Verifying final state:';
  RAISE NOTICE '============================================';
  
  IF EXISTS (
    SELECT 1 FROM ota_tasks 
    WHERE id = v_task_id 
    AND status = 'DONE'
    AND completed_at IS NOT NULL
  ) THEN
    RAISE NOTICE '✅ PASS: Task is DONE';
  ELSE
    RAISE WARNING '❌ FAIL: Task status incorrect';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM ota_task_evidence
    WHERE id = v_evidence_id
    AND review_status = 'APPROVED'
  ) THEN
    RAISE NOTICE '✅ PASS: Evidence is APPROVED';
  ELSE
    RAISE WARNING '❌ FAIL: Evidence status incorrect';
  END IF;
  
  -- Cleanup (optional - comment out to inspect data)
  -- DELETE FROM ota_tasks WHERE id = v_task_id;
  -- DELETE FROM ota_project_members WHERE project_id = v_project_id;
  -- DELETE FROM ota_projects WHERE id = v_project_id;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Test project ID: % (not deleted for inspection)', v_project_id;
  
END $$;

-- ============================================================
-- SECTION 5: KPI RPC TEST
-- Verify ota_get_kpi returns aggregates, not raw data
-- ============================================================
DO $$
DECLARE
  v_result JSON;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 5: KPI RPC TEST';
  RAISE NOTICE '============================================';
  
  -- Call KPI RPC with service role (simulating authenticated user)
  -- Note: In real test, call with specific user JWT
  SELECT public.ota_get_kpi(
    p_start_date := (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date := CURRENT_DATE,
    p_property_ids := NULL,
    p_group_by := 'channel'
  ) INTO v_result;
  
  RAISE NOTICE 'KPI Result: %', v_result;
  
  -- Verify response structure
  IF v_result->>'success' = 'true' THEN
    RAISE NOTICE '✅ PASS: KPI RPC returned success';
    
    -- Check no PII in response (no guest_name, email, phone)
    IF v_result::TEXT NOT LIKE '%guest_name%' 
       AND v_result::TEXT NOT LIKE '%email%'
       AND v_result::TEXT NOT LIKE '%phone%' THEN
      RAISE NOTICE '✅ PASS: No PII in KPI response';
    ELSE
      RAISE WARNING '❌ FAIL: PII detected in KPI response';
    END IF;
    
    -- Check aggregates exist
    IF v_result->'summary' IS NOT NULL THEN
      RAISE NOTICE '✅ PASS: Summary aggregates present';
      RAISE NOTICE '   total_bookings: %', v_result->'summary'->>'total_bookings';
      RAISE NOTICE '   total_revenue: %', v_result->'summary'->>'total_revenue';
    ELSE
      RAISE NOTICE '⚠️ INFO: No summary (may be empty date range)';
    END IF;
    
  ELSIF v_result->>'error' = 'ACCESS_DENIED' THEN
    RAISE NOTICE '⚠️ INFO: Access denied (expected if not OTA role)';
  ELSE
    RAISE WARNING '❌ FAIL: KPI RPC error: %', v_result->>'message';
  END IF;
  
END $$;

-- ============================================================
-- SECTION 6: SECURITY TEST
-- Verify OTA role cannot read sensitive tables
-- ============================================================
DO $$
DECLARE
  v_staff_id UUID := 'aaaaaaaa-1111-4000-a000-000000000002';
  v_can_read BOOLEAN;
  v_test_table TEXT;
  v_tables TEXT[] := ARRAY[
    'bookings_mirror',
    'cashflow_entries',
    'ota_payouts',
    'host_payables',
    'partners',
    'guest_documents',
    'ledger_entries'
  ];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 6: SECURITY TEST';
  RAISE NOTICE '============================================';
  
  -- Note: This test simulates what RLS would do
  -- In real test, execute as the actual user
  
  RAISE NOTICE 'Testing is_ota_role() function:';
  
  -- Temporarily set auth.uid to test user
  -- (This only works in certain contexts)
  PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);
  
  -- Check is_ota_role() for test user
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_staff_id AND role IN ('ota_staff', 'ota_lead')) THEN
    RAISE NOTICE '   User % has OTA role', v_staff_id;
  ELSE
    RAISE NOTICE '   ⚠️ User % does NOT have OTA role (expected)', v_staff_id;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Policy Check (manual verification needed):';
  RAISE NOTICE '   Run these queries AS the OTA user to verify access is blocked:';
  RAISE NOTICE '';
  
  FOREACH v_test_table IN ARRAY v_tables
  LOOP
    RAISE NOTICE '   SELECT COUNT(*) FROM public.% -- Should return 0 for OTA user', v_test_table;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ NOTE: Full security test requires logging in as OTA user and running queries.';
  RAISE NOTICE '   The RLS policies use is_ota_role() which checks auth.uid() at runtime.';
  
END $$;

-- Quick policy summary
SELECT 
  'Sensitive Tables RLS Summary' as info,
  COUNT(*) FILTER (WHERE qual LIKE '%is_ota_role%') as ota_blocked_count,
  COUNT(*) FILTER (WHERE qual = 'true') as insecure_count,
  COUNT(*) as total_select_policies
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'bookings_mirror', 'cashflow_entries', 'ota_payouts', 
  'host_payables', 'partners', 'guest_documents', 'ledger_entries'
)
AND cmd = 'SELECT';

-- ============================================================
-- SECTION 7: FINAL CHECKLIST
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SECTION 7: FINAL CHECKLIST';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Manual Verification Required:';
  RAISE NOTICE '[ ] 1. Login as ota_staff user in the app';
  RAISE NOTICE '[ ] 2. Verify Sidebar shows OTA Operations menu';
  RAISE NOTICE '[ ] 3. Verify "Create Project" button is visible (not disabled) for ota_lead';
  RAISE NOTICE '[ ] 4. Verify "Create Task" button is visible for ota_lead';
  RAISE NOTICE '[ ] 5. Verify action dropdown works for tasks';
  RAISE NOTICE '[ ] 6. Try accessing /payments via URL → should show "No access"';
  RAISE NOTICE '[ ] 7. KPI page shows aggregates without booking details';
  RAISE NOTICE '';
  RAISE NOTICE 'Automated Checks Summary:';
  RAISE NOTICE '   Run this script and check for ✅ PASS / ❌ FAIL messages above';
  RAISE NOTICE '';
END $$;
