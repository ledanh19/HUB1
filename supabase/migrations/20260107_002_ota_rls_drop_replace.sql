-- ============================================================
-- OTA OPERATIONS MODULE - 002: RLS DROP + REPLACE
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Replace permissive SELECT policies on sensitive tables
-- Pattern: DROP existing USING(true) → CREATE USING(NOT is_ota_role())
-- 
-- CRITICAL: PostgreSQL RLS policies OR together (permissive)
--           Adding deny policy does NOT work if USING(true) exists
--           Must DROP first, then CREATE new policy
-- ============================================================

-- ============================================================
-- BOOKINGS_MIRROR
-- ============================================================
-- Original policy: "Bookings mirror viewable by authenticated" USING(true)

DROP POLICY IF EXISTS "Bookings mirror viewable by authenticated" ON public.bookings_mirror;

CREATE POLICY "Bookings mirror viewable except ota"
ON public.bookings_mirror
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- CASHFLOW_ENTRIES
-- ============================================================
-- Original policy: "Cashflow entries viewable by authenticated" USING(true)

DROP POLICY IF EXISTS "Cashflow entries viewable by authenticated" ON public.cashflow_entries;

CREATE POLICY "Cashflow entries viewable except ota"
ON public.cashflow_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- PAYMENT_REQUESTS
-- ============================================================
-- Check and drop existing SELECT policies

DROP POLICY IF EXISTS "Payment requests viewable by authenticated" ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_select_policy" ON public.payment_requests;

CREATE POLICY "Payment requests viewable except ota"
ON public.payment_requests
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- CASH_OUTS
-- ============================================================

DROP POLICY IF EXISTS "Cash outs viewable by authenticated" ON public.cash_outs;
DROP POLICY IF EXISTS "cash_outs_select_policy" ON public.cash_outs;

CREATE POLICY "Cash outs viewable except ota"
ON public.cash_outs
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- CASH_ACCOUNTS
-- ============================================================

DROP POLICY IF EXISTS "Cash accounts viewable by authenticated" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_accounts_select_policy" ON public.cash_accounts;

CREATE POLICY "Cash accounts viewable except ota"
ON public.cash_accounts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- CASH_TRANSFERS
-- ============================================================

DROP POLICY IF EXISTS "Cash transfers viewable by authenticated" ON public.cash_transfers;
DROP POLICY IF EXISTS "cash_transfers_select_policy" ON public.cash_transfers;

CREATE POLICY "Cash transfers viewable except ota"
ON public.cash_transfers
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- OTA_PAYOUTS
-- ============================================================
-- Original policy: "OTA payouts viewable by authenticated" USING(true)

DROP POLICY IF EXISTS "OTA payouts viewable by authenticated" ON public.ota_payouts;

CREATE POLICY "OTA payouts viewable except ota"
ON public.ota_payouts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- OTA_PAYOUT_DETAILS
-- ============================================================

DROP POLICY IF EXISTS "OTA payout details viewable by authenticated" ON public.ota_payout_details;
DROP POLICY IF EXISTS "ota_payout_details_select_policy" ON public.ota_payout_details;

CREATE POLICY "OTA payout details viewable except ota"
ON public.ota_payout_details
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_PAYABLES
-- ============================================================
-- Original policy: "Host payables viewable by authenticated" USING(true)

DROP POLICY IF EXISTS "Host payables viewable by authenticated" ON public.host_payables;

CREATE POLICY "Host payables viewable except ota"
ON public.host_payables
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_SETTLEMENTS
-- ============================================================

DROP POLICY IF EXISTS "Host settlements viewable by authenticated" ON public.host_settlements;
DROP POLICY IF EXISTS "host_settlements_select_policy" ON public.host_settlements;

CREATE POLICY "Host settlements viewable except ota"
ON public.host_settlements
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_SUPPLY_SEGMENTS
-- ============================================================

DROP POLICY IF EXISTS "Host supply segments viewable by authenticated" ON public.host_supply_segments;
DROP POLICY IF EXISTS "host_supply_segments_select_policy" ON public.host_supply_segments;

CREATE POLICY "Host supply segments viewable except ota"
ON public.host_supply_segments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_DEPOSITS
-- ============================================================

DROP POLICY IF EXISTS "Host deposits viewable by authenticated" ON public.host_deposits;
DROP POLICY IF EXISTS "host_deposits_select_policy" ON public.host_deposits;

CREATE POLICY "Host deposits viewable except ota"
ON public.host_deposits
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_PREPAIDS
-- ============================================================

DROP POLICY IF EXISTS "Host prepaids viewable by authenticated" ON public.host_prepaids;
DROP POLICY IF EXISTS "host_prepaids_select_policy" ON public.host_prepaids;

CREATE POLICY "Host prepaids viewable except ota"
ON public.host_prepaids
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOST_PAYMENTS
-- ============================================================

DROP POLICY IF EXISTS "Host payments viewable by authenticated" ON public.host_payments;
DROP POLICY IF EXISTS "host_payments_select_policy" ON public.host_payments;

CREATE POLICY "Host payments viewable except ota"
ON public.host_payments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- PARTNERS
-- ============================================================
-- Original policy: "Partners viewable by authenticated" USING(true)

DROP POLICY IF EXISTS "Partners viewable by authenticated" ON public.partners;

CREATE POLICY "Partners viewable except ota"
ON public.partners
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- GUEST_DOCUMENTS (PII)
-- ============================================================

DROP POLICY IF EXISTS "Guest documents viewable by authenticated" ON public.guest_documents;
DROP POLICY IF EXISTS "guest_documents_select_policy" ON public.guest_documents;
DROP POLICY IF EXISTS "guest_documents viewable except ke_toan" ON public.guest_documents;

-- Keep existing ke_toan restriction AND add OTA restriction
CREATE POLICY "Guest documents viewable except ota and ketoan"
ON public.guest_documents
FOR SELECT
TO authenticated
USING (
  NOT public.is_ota_role() 
  AND NOT public.has_role(auth.uid(), 'ke_toan'::public.app_role)
);

-- ============================================================
-- LEDGER_ENTRIES
-- ============================================================

DROP POLICY IF EXISTS "Ledger entries viewable by authenticated" ON public.ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_select_policy" ON public.ledger_entries;

CREATE POLICY "Ledger entries viewable except ota"
ON public.ledger_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- HOTEL_COLLECTS
-- ============================================================

DROP POLICY IF EXISTS "Hotel collects viewable by authenticated" ON public.hotel_collects;
DROP POLICY IF EXISTS "hotel_collects_select_policy" ON public.hotel_collects;

CREATE POLICY "Hotel collects viewable except ota"
ON public.hotel_collects
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- REVENUE_ENTRIES
-- ============================================================

DROP POLICY IF EXISTS "Revenue entries viewable by authenticated" ON public.revenue_entries;
DROP POLICY IF EXISTS "revenue_entries_select_policy" ON public.revenue_entries;

CREATE POLICY "Revenue entries viewable except ota"
ON public.revenue_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- ============================================================
-- COMMENT
-- ============================================================
COMMENT ON POLICY "Bookings mirror viewable except ota" ON public.bookings_mirror IS 
'OTA roles cannot directly SELECT bookings_mirror. KPI access via ota_get_kpi() RPC only.';
