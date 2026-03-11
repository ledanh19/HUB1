-- Fix stays table  
DROP POLICY IF EXISTS "Stays viewable except ota" ON public.stays;
CREATE POLICY "Stays viewable except ota_only" ON public.stays
  FOR SELECT TO authenticated
  USING (NOT public.is_ota_only_role());