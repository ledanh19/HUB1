-- Allow super_admin to manage mapping rules
DROP POLICY IF EXISTS "Rules manageable by admin/ketoan" ON public.account_mapping_rules;
CREATE POLICY "Rules manageable by admin/ketoan/super_admin"
ON public.account_mapping_rules
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

DROP POLICY IF EXISTS "Rules updatable by admin/ketoan" ON public.account_mapping_rules;
CREATE POLICY "Rules updatable by admin/ketoan/super_admin"
ON public.account_mapping_rules
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
