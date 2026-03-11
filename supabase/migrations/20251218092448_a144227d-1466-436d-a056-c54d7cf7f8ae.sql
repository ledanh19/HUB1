-- =====================================================
-- PHASE 1F: Fix RLS Policies - System & Admin Tables
-- =====================================================

-- 1. audit_logs
DROP POLICY IF EXISTS "Audit logs viewable by authenticated" ON public.audit_logs;
CREATE POLICY "Audit logs viewable by authenticated" 
ON public.audit_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Audit logs insertable by authenticated" ON public.audit_logs;
CREATE POLICY "Audit logs insertable by authenticated" 
ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 2. approvals
DROP POLICY IF EXISTS "Approvals viewable by authenticated" ON public.approvals;
CREATE POLICY "Approvals viewable by authenticated" 
ON public.approvals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Approvals insertable by authenticated" ON public.approvals;
CREATE POLICY "Approvals insertable by authenticated" 
ON public.approvals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Approvals updatable by admin" ON public.approvals;
CREATE POLICY "Approvals updatable by admin" 
ON public.approvals FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 3. app_config
DROP POLICY IF EXISTS "Authenticated users can read app config" ON public.app_config;
CREATE POLICY "Authenticated users can read app config" 
ON public.app_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins can update app config" ON public.app_config;
CREATE POLICY "Super admins can update app config" 
ON public.app_config FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 4. booking_amount_overrides
DROP POLICY IF EXISTS "Booking amount overrides viewable by authenticated" ON public.booking_amount_overrides;
CREATE POLICY "Booking amount overrides viewable by authenticated" 
ON public.booking_amount_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Booking amount overrides insertable by authenticated" ON public.booking_amount_overrides;
CREATE POLICY "Booking amount overrides insertable by authenticated" 
ON public.booking_amount_overrides FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Booking amount overrides updatable by authenticated" ON public.booking_amount_overrides;
CREATE POLICY "Booking amount overrides updatable by authenticated" 
ON public.booking_amount_overrides FOR UPDATE TO authenticated USING (true);

-- 5. booking_warnings
DROP POLICY IF EXISTS "Booking warnings viewable by authenticated" ON public.booking_warnings;
CREATE POLICY "Booking warnings viewable by authenticated" 
ON public.booking_warnings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Booking warnings insertable by authenticated" ON public.booking_warnings;
CREATE POLICY "Booking warnings insertable by authenticated" 
ON public.booking_warnings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Booking warnings updatable by authenticated" ON public.booking_warnings;
CREATE POLICY "Booking warnings updatable by authenticated" 
ON public.booking_warnings FOR UPDATE TO authenticated USING (true);

-- 6. booking_data_health
DROP POLICY IF EXISTS "Booking data health viewable by authenticated" ON public.booking_data_health;
CREATE POLICY "Booking data health viewable by authenticated" 
ON public.booking_data_health FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Booking data health insertable by authenticated" ON public.booking_data_health;
CREATE POLICY "Booking data health insertable by authenticated" 
ON public.booking_data_health FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Booking data health updatable by authenticated" ON public.booking_data_health;
CREATE POLICY "Booking data health updatable by authenticated" 
ON public.booking_data_health FOR UPDATE TO authenticated USING (true);

-- 7. booking_scenario_map
DROP POLICY IF EXISTS "Booking scenario map viewable by authenticated" ON public.booking_scenario_map;
CREATE POLICY "Booking scenario map viewable by authenticated" 
ON public.booking_scenario_map FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Booking scenario map insertable by super_admin" ON public.booking_scenario_map;
CREATE POLICY "Booking scenario map insertable by super_admin" 
ON public.booking_scenario_map FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Booking scenario map deletable by super_admin" ON public.booking_scenario_map;
CREATE POLICY "Booking scenario map deletable by super_admin" 
ON public.booking_scenario_map FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin'));

