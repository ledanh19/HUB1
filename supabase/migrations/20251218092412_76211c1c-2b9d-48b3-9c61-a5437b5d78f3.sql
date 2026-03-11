-- =====================================================
-- PHASE 1E: Fix RLS Policies - Remaining Tables
-- =====================================================

-- 1. customers
DROP POLICY IF EXISTS "Customers viewable by authenticated" ON public.customers;
CREATE POLICY "Customers viewable by authenticated" 
ON public.customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Customers insertable by authenticated" ON public.customers;
CREATE POLICY "Customers insertable by authenticated" 
ON public.customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers updatable by authenticated" ON public.customers;
CREATE POLICY "Customers updatable by authenticated" 
ON public.customers FOR UPDATE TO authenticated USING (true);

-- 2. profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" 
ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Profiles insertable by authenticated" ON public.profiles;
CREATE POLICY "Profiles insertable by authenticated" 
ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Profiles updatable by authenticated" ON public.profiles;
CREATE POLICY "Profiles updatable by authenticated" 
ON public.profiles FOR UPDATE TO authenticated USING (true);

-- 3. stays
DROP POLICY IF EXISTS "Stays viewable by authenticated" ON public.stays;
CREATE POLICY "Stays viewable by authenticated" 
ON public.stays FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Stays insertable by authenticated" ON public.stays;
CREATE POLICY "Stays insertable by authenticated" 
ON public.stays FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Stays updatable by authenticated" ON public.stays;
CREATE POLICY "Stays updatable by authenticated" 
ON public.stays FOR UPDATE TO authenticated USING (true);

-- 4. guest_documents
DROP POLICY IF EXISTS "Guest documents viewable by non-ketoan" ON public.guest_documents;
CREATE POLICY "Guest documents viewable by non-ketoan" 
ON public.guest_documents FOR SELECT TO authenticated 
USING (NOT public.has_role(auth.uid(), 'ke_toan'));

DROP POLICY IF EXISTS "Guest documents insertable by authenticated" ON public.guest_documents;
CREATE POLICY "Guest documents insertable by authenticated" 
ON public.guest_documents FOR INSERT TO authenticated WITH CHECK (true);

-- 5. host_properties
DROP POLICY IF EXISTS "Host properties viewable by authenticated" ON public.host_properties;
CREATE POLICY "Host properties viewable by authenticated" 
ON public.host_properties FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host properties insertable by authenticated" ON public.host_properties;
CREATE POLICY "Host properties insertable by authenticated" 
ON public.host_properties FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host properties updatable by authenticated" ON public.host_properties;
CREATE POLICY "Host properties updatable by authenticated" 
ON public.host_properties FOR UPDATE TO authenticated USING (true);

-- 6. host_rooms
DROP POLICY IF EXISTS "Host rooms viewable by authenticated" ON public.host_rooms;
CREATE POLICY "Host rooms viewable by authenticated" 
ON public.host_rooms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host rooms insertable by authenticated" ON public.host_rooms;
CREATE POLICY "Host rooms insertable by authenticated" 
ON public.host_rooms FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host rooms updatable by authenticated" ON public.host_rooms;
CREATE POLICY "Host rooms updatable by authenticated" 
ON public.host_rooms FOR UPDATE TO authenticated USING (true);

-- 7. host_room_types
DROP POLICY IF EXISTS "Host room types viewable by authenticated" ON public.host_room_types;
CREATE POLICY "Host room types viewable by authenticated" 
ON public.host_room_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host room types insertable by authenticated" ON public.host_room_types;
CREATE POLICY "Host room types insertable by authenticated" 
ON public.host_room_types FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Host room types updatable by authenticated" ON public.host_room_types;
CREATE POLICY "Host room types updatable by authenticated" 
ON public.host_room_types FOR UPDATE TO authenticated USING (true);

-- 8. host_payment_batches
DROP POLICY IF EXISTS "Payment batches viewable by authenticated" ON public.host_payment_batches;
CREATE POLICY "Payment batches viewable by authenticated" 
ON public.host_payment_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Payment batches insertable by ke_toan or admin" ON public.host_payment_batches;
CREATE POLICY "Payment batches insertable by ke_toan or admin" 
ON public.host_payment_batches FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'ke_toan') OR public.has_role(auth.uid(), 'admin'));

-- 9. host_payment_batch_items
DROP POLICY IF EXISTS "Batch items viewable by authenticated" ON public.host_payment_batch_items;
CREATE POLICY "Batch items viewable by authenticated" 
ON public.host_payment_batch_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Batch items insertable by ke_toan or admin" ON public.host_payment_batch_items;
CREATE POLICY "Batch items insertable by ke_toan or admin" 
ON public.host_payment_batch_items FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'ke_toan') OR public.has_role(auth.uid(), 'admin'));

-- 10. settlement_bookings
DROP POLICY IF EXISTS "Settlement bookings viewable by authenticated" ON public.settlement_bookings;
CREATE POLICY "Settlement bookings viewable by authenticated" 
ON public.settlement_bookings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Settlement bookings insertable by authenticated" ON public.settlement_bookings;
CREATE POLICY "Settlement bookings insertable by authenticated" 
ON public.settlement_bookings FOR INSERT TO authenticated WITH CHECK (true);

-- 11. manual_bookings
DROP POLICY IF EXISTS "Manual bookings viewable by authenticated" ON public.manual_bookings;
CREATE POLICY "Manual bookings viewable by authenticated" 
ON public.manual_bookings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manual bookings insertable by authenticated" ON public.manual_bookings;
CREATE POLICY "Manual bookings insertable by authenticated" 
ON public.manual_bookings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Manual bookings updatable by authenticated" ON public.manual_bookings;
CREATE POLICY "Manual bookings updatable by authenticated" 
ON public.manual_bookings FOR UPDATE TO authenticated USING (true);