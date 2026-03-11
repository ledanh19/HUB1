-- ============================================================
-- OTA PRIVILEGE PRECEDENCE FIX
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Fix RLS blocking privileged users who also have OTA roles
--
-- ROOT CAUSE:
--   is_ota_role() returns TRUE for ANY user with ota_staff/ota_lead,
--   regardless of whether they have super_admin/admin privilege.
--   This causes RLS policies using "NOT is_ota_role()" to block
--   privileged users from sensitive tables.
--
-- SOLUTION:
--   Create is_ota_only_role() that returns TRUE only when user
--   has OTA role AND does NOT have privileged system roles.
--   Replace "NOT is_ota_role()" with "NOT is_ota_only_role()" in
--   sensitive table policies.
--
-- ROLLBACK: See end of file for rollback SQL
-- ============================================================

-- ============================================================
-- PART 1: CREATE is_ota_only_role() FUNCTION
-- ============================================================
-- Returns TRUE when:
--   1. User has ota_staff OR ota_lead role
--   2. AND User does NOT have super_admin, admin, or ke_toan role
--
-- This preserves OTA module access while not overriding privileges

CREATE OR REPLACE FUNCTION public.is_ota_only_role()
RETURNS BOOLEAN
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

-- Security hardening
REVOKE ALL ON FUNCTION public.is_ota_only_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ota_only_role() TO authenticated;

COMMENT ON FUNCTION public.is_ota_only_role() IS 
'Returns TRUE only if user has OTA role (ota_staff/ota_lead) AND does NOT have 
privileged system roles (super_admin/admin/ke_toan). Used in RLS policies to 
block pure-OTA users from sensitive tables while allowing privileged users 
who also have OTA tag to access those tables.';

-- ============================================================
-- PART 2: UPDATE RLS POLICIES ON SENSITIVE TABLES
-- ============================================================
-- Replace: NOT is_ota_role() → NOT is_ota_only_role()
-- This allows super_admin + ota_lead to access sensitive tables

-- 2.1 BOOKINGS_MIRROR
DROP POLICY IF EXISTS "Bookings mirror viewable except ota" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror viewable except ota_only"
ON public.bookings_mirror
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.2 CASHFLOW_ENTRIES
DROP POLICY IF EXISTS "Cashflow entries viewable except ota" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries viewable except ota_only"
ON public.cashflow_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.3 PAYMENT_REQUESTS
DROP POLICY IF EXISTS "Payment requests viewable except ota" ON public.payment_requests;
CREATE POLICY "Payment requests viewable except ota_only"
ON public.payment_requests
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.4 CASH_OUTS
DROP POLICY IF EXISTS "Cash outs viewable except ota" ON public.cash_outs;
CREATE POLICY "Cash outs viewable except ota_only"
ON public.cash_outs
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.5 CASH_ACCOUNTS
DROP POLICY IF EXISTS "Cash accounts viewable except ota" ON public.cash_accounts;
CREATE POLICY "Cash accounts viewable except ota_only"
ON public.cash_accounts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.6 CASH_TRANSFERS
DROP POLICY IF EXISTS "Cash transfers viewable except ota" ON public.cash_transfers;
CREATE POLICY "Cash transfers viewable except ota_only"
ON public.cash_transfers
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.7 OTA_PAYOUTS
DROP POLICY IF EXISTS "OTA payouts viewable except ota" ON public.ota_payouts;
CREATE POLICY "OTA payouts viewable except ota_only"
ON public.ota_payouts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.8 OTA_PAYOUT_DETAILS
DROP POLICY IF EXISTS "OTA payout details viewable except ota" ON public.ota_payout_details;
CREATE POLICY "OTA payout details viewable except ota_only"
ON public.ota_payout_details
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.9 HOST_PAYABLES
DROP POLICY IF EXISTS "Host payables viewable except ota" ON public.host_payables;
CREATE POLICY "Host payables viewable except ota_only"
ON public.host_payables
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.10 HOST_SETTLEMENTS
DROP POLICY IF EXISTS "Host settlements viewable except ota" ON public.host_settlements;
CREATE POLICY "Host settlements viewable except ota_only"
ON public.host_settlements
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.11 HOST_SUPPLY_SEGMENTS
DROP POLICY IF EXISTS "Host supply segments viewable except ota" ON public.host_supply_segments;
CREATE POLICY "Host supply segments viewable except ota_only"
ON public.host_supply_segments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.12 HOST_DEPOSITS
DROP POLICY IF EXISTS "Host deposits viewable except ota" ON public.host_deposits;
CREATE POLICY "Host deposits viewable except ota_only"
ON public.host_deposits
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.13 HOST_PREPAIDS
DROP POLICY IF EXISTS "Host prepaids viewable except ota" ON public.host_prepaids;
CREATE POLICY "Host prepaids viewable except ota_only"
ON public.host_prepaids
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.14 HOST_PAYMENTS
DROP POLICY IF EXISTS "Host payments viewable except ota" ON public.host_payments;
CREATE POLICY "Host payments viewable except ota_only"
ON public.host_payments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.15 PARTNERS
DROP POLICY IF EXISTS "Partners viewable except ota" ON public.partners;
CREATE POLICY "Partners viewable except ota_only"
ON public.partners
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.16 GUEST_DOCUMENTS (special case: also excludes ke_toan)
DROP POLICY IF EXISTS "Guest documents viewable except ota and ketoan" ON public.guest_documents;
CREATE POLICY "Guest documents viewable except ota_only and ketoan"
ON public.guest_documents
FOR SELECT
TO authenticated
USING (
  NOT public.is_ota_only_role() 
  AND NOT public.has_role(auth.uid(), 'ke_toan'::public.app_role)
);

