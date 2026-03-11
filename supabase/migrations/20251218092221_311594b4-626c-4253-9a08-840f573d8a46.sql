-- =====================================================
-- PHASE 1A: Fix RLS Policies - Core Tables
-- =====================================================

-- 1. booking_room_lines_mirror
DROP POLICY IF EXISTS "Booking room lines viewable by authenticated" ON public.booking_room_lines_mirror;
CREATE POLICY "Booking room lines viewable by authenticated" 
ON public.booking_room_lines_mirror FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Booking room lines insertable by admin" ON public.booking_room_lines_mirror;
CREATE POLICY "Booking room lines insertable by admin" 
ON public.booking_room_lines_mirror FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Booking room lines updatable by admin" ON public.booking_room_lines_mirror;
CREATE POLICY "Booking room lines updatable by admin" 
ON public.booking_room_lines_mirror FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Booking room lines deletable by admin" ON public.booking_room_lines_mirror;
CREATE POLICY "Booking room lines deletable by admin" 
ON public.booking_room_lines_mirror FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 2. conversations
DROP POLICY IF EXISTS "Conversations viewable by authenticated" ON public.conversations;
CREATE POLICY "Conversations viewable by authenticated" 
ON public.conversations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Conversations insertable by authenticated" ON public.conversations;
CREATE POLICY "Conversations insertable by authenticated" 
ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Conversations updatable by authenticated" ON public.conversations;
CREATE POLICY "Conversations updatable by authenticated" 
ON public.conversations FOR UPDATE TO authenticated USING (true);

-- 3. channex_users
DROP POLICY IF EXISTS "Channex users viewable by authenticated" ON public.channex_users;
CREATE POLICY "Channex users viewable by authenticated" 
ON public.channex_users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Channex users insertable by admin" ON public.channex_users;
CREATE POLICY "Channex users insertable by admin" 
ON public.channex_users FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Channex users updatable by admin" ON public.channex_users;
CREATE POLICY "Channex users updatable by admin" 
ON public.channex_users FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 4. channex_user_properties
DROP POLICY IF EXISTS "Channex user properties viewable by authenticated" ON public.channex_user_properties;
CREATE POLICY "Channex user properties viewable by authenticated" 
ON public.channex_user_properties FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Channex user properties insertable by admin" ON public.channex_user_properties;
CREATE POLICY "Channex user properties insertable by admin" 
ON public.channex_user_properties FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Channex user properties updatable by admin" ON public.channex_user_properties;
CREATE POLICY "Channex user properties updatable by admin" 
ON public.channex_user_properties FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 5. channex_groups
DROP POLICY IF EXISTS "Channex groups viewable by authenticated" ON public.channex_groups;
CREATE POLICY "Channex groups viewable by authenticated" 
ON public.channex_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Channex groups insertable by admin" ON public.channex_groups;
CREATE POLICY "Channex groups insertable by admin" 
ON public.channex_groups FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Channex groups updatable by admin" ON public.channex_groups;
CREATE POLICY "Channex groups updatable by admin" 
ON public.channex_groups FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 6. channex_property_groups
DROP POLICY IF EXISTS "Channex property groups viewable by authenticated" ON public.channex_property_groups;
CREATE POLICY "Channex property groups viewable by authenticated" 
ON public.channex_property_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Channex property groups insertable by admin" ON public.channex_property_groups;
CREATE POLICY "Channex property groups insertable by admin" 
ON public.channex_property_groups FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Channex property groups deletable by admin" ON public.channex_property_groups;
CREATE POLICY "Channex property groups deletable by admin" 
ON public.channex_property_groups FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- 7. channex_mappings
DROP POLICY IF EXISTS "Channex mappings viewable by authenticated" ON public.channex_mappings;
CREATE POLICY "Channex mappings viewable by authenticated" 
ON public.channex_mappings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Channex mappings insertable by authenticated" ON public.channex_mappings;
CREATE POLICY "Channex mappings insertable by authenticated" 
ON public.channex_mappings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Channex mappings updatable by authenticated" ON public.channex_mappings;
CREATE POLICY "Channex mappings updatable by authenticated" 
ON public.channex_mappings FOR UPDATE TO authenticated USING (true);

-- 8. messages_mirror
DROP POLICY IF EXISTS "Messages viewable by authenticated" ON public.messages_mirror;
CREATE POLICY "Messages viewable by authenticated" 
ON public.messages_mirror FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Messages insertable by authenticated" ON public.messages_mirror;
CREATE POLICY "Messages insertable by authenticated" 
ON public.messages_mirror FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Messages updatable by authenticated" ON public.messages_mirror;
CREATE POLICY "Messages updatable by authenticated" 
ON public.messages_mirror FOR UPDATE TO authenticated USING (true);

-- 9. outbound_messages
DROP POLICY IF EXISTS "Outbound messages viewable by authenticated" ON public.outbound_messages;
CREATE POLICY "Outbound messages viewable by authenticated" 
ON public.outbound_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Outbound messages insertable by authenticated" ON public.outbound_messages;
CREATE POLICY "Outbound messages insertable by authenticated" 
ON public.outbound_messages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Outbound messages updatable by authenticated" ON public.outbound_messages;
CREATE POLICY "Outbound messages updatable by authenticated" 
ON public.outbound_messages FOR UPDATE TO authenticated USING (true);