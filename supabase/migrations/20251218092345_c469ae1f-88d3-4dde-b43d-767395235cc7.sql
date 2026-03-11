-- =====================================================
-- PHASE 1D: Fix RLS Policies - Service & Partner Tables
-- =====================================================

-- 1. service_orders
DROP POLICY IF EXISTS "Service orders viewable by authenticated" ON public.service_orders;
CREATE POLICY "Service orders viewable by authenticated" 
ON public.service_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service orders insertable by authenticated" ON public.service_orders;
CREATE POLICY "Service orders insertable by authenticated" 
ON public.service_orders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service orders updatable by authenticated" ON public.service_orders;
CREATE POLICY "Service orders updatable by authenticated" 
ON public.service_orders FOR UPDATE TO authenticated USING (true);

-- 2. service_settlements
DROP POLICY IF EXISTS "Service settlements viewable by authenticated" ON public.service_settlements;
CREATE POLICY "Service settlements viewable by authenticated" 
ON public.service_settlements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service settlements insertable by authenticated" ON public.service_settlements;
CREATE POLICY "Service settlements insertable by authenticated" 
ON public.service_settlements FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service settlements updatable by authenticated" ON public.service_settlements;
CREATE POLICY "Service settlements updatable by authenticated" 
ON public.service_settlements FOR UPDATE TO authenticated USING (true);

-- 3. service_settlement_items
DROP POLICY IF EXISTS "Service settlement items viewable by authenticated" ON public.service_settlement_items;
CREATE POLICY "Service settlement items viewable by authenticated" 
ON public.service_settlement_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service settlement items insertable by authenticated" ON public.service_settlement_items;
CREATE POLICY "Service settlement items insertable by authenticated" 
ON public.service_settlement_items FOR INSERT TO authenticated WITH CHECK (true);

-- 4. service_partner_payables
DROP POLICY IF EXISTS "Service partner payables viewable by authenticated" ON public.service_partner_payables;
CREATE POLICY "Service partner payables viewable by authenticated" 
ON public.service_partner_payables FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service partner payables insertable by authenticated" ON public.service_partner_payables;
CREATE POLICY "Service partner payables insertable by authenticated" 
ON public.service_partner_payables FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service partner payables updatable by authenticated" ON public.service_partner_payables;
CREATE POLICY "Service partner payables updatable by authenticated" 
ON public.service_partner_payables FOR UPDATE TO authenticated USING (true);

-- 5. service_payments
DROP POLICY IF EXISTS "Service payments viewable by authenticated" ON public.service_payments;
CREATE POLICY "Service payments viewable by authenticated" 
ON public.service_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service payments insertable by authenticated" ON public.service_payments;
CREATE POLICY "Service payments insertable by authenticated" 
ON public.service_payments FOR INSERT TO authenticated WITH CHECK (true);

-- 6. service_catalog
DROP POLICY IF EXISTS "Service catalog viewable by authenticated" ON public.service_catalog;
CREATE POLICY "Service catalog viewable by authenticated" 
ON public.service_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service catalog insertable by authenticated" ON public.service_catalog;
CREATE POLICY "Service catalog insertable by authenticated" 
ON public.service_catalog FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service catalog updatable by authenticated" ON public.service_catalog;
CREATE POLICY "Service catalog updatable by authenticated" 
ON public.service_catalog FOR UPDATE TO authenticated USING (true);

-- 7. partners
DROP POLICY IF EXISTS "Partners viewable by authenticated" ON public.partners;
CREATE POLICY "Partners viewable by authenticated" 
ON public.partners FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Partners insertable by authenticated" ON public.partners;
CREATE POLICY "Partners insertable by authenticated" 
ON public.partners FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Partners updatable by authenticated" ON public.partners;
CREATE POLICY "Partners updatable by authenticated" 
ON public.partners FOR UPDATE TO authenticated USING (true);

-- 8. partner_commission_config
DROP POLICY IF EXISTS "Partner commission config viewable by authenticated" ON public.partner_commission_config;
CREATE POLICY "Partner commission config viewable by authenticated" 
ON public.partner_commission_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Partner commission config insertable by admin" ON public.partner_commission_config;
CREATE POLICY "Partner commission config insertable by admin" 
ON public.partner_commission_config FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Partner commission config updatable by admin" ON public.partner_commission_config;
CREATE POLICY "Partner commission config updatable by admin" 
ON public.partner_commission_config FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 9. commission_receivables
DROP POLICY IF EXISTS "Commission receivables viewable by authenticated" ON public.commission_receivables;
CREATE POLICY "Commission receivables viewable by authenticated" 
ON public.commission_receivables FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Commission receivables insertable by authenticated" ON public.commission_receivables;
CREATE POLICY "Commission receivables insertable by authenticated" 
ON public.commission_receivables FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Commission receivables updatable by authenticated" ON public.commission_receivables;
CREATE POLICY "Commission receivables updatable by authenticated" 
ON public.commission_receivables FOR UPDATE TO authenticated USING (true);