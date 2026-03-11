-- Fix cash_accounts RLS: mixed role users should still see cash accounts
DROP POLICY IF EXISTS "Cash accounts viewable except ota" ON public.cash_accounts;
CREATE POLICY "Cash accounts viewable except ota_only"
ON public.cash_accounts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_only_role());

-- Allow super_admin to manage cash accounts
DROP POLICY IF EXISTS "Cash accounts manageable by admin/ketoan" ON public.cash_accounts;
CREATE POLICY "Cash accounts manageable by admin/ketoan/super_admin"
ON public.cash_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['super_admin'::public.app_role, 'admin'::public.app_role, 'ke_toan'::public.app_role])
  )
);

DROP POLICY IF EXISTS "Cash accounts updatable by admin/ketoan" ON public.cash_accounts;
CREATE POLICY "Cash accounts updatable by admin/ketoan/super_admin"
ON public.cash_accounts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['super_admin'::public.app_role, 'admin'::public.app_role, 'ke_toan'::public.app_role])
  )
);
