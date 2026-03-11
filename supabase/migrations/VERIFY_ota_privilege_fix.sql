-- ============================================================
-- OTA PRIVILEGE FIX - VERIFICATION SCRIPT
-- ============================================================
-- Run this script AFTER applying 20260108_ota_privilege_precedence_fix.sql
-- to verify the fix is working correctly.
-- ============================================================

-- ============================================================
-- 1. CHECK FUNCTION EXISTS
-- ============================================================
DO $$
DECLARE
  v_func_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_ota_only_role' 
    AND pronamespace = 'public'::regnamespace
  ) INTO v_func_exists;
  
  IF v_func_exists THEN
    RAISE NOTICE '✅ is_ota_only_role() function exists';
  ELSE
    RAISE WARNING '❌ is_ota_only_role() function NOT FOUND!';
  END IF;
END $$;

-- ============================================================
-- 2. LIST ALL USERS WITH ROLES
-- ============================================================
\echo '\n📋 ALL USERS WITH ROLES:'
SELECT 
  u.id as user_id,
  u.email,
  array_agg(ur.role ORDER BY ur.role) as roles,
  -- Check for mixed roles (privileged + ota)
  CASE 
    WHEN array_agg(ur.role::text) && ARRAY['super_admin', 'admin', 'ke_toan']
      AND array_agg(ur.role::text) && ARRAY['ota_staff', 'ota_lead']
    THEN '⚠️ MIXED (privileged + OTA)'
    WHEN array_agg(ur.role::text) && ARRAY['ota_staff', 'ota_lead']
    THEN '🔶 OTA Only'
    ELSE '🔷 System Role Only'
  END as role_status
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.email
ORDER BY role_status, u.email;

-- ============================================================
-- 3. LIST SENSITIVE TABLE POLICIES
-- ============================================================
\echo '\n📋 RLS POLICIES ON SENSITIVE TABLES:'
SELECT 
  schemaname,
  tablename,
  policyname,
  CASE 
    WHEN qual LIKE '%is_ota_only_role%' THEN '✅ Fixed (is_ota_only_role)'
    WHEN qual LIKE '%is_ota_role%' THEN '⚠️ Old pattern (is_ota_role)'
    WHEN qual = 'true' THEN '❌ USING(true) - no protection'
    ELSE '🔷 Other'
  END as policy_status,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'bookings_mirror', 'cashflow_entries', 'payment_requests', 
    'cash_outs', 'cash_accounts', 'cash_transfers',
    'ota_payouts', 'ota_payout_details',
    'host_payables', 'host_settlements', 'host_supply_segments',
    'host_deposits', 'host_prepaids', 'host_payments',
    'partners', 'guest_documents', 'ledger_entries',
    'hotel_collects', 'revenue_entries'
  )
  AND cmd = 'SELECT'
ORDER BY tablename, policyname;

-- ============================================================
-- 4. SIMULATE is_ota_only_role() FOR DIFFERENT USER TYPES
-- ============================================================
\echo '\n📋 SIMULATED is_ota_only_role() RESULTS:'

-- Create temp function to test with specific user roles
CREATE OR REPLACE FUNCTION test_is_ota_only_role(p_roles text[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT 
    -- Has OTA role
    p_roles && ARRAY['ota_staff', 'ota_lead']
    -- AND does NOT have privileged role
    AND NOT (p_roles && ARRAY['super_admin', 'admin', 'ke_toan']);
$$;

SELECT 
  roles,
  description,
  test_is_ota_only_role(roles) as is_ota_only_result,
  NOT test_is_ota_only_role(roles) as can_access_sensitive
FROM (VALUES
  (ARRAY['super_admin']::text[], 'Super Admin only'),
  (ARRAY['super_admin', 'ota_lead']::text[], 'Super Admin + OTA Lead'),
  (ARRAY['admin']::text[], 'Admin only'),
  (ARRAY['admin', 'ota_staff']::text[], 'Admin + OTA Staff'),
  (ARRAY['ke_toan']::text[], 'Ke Toan only'),
  (ARRAY['ke_toan', 'ota_lead']::text[], 'Ke Toan + OTA Lead'),
  (ARRAY['cskh']::text[], 'CSKH only'),
  (ARRAY['cskh', 'ota_staff']::text[], 'CSKH + OTA Staff'),
  (ARRAY['ota_lead']::text[], 'OTA Lead only'),
  (ARRAY['ota_staff']::text[], 'OTA Staff only'),
  (ARRAY['ota_staff', 'ota_lead']::text[], 'OTA Staff + Lead (no system role)')
) AS t(roles, description);

DROP FUNCTION IF EXISTS test_is_ota_only_role(text[]);

-- ============================================================
-- 5. VERIFY POLICY FIX COUNTS
-- ============================================================
\echo '\n📊 POLICY FIX SUMMARY:'
SELECT
  COUNT(*) FILTER (WHERE qual LIKE '%is_ota_only_role%') as fixed_policies,
  COUNT(*) FILTER (WHERE qual LIKE '%is_ota_role%' AND qual NOT LIKE '%is_ota_only_role%') as old_policies,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'bookings_mirror', 'cashflow_entries', 'payment_requests', 
    'cash_outs', 'cash_accounts', 'cash_transfers',
    'ota_payouts', 'ota_payout_details',
    'host_payables', 'host_settlements', 'host_supply_segments',
    'host_deposits', 'host_prepaids', 'host_payments',
    'partners', 'guest_documents', 'ledger_entries',
    'hotel_collects', 'revenue_entries'
  )
  AND cmd = 'SELECT';

-- ============================================================
-- 6. TEST ACCESS FOR MIXED ROLE USER (if exists)
-- ============================================================
\echo '\n📋 TESTING ACCESS FOR MIXED ROLE USERS:'

-- Find users with mixed roles
SELECT 
  u.email,
  array_agg(ur.role) as roles,
  'Run manual test: Login as this user and verify access to /bookings, /ota-operations' as action
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.email
HAVING array_agg(ur.role::text) && ARRAY['super_admin', 'admin', 'ke_toan']
  AND array_agg(ur.role::text) && ARRAY['ota_staff', 'ota_lead'];

-- ============================================================
-- EXPECTED RESULTS AFTER FIX:
-- ============================================================
-- 1. is_ota_only_role() function exists
-- 2. All sensitive tables have policies using is_ota_only_role()
-- 3. Simulation shows:
--    - super_admin + ota_lead: can_access_sensitive = TRUE
--    - admin + ota_staff: can_access_sensitive = TRUE
--    - ota_staff only: can_access_sensitive = FALSE
--    - ota_lead only: can_access_sensitive = FALSE
-- ============================================================

