-- ============================================================
-- BULK FIX PART 2: Fix remaining tables with old NOT is_ota_role() pattern
-- ============================================================

-- 1. cash_outs
DROP POLICY IF EXISTS "Cash outs viewable except ota" ON public.cash_outs;
CREATE POLICY "Cash outs viewable except ota_only" ON public.cash_outs
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 2. cash_transfers  
DROP POLICY IF EXISTS "Cash transfers viewable except ota" ON public.cash_transfers;
CREATE POLICY "Cash transfers viewable except ota_only" ON public.cash_transfers
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 3. cashflow_entries
DROP POLICY IF EXISTS "Cashflow entries viewable except ota" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries viewable except ota_only" ON public.cashflow_entries
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 4. guest_documents
DROP POLICY IF EXISTS "Guest documents viewable except ota and ketoan" ON public.guest_documents;
CREATE POLICY "Guest documents viewable except ota_only and ketoan" ON public.guest_documents
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role() AND NOT public.has_role(auth.uid(), 'ke_toan'::public.app_role));

-- 5. guests
DROP POLICY IF EXISTS "Guests viewable by ops roles" ON public.guests;
CREATE POLICY "Guests viewable except ota_only" ON public.guests
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 6. host_deposits
DROP POLICY IF EXISTS "Host deposits viewable except ota" ON public.host_deposits;
CREATE POLICY "Host deposits viewable except ota_only" ON public.host_deposits
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 7. host_payments
DROP POLICY IF EXISTS "Host payments viewable except ota" ON public.host_payments;
CREATE POLICY "Host payments viewable except ota_only" ON public.host_payments
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 8. host_prepaids
DROP POLICY IF EXISTS "Host prepaids viewable except ota" ON public.host_prepaids;
CREATE POLICY "Host prepaids viewable except ota_only" ON public.host_prepaids
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 9. host_settlements
DROP POLICY IF EXISTS "Host settlements viewable except ota" ON public.host_settlements;
CREATE POLICY "Host settlements viewable except ota_only" ON public.host_settlements
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 10. host_supply_segments
DROP POLICY IF EXISTS "Host supply segments viewable by ops roles" ON public.host_supply_segments;
CREATE POLICY "Host supply segments viewable except ota_only" ON public.host_supply_segments
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 11. hotel_collects
DROP POLICY IF EXISTS "Hotel collects viewable except ota" ON public.hotel_collects;
CREATE POLICY "Hotel collects viewable except ota_only" ON public.hotel_collects
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 12. ota_payout_details
DROP POLICY IF EXISTS "OTA payout details viewable except ota" ON public.ota_payout_details;
CREATE POLICY "OTA payout details viewable except ota_only" ON public.ota_payout_details
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 13. payment_requests
DROP POLICY IF EXISTS "Payment requests viewable except ota" ON public.payment_requests;
CREATE POLICY "Payment requests viewable except ota_only" ON public.payment_requests
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 14. revenue_entries
DROP POLICY IF EXISTS "Revenue entries viewable except ota" ON public.revenue_entries;
CREATE POLICY "Revenue entries viewable except ota_only" ON public.revenue_entries
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());

-- 15. stays - drop old duplicate policy
DROP POLICY IF EXISTS "Stays viewable by ops roles" ON public.stays;