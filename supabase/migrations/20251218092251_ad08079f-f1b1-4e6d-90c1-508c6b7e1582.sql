-- =====================================================
-- PHASE 1B: Fix RLS Policies - Financial Tables
-- =====================================================

-- 1. bookings_mirror
DROP POLICY IF EXISTS "Bookings mirror viewable by authenticated" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bookings mirror insertable by admin" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror insertable by admin" 
ON public.bookings_mirror FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Bookings mirror updatable by admin" ON public.bookings_mirror;
CREATE POLICY "Bookings mirror updatable by admin" 
ON public.bookings_mirror FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 2. host_payables
DROP POLICY IF EXISTS "Host payables viewable by authenticated" ON public.host_payables;
CREATE POLICY "Host payables viewable by authenticated" 
ON public.host_payables FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host payables insertable by authenticated" ON public.host_payables;
CREATE POLICY "Host payables insertable by authenticated" 
ON public.host_payables FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host payables updatable by authenticated" ON public.host_payables;
CREATE POLICY "Host payables updatable by authenticated" 
ON public.host_payables FOR UPDATE TO authenticated USING (true);

-- 3. host_payments
DROP POLICY IF EXISTS "Host payments viewable by authenticated" ON public.host_payments;
CREATE POLICY "Host payments viewable by authenticated" 
ON public.host_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host payments insertable by ke_toan or admin" ON public.host_payments;
CREATE POLICY "Host payments insertable by ke_toan or admin" 
ON public.host_payments FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'ke_toan') OR public.has_role(auth.uid(), 'admin'));

-- 4. host_settlements
DROP POLICY IF EXISTS "Host settlements viewable by authenticated" ON public.host_settlements;
CREATE POLICY "Host settlements viewable by authenticated" 
ON public.host_settlements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host settlements insertable by authenticated" ON public.host_settlements;
CREATE POLICY "Host settlements insertable by authenticated" 
ON public.host_settlements FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host settlements updatable by authenticated" ON public.host_settlements;
CREATE POLICY "Host settlements updatable by authenticated" 
ON public.host_settlements FOR UPDATE TO authenticated USING (true);

-- 5. host_deposits
DROP POLICY IF EXISTS "Host deposits viewable by authenticated" ON public.host_deposits;
CREATE POLICY "Host deposits viewable by authenticated" 
ON public.host_deposits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host deposits insertable by authenticated" ON public.host_deposits;
CREATE POLICY "Host deposits insertable by authenticated" 
ON public.host_deposits FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host deposits updatable by authenticated" ON public.host_deposits;
CREATE POLICY "Host deposits updatable by authenticated" 
ON public.host_deposits FOR UPDATE TO authenticated USING (true);

-- 6. host_prepaids
DROP POLICY IF EXISTS "Host prepaids viewable by authenticated" ON public.host_prepaids;
CREATE POLICY "Host prepaids viewable by authenticated" 
ON public.host_prepaids FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host prepaids insertable by ke_toan or admin" ON public.host_prepaids;
CREATE POLICY "Host prepaids insertable by ke_toan or admin" 
ON public.host_prepaids FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'ke_toan') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Host prepaids updatable by ke_toan or admin" ON public.host_prepaids;
CREATE POLICY "Host prepaids updatable by ke_toan or admin" 
ON public.host_prepaids FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'ke_toan') OR public.has_role(auth.uid(), 'admin'));

-- 7. host_extra_charges
DROP POLICY IF EXISTS "Host extra charges viewable by authenticated" ON public.host_extra_charges;
CREATE POLICY "Host extra charges viewable by authenticated" 
ON public.host_extra_charges FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host extra charges insertable by authenticated" ON public.host_extra_charges;
CREATE POLICY "Host extra charges insertable by authenticated" 
ON public.host_extra_charges FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host extra charges deletable by admin" ON public.host_extra_charges;
CREATE POLICY "Host extra charges deletable by admin" 
ON public.host_extra_charges FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 8. host_supply_segments
DROP POLICY IF EXISTS "Host supply segments viewable by authenticated" ON public.host_supply_segments;
CREATE POLICY "Host supply segments viewable by authenticated" 
ON public.host_supply_segments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host supply segments insertable by authenticated" ON public.host_supply_segments;
CREATE POLICY "Host supply segments insertable by authenticated" 
ON public.host_supply_segments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host supply segments updatable by authenticated" ON public.host_supply_segments;
CREATE POLICY "Host supply segments updatable by authenticated" 
ON public.host_supply_segments FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Host supply segments deletable by admin" ON public.host_supply_segments;
CREATE POLICY "Host supply segments deletable by admin" 
ON public.host_supply_segments FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 9. host_settlement_adjustments
DROP POLICY IF EXISTS "Host settlement adjustments viewable by authenticated" ON public.host_settlement_adjustments;
CREATE POLICY "Host settlement adjustments viewable by authenticated" 
ON public.host_settlement_adjustments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host settlement adjustments insertable by authenticated" ON public.host_settlement_adjustments;
CREATE POLICY "Host settlement adjustments insertable by authenticated" 
ON public.host_settlement_adjustments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host settlement adjustments updatable by authenticated" ON public.host_settlement_adjustments;
CREATE POLICY "Host settlement adjustments updatable by authenticated" 
ON public.host_settlement_adjustments FOR UPDATE TO authenticated USING (true);

-- 10. host_surcharges
DROP POLICY IF EXISTS "Host surcharges viewable by authenticated" ON public.host_surcharges;
CREATE POLICY "Host surcharges viewable by authenticated" 
ON public.host_surcharges FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host surcharges insertable by authenticated" ON public.host_surcharges;
CREATE POLICY "Host surcharges insertable by authenticated" 
ON public.host_surcharges FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host surcharges updatable by authenticated" ON public.host_surcharges;
CREATE POLICY "Host surcharges updatable by authenticated" 
ON public.host_surcharges FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Host surcharges deletable by admin" ON public.host_surcharges;
CREATE POLICY "Host surcharges deletable by admin" 
ON public.host_surcharges FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));