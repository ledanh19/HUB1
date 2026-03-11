-- Allow finance/admin roles to update receipt fields (and other editable fields) on cash_outs
DROP POLICY IF EXISTS "Cash outs updatable by admin/ketoan" ON public.cash_outs;

CREATE POLICY "Cash outs updatable by admin/ketoan"
ON public.cash_outs
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ke_toan'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ke_toan'::app_role)
);