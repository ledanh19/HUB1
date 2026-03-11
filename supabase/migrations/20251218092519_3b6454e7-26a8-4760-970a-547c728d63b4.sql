-- =====================================================
-- PHASE 1G: Fix RLS Policies - Sync & Test Tables
-- =====================================================

-- 1. sync_runs
DROP POLICY IF EXISTS "Sync runs viewable by authenticated" ON public.sync_runs;
CREATE POLICY "Sync runs viewable by authenticated" 
ON public.sync_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Sync runs insertable by authenticated" ON public.sync_runs;
CREATE POLICY "Sync runs insertable by authenticated" 
ON public.sync_runs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Sync runs updatable by authenticated" ON public.sync_runs;
CREATE POLICY "Sync runs updatable by authenticated" 
ON public.sync_runs FOR UPDATE TO authenticated USING (true);

-- 2. sync_state
DROP POLICY IF EXISTS "Sync state viewable by authenticated" ON public.sync_state;
CREATE POLICY "Sync state viewable by authenticated" 
ON public.sync_state FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Sync state insertable by authenticated" ON public.sync_state;
CREATE POLICY "Sync state insertable by authenticated" 
ON public.sync_state FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Sync state updatable by authenticated" ON public.sync_state;
CREATE POLICY "Sync state updatable by authenticated" 
ON public.sync_state FOR UPDATE TO authenticated USING (true);

-- 3. test_scenarios
DROP POLICY IF EXISTS "Test scenarios viewable by authenticated" ON public.test_scenarios;
CREATE POLICY "Test scenarios viewable by authenticated" 
ON public.test_scenarios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Test scenarios insertable by super_admin" ON public.test_scenarios;
CREATE POLICY "Test scenarios insertable by super_admin" 
ON public.test_scenarios FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Test scenarios updatable by super_admin" ON public.test_scenarios;
CREATE POLICY "Test scenarios updatable by super_admin" 
ON public.test_scenarios FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Test scenarios deletable by super_admin" ON public.test_scenarios;
CREATE POLICY "Test scenarios deletable by super_admin" 
ON public.test_scenarios FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin'));

-- 4. test_runs
DROP POLICY IF EXISTS "Test runs viewable by authenticated" ON public.test_runs;
CREATE POLICY "Test runs viewable by authenticated" 
ON public.test_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Test runs insertable by super_admin" ON public.test_runs;
CREATE POLICY "Test runs insertable by super_admin" 
ON public.test_runs FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 5. user_roles
DROP POLICY IF EXISTS "User roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "User roles viewable by authenticated" 
ON public.user_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "User roles insertable by admin" ON public.user_roles;
CREATE POLICY "User roles insertable by admin" 
ON public.user_roles FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "User roles updatable by admin" ON public.user_roles;
CREATE POLICY "User roles updatable by admin" 
ON public.user_roles FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "User roles deletable by admin" ON public.user_roles;
CREATE POLICY "User roles deletable by admin" 
ON public.user_roles FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 6. user_page_permissions
DROP POLICY IF EXISTS "User page permissions viewable by authenticated" ON public.user_page_permissions;
CREATE POLICY "User page permissions viewable by authenticated" 
ON public.user_page_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "User page permissions insertable by admin" ON public.user_page_permissions;
CREATE POLICY "User page permissions insertable by admin" 
ON public.user_page_permissions FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "User page permissions updatable by admin" ON public.user_page_permissions;
CREATE POLICY "User page permissions updatable by admin" 
ON public.user_page_permissions FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "User page permissions deletable by admin" ON public.user_page_permissions;
CREATE POLICY "User page permissions deletable by admin" 
ON public.user_page_permissions FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 7. properties_mirror
DROP POLICY IF EXISTS "Properties mirror viewable by authenticated" ON public.properties_mirror;
CREATE POLICY "Properties mirror viewable by authenticated" 
ON public.properties_mirror FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Properties mirror insertable by admin" ON public.properties_mirror;
CREATE POLICY "Properties mirror insertable by admin" 
ON public.properties_mirror FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Properties mirror updatable by admin" ON public.properties_mirror;
CREATE POLICY "Properties mirror updatable by admin" 
ON public.properties_mirror FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 8. room_types_mirror
DROP POLICY IF EXISTS "Room types mirror viewable by authenticated" ON public.room_types_mirror;
CREATE POLICY "Room types mirror viewable by authenticated" 
ON public.room_types_mirror FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Room types mirror insertable by admin" ON public.room_types_mirror;
CREATE POLICY "Room types mirror insertable by admin" 
ON public.room_types_mirror FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Room types mirror updatable by admin" ON public.room_types_mirror;
CREATE POLICY "Room types mirror updatable by admin" 
ON public.room_types_mirror FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 9. messages (if exists, for legacy)
DROP POLICY IF EXISTS "Messages viewable by authenticated" ON public.messages;
CREATE POLICY "Messages viewable by authenticated" 
ON public.messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Messages insertable by authenticated" ON public.messages;
CREATE POLICY "Messages insertable by authenticated" 
ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Messages updatable by authenticated" ON public.messages;
CREATE POLICY "Messages updatable by authenticated" 
ON public.messages FOR UPDATE TO authenticated USING (true);

-- 10. webhook_events
DROP POLICY IF EXISTS "Webhook events viewable by authenticated" ON public.webhook_events;
CREATE POLICY "Webhook events viewable by authenticated" 
ON public.webhook_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Webhook events insertable by authenticated" ON public.webhook_events;
CREATE POLICY "Webhook events insertable by authenticated" 
ON public.webhook_events FOR INSERT TO authenticated WITH CHECK (true);