-- =====================================================
-- PHASE 1C: Fix RLS Policies - OTA & Cash Tables
-- =====================================================

-- 1. ota_payouts
DROP POLICY IF EXISTS "OTA payouts viewable by authenticated" ON public.ota_payouts;
CREATE POLICY "OTA payouts viewable by authenticated" 
ON public.ota_payouts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA payouts insertable by authenticated" ON public.ota_payouts;
CREATE POLICY "OTA payouts insertable by authenticated" 
ON public.ota_payouts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA payouts updatable by authenticated" ON public.ota_payouts;
CREATE POLICY "OTA payouts updatable by authenticated" 
ON public.ota_payouts FOR UPDATE TO authenticated USING (true);

-- 2. ota_payout_details
DROP POLICY IF EXISTS "OTA payout details viewable by authenticated" ON public.ota_payout_details;
CREATE POLICY "OTA payout details viewable by authenticated" 
ON public.ota_payout_details FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA payout details insertable by authenticated" ON public.ota_payout_details;
CREATE POLICY "OTA payout details insertable by authenticated" 
ON public.ota_payout_details FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA payout details updatable by authenticated" ON public.ota_payout_details;
CREATE POLICY "OTA payout details updatable by authenticated" 
ON public.ota_payout_details FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA payout details deletable by authenticated" ON public.ota_payout_details;
CREATE POLICY "OTA payout details deletable by authenticated" 
ON public.ota_payout_details FOR DELETE TO authenticated USING (true);

-- 3. ota_payout_deductions
DROP POLICY IF EXISTS "OTA payout deductions viewable by authenticated" ON public.ota_payout_deductions;
CREATE POLICY "OTA payout deductions viewable by authenticated" 
ON public.ota_payout_deductions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA payout deductions insertable by authenticated" ON public.ota_payout_deductions;
CREATE POLICY "OTA payout deductions insertable by authenticated" 
ON public.ota_payout_deductions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA payout deductions updatable by authenticated" ON public.ota_payout_deductions;
CREATE POLICY "OTA payout deductions updatable by authenticated" 
ON public.ota_payout_deductions FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA payout deductions deletable by authenticated" ON public.ota_payout_deductions;
CREATE POLICY "OTA payout deductions deletable by authenticated" 
ON public.ota_payout_deductions FOR DELETE TO authenticated USING (true);

-- 4. ota_disputes
DROP POLICY IF EXISTS "OTA disputes viewable by authenticated" ON public.ota_disputes;
CREATE POLICY "OTA disputes viewable by authenticated" 
ON public.ota_disputes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA disputes insertable by authenticated" ON public.ota_disputes;
CREATE POLICY "OTA disputes insertable by authenticated" 
ON public.ota_disputes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA disputes updatable by authenticated" ON public.ota_disputes;
CREATE POLICY "OTA disputes updatable by authenticated" 
ON public.ota_disputes FOR UPDATE TO authenticated USING (true);

-- 5. ota_deductions
DROP POLICY IF EXISTS "OTA deductions viewable by authenticated" ON public.ota_deductions;
CREATE POLICY "OTA deductions viewable by authenticated" 
ON public.ota_deductions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA deductions insertable by authenticated" ON public.ota_deductions;
CREATE POLICY "OTA deductions insertable by authenticated" 
ON public.ota_deductions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA deductions updatable by authenticated" ON public.ota_deductions;
CREATE POLICY "OTA deductions updatable by authenticated" 
ON public.ota_deductions FOR UPDATE TO authenticated USING (true);

-- 6. ota_expected
DROP POLICY IF EXISTS "OTA expected viewable by authenticated" ON public.ota_expected;
CREATE POLICY "OTA expected viewable by authenticated" 
ON public.ota_expected FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "OTA expected insertable by authenticated" ON public.ota_expected;
CREATE POLICY "OTA expected insertable by authenticated" 
ON public.ota_expected FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "OTA expected updatable by authenticated" ON public.ota_expected;
CREATE POLICY "OTA expected updatable by authenticated" 
ON public.ota_expected FOR UPDATE TO authenticated USING (true);

-- 7. hotel_collects
DROP POLICY IF EXISTS "Hotel collects viewable by authenticated" ON public.hotel_collects;
CREATE POLICY "Hotel collects viewable by authenticated" 
ON public.hotel_collects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Hotel collects insertable by authenticated" ON public.hotel_collects;
CREATE POLICY "Hotel collects insertable by authenticated" 
ON public.hotel_collects FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Hotel collects updatable by authenticated" ON public.hotel_collects;
CREATE POLICY "Hotel collects updatable by authenticated" 
ON public.hotel_collects FOR UPDATE TO authenticated USING (true);

-- 8. cashflow_entries
DROP POLICY IF EXISTS "Cashflow entries viewable by authenticated" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries viewable by authenticated" 
ON public.cashflow_entries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Cashflow entries insertable by authenticated" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries insertable by authenticated" 
ON public.cashflow_entries FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Cashflow entries updatable by authenticated" ON public.cashflow_entries;
CREATE POLICY "Cashflow entries updatable by authenticated" 
ON public.cashflow_entries FOR UPDATE TO authenticated USING (true);

-- 9. cash_outs
DROP POLICY IF EXISTS "Cash outs viewable by authenticated" ON public.cash_outs;
CREATE POLICY "Cash outs viewable by authenticated" 
ON public.cash_outs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Cash outs insertable by admin/ketoan" ON public.cash_outs;
CREATE POLICY "Cash outs insertable by admin/ketoan" 
ON public.cash_outs FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ke_toan'));

-- 10. revenue_entries
DROP POLICY IF EXISTS "Revenue entries viewable by authenticated" ON public.revenue_entries;
CREATE POLICY "Revenue entries viewable by authenticated" 
ON public.revenue_entries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Revenue entries insertable by authenticated" ON public.revenue_entries;
CREATE POLICY "Revenue entries insertable by authenticated" 
ON public.revenue_entries FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Revenue entries updatable by authenticated" ON public.revenue_entries;
CREATE POLICY "Revenue entries updatable by authenticated" 
ON public.revenue_entries FOR UPDATE TO authenticated USING (true);