
-- Fix search_path for email module functions
CREATE OR REPLACE FUNCTION public.email_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_email_access()
RETURNS boolean AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role) OR
    public.has_role(auth.uid(), 'sale'::public.app_role);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
