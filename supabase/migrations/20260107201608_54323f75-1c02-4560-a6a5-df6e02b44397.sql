-- ============================================================
-- 20260108_ota_privilege_precedence_fix.sql
-- FIX: OTA Privilege Precedence Issue
-- ============================================================
-- PROBLEM: Users with BOTH system role (admin/super_admin/ke_toan) AND OTA role
--          were being BLOCKED from sensitive tables because is_ota_role() returned TRUE.
-- 
-- SOLUTION: Create is_ota_only_role() that returns TRUE only if user has 
--           OTA role AND does NOT have privileged system role.
-- ============================================================

-- 1. Create is_ota_only_role() function
-- Returns TRUE if user has OTA role but NO privileged system role
CREATE OR REPLACE FUNCTION public.is_ota_only_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ota_staff', 'ota_lead')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin', 'ke_toan')
  );
$$;

-- 2. Update RLS policies for sensitive tables
-- Replace "is_ota_role()" with "is_ota_only_role()" in DENY checks

-- bookings_mirror
DROP POLICY IF EXISTS "Bookings mirror viewable by ops roles" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror viewable by ops roles" ON public.bookings_mirror
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- host_payables  
DROP POLICY IF EXISTS "Host payables viewable except ota" ON public.host_payables;
CREATE POLICY "Host payables viewable except ota" ON public.host_payables
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- ledger_entries
DROP POLICY IF EXISTS "Ledger entries viewable except ota" ON public.ledger_entries;
CREATE POLICY "Ledger entries viewable except ota" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- partners
DROP POLICY IF EXISTS "Partners viewable except ota" ON public.partners;
CREATE POLICY "Partners viewable except ota" ON public.partners
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- ota_payouts
DROP POLICY IF EXISTS "OTA payouts viewable except ota" ON public.ota_payouts;
CREATE POLICY "OTA payouts viewable except ota" ON public.ota_payouts
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 3. Drop duplicate policies created earlier
DROP POLICY IF EXISTS "bookings_mirror_select" ON public.bookings_mirror;
DROP POLICY IF EXISTS "host_payables_select" ON public.host_payables;
DROP POLICY IF EXISTS "ledger_entries_select" ON public.ledger_entries;
DROP POLICY IF EXISTS "partners_select" ON public.partners;
DROP POLICY IF EXISTS "ota_payouts_select" ON public.ota_payouts;