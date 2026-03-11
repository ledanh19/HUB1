-- Fix RLS policy: Allow users with operational roles to see bookings
-- even if they also have OTA roles

DROP POLICY IF EXISTS "Bookings mirror viewable except ota" ON bookings_mirror;

-- New policy: Users can view bookings if they have any operational role
CREATE POLICY "Bookings mirror viewable by ops roles" 
ON bookings_mirror
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'sale', 'ke_toan', 'cskh')
  )
  OR NOT is_ota_role()
);

-- Fix stays table
DROP POLICY IF EXISTS "Stays viewable except ota" ON stays;
CREATE POLICY "Stays viewable by ops roles" 
ON stays
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'sale', 'ke_toan', 'cskh')
  )
  OR NOT is_ota_role()
);

-- Fix guests table
DROP POLICY IF EXISTS "Guests viewable except ota" ON guests;
CREATE POLICY "Guests viewable by ops roles" 
ON guests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'sale', 'ke_toan', 'cskh')
  )
  OR NOT is_ota_role()
);