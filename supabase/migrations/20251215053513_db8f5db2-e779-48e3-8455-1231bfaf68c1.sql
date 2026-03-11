-- Prioritize super_admin when resolving a user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    -- If user has super_admin, always return that
    (
      SELECT 'super_admin'::app_role
      WHERE EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'super_admin'::app_role
      )
    ),
    -- Otherwise, return any other role (with a simple priority ordering)
    (
      SELECT role
      FROM public.user_roles
      WHERE user_id = _user_id
      ORDER BY CASE role
        WHEN 'admin' THEN 1
        WHEN 'ke_toan' THEN 2
        WHEN 'cskh' THEN 3
        WHEN 'sale' THEN 4
        ELSE 5
      END
      LIMIT 1
    )
  );
$$;