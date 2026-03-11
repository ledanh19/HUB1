-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Non-ketoan users can view guest documents" ON storage.objects;

-- Create more restrictive policy - only admin, super_admin, cskh can view
CREATE POLICY "Restricted view guest documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'guest-documents' 
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'cskh')
  )
);