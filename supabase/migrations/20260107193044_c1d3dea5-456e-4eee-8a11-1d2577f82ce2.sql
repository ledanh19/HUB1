
-- Fix RLS policies for users who have BOTH standard roles AND OTA roles
-- The issue: super_admin/admin users who also have ota_lead/ota_staff roles
-- are being blocked from reading host_supply_segments, affecting P&L and Dashboard

-- Step 1: Update host_supply_segments SELECT policy to include standard roles check
DROP POLICY IF EXISTS "Host supply segments viewable except ota" ON public.host_supply_segments;

CREATE POLICY "Host supply segments viewable by ops roles"
ON public.host_supply_segments
FOR SELECT
TO authenticated
USING (
  -- Allow if user has standard operational roles (admin, super_admin, ke_toan, sale, cskh)
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'ke_toan', 'sale', 'cskh')
  )
  -- OR if user doesn't have OTA role at all
  OR NOT is_ota_role()
);

-- Step 2: Update bookings_mirror SELECT policy (same fix pattern)
DROP POLICY IF EXISTS "Bookings mirror viewable by ops roles" ON public.bookings_mirror;

CREATE POLICY "Bookings mirror viewable by ops roles"
ON public.bookings_mirror
FOR SELECT
TO authenticated
USING (
  -- Allow if user has standard operational roles
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'ke_toan', 'sale', 'cskh')
  )
  -- OR if user doesn't have OTA role at all
  OR NOT is_ota_role()
);

-- Step 3: Update stays SELECT policy (same fix pattern - there are 2 policies, keep the better one)
DROP POLICY IF EXISTS "Stays viewable by authenticated" ON public.stays;
DROP POLICY IF EXISTS "Stays viewable by ops roles" ON public.stays;

CREATE POLICY "Stays viewable by ops roles"
ON public.stays
FOR SELECT
TO authenticated
USING (
  -- Allow if user has standard operational roles
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'ke_toan', 'sale', 'cskh')
  )
  -- OR if user doesn't have OTA role at all
  OR NOT is_ota_role()
);