-- 8. financial_periods
DROP POLICY IF EXISTS "Financial periods viewable by authenticated" ON public.financial_periods;
CREATE POLICY "Financial periods viewable by authenticated" 
ON public.financial_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Financial periods insertable by admin" ON public.financial_periods;
CREATE POLICY "Financial periods insertable by admin" 
ON public.financial_periods FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Financial periods updatable by admin" ON public.financial_periods;
CREATE POLICY "Financial periods updatable by admin" 
ON public.financial_periods FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 9. export_logs
DROP POLICY IF EXISTS "Export logs viewable by admin" ON public.export_logs;
CREATE POLICY "Export logs viewable by admin" 
ON public.export_logs FOR SELECT TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Export logs insertable by authenticated" ON public.export_logs;
CREATE POLICY "Export logs insertable by authenticated" 
ON public.export_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 10. dispute_attachments
DROP POLICY IF EXISTS "Dispute attachments viewable by authenticated" ON public.dispute_attachments;
CREATE POLICY "Dispute attachments viewable by authenticated" 
ON public.dispute_attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Dispute attachments insertable by authenticated" ON public.dispute_attachments;
CREATE POLICY "Dispute attachments insertable by authenticated" 
ON public.dispute_attachments FOR INSERT TO authenticated WITH CHECK (true);

-- 11. no_show_records
DROP POLICY IF EXISTS "No show records viewable by authenticated" ON public.no_show_records;
CREATE POLICY "No show records viewable by authenticated" 
ON public.no_show_records FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "No show records insertable by authenticated" ON public.no_show_records;
CREATE POLICY "No show records insertable by authenticated" 
ON public.no_show_records FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "No show records updatable by authenticated" ON public.no_show_records;
CREATE POLICY "No show records updatable by authenticated" 
ON public.no_show_records FOR UPDATE TO authenticated USING (true);

-- 12. internal_expenses
DROP POLICY IF EXISTS "Internal expenses viewable by authenticated" ON public.internal_expenses;
CREATE POLICY "Internal expenses viewable by authenticated" 
ON public.internal_expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Internal expenses insertable by authenticated" ON public.internal_expenses;
CREATE POLICY "Internal expenses insertable by authenticated" 
ON public.internal_expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Internal expenses updatable by authenticated" ON public.internal_expenses;
CREATE POLICY "Internal expenses updatable by authenticated" 
ON public.internal_expenses FOR UPDATE TO authenticated USING (true);

-- 13. payment_requests
DROP POLICY IF EXISTS "Payment requests viewable by authenticated" ON public.payment_requests;
CREATE POLICY "Payment requests viewable by authenticated" 
ON public.payment_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Payment requests insertable by authenticated" ON public.payment_requests;
CREATE POLICY "Payment requests insertable by authenticated" 
ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Payment requests updatable by authenticated" ON public.payment_requests;
CREATE POLICY "Payment requests updatable by authenticated" 
ON public.payment_requests FOR UPDATE TO authenticated USING (true);

-- 14. payment_request_attachments
DROP POLICY IF EXISTS "Payment request attachments viewable by authenticated" ON public.payment_request_attachments;
CREATE POLICY "Payment request attachments viewable by authenticated" 
ON public.payment_request_attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Payment request attachments insertable by authenticated" ON public.payment_request_attachments;
CREATE POLICY "Payment request attachments insertable by authenticated" 
ON public.payment_request_attachments FOR INSERT TO authenticated WITH CHECK (true);

-- 15. refund_thresholds
DROP POLICY IF EXISTS "Refund thresholds viewable by authenticated" ON public.refund_thresholds;
CREATE POLICY "Refund thresholds viewable by authenticated" 
ON public.refund_thresholds FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Refund thresholds insertable by admin" ON public.refund_thresholds;
CREATE POLICY "Refund thresholds insertable by admin" 
ON public.refund_thresholds FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Refund thresholds updatable by admin" ON public.refund_thresholds;
CREATE POLICY "Refund thresholds updatable by admin" 
ON public.refund_thresholds FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));