-- 2.17 LEDGER_ENTRIES
DROP POLICY IF EXISTS "Ledger entries viewable except ota" ON public.ledger_entries;
CREATE POLICY "Ledger entries viewable except ota_only"
ON public.ledger_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.18 HOTEL_COLLECTS
DROP POLICY IF EXISTS "Hotel collects viewable except ota" ON public.hotel_collects;
CREATE POLICY "Hotel collects viewable except ota_only"
ON public.hotel_collects
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- 2.19 REVENUE_ENTRIES
DROP POLICY IF EXISTS "Revenue entries viewable except ota" ON public.revenue_entries;
CREATE POLICY "Revenue entries viewable except ota_only"
ON public.revenue_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- ============================================================
-- PART 3: UPDATE PAGE PERMISSIONS FOR OTA ROLES
-- ============================================================
-- Ensure OTA operations pages are accessible via permission system

-- Add /ota-operations/my-tasks to OTA roles default (if not exists in code)
-- Note: This is handled in frontend getDefaultPagesForRole() but we add
-- explicit permission seeding for clarity

-- No direct DB change needed - frontend handles via getDefaultPagesForRole()

-- ============================================================
-- PART 4: VERIFICATION COMMENTS
-- ============================================================

COMMENT ON POLICY "Bookings mirror viewable except ota_only" ON public.bookings_mirror IS 
'Pure-OTA users (no admin/ke_toan privilege) cannot SELECT bookings_mirror directly. 
Privileged users with OTA tag can still access.';

COMMENT ON POLICY "Partners viewable except ota_only" ON public.partners IS 
'Pure-OTA users cannot view partner data. Privileged users with OTA tag can still access.';

COMMENT ON POLICY "Ledger entries viewable except ota_only" ON public.ledger_entries IS 
'Pure-OTA users cannot view ledger entries. Privileged users with OTA tag can still access.';

-- ============================================================
-- ROLLBACK SQL (run if needed to revert)
-- ============================================================
/*
-- To rollback, run the following:

-- Drop new function
DROP FUNCTION IF EXISTS public.is_ota_only_role();

-- Restore original policies (using is_ota_role)
DROP POLICY IF EXISTS "Bookings mirror viewable except ota_only" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror viewable except ota"
ON public.bookings_mirror FOR SELECT TO authenticated
USING (NOT public.is_ota_role());

DROP POLICY IF EXISTS "Cashflow entries viewable except ota_only" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries viewable except ota"
ON public.cashflow_entries FOR SELECT TO authenticated
USING (NOT public.is_ota_role());

-- ... repeat for all other tables ...

*/

