-- Create table for dynamic user page permissions
CREATE TABLE public.user_page_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    page_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    UNIQUE (user_id, page_path)
);

-- Enable RLS
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to get user page permissions
CREATE OR REPLACE FUNCTION public.get_user_page_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(array_agg(page_path), ARRAY[]::TEXT[])
    FROM public.user_page_permissions
    WHERE user_id = _user_id
$$;

-- Security definer function to check if user has page access
CREATE OR REPLACE FUNCTION public.has_page_access(_user_id UUID, _page_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_page_permissions
        WHERE user_id = _user_id
          AND page_path = _page_path
    )
$$;

-- RLS Policies - Only admins can manage permissions
CREATE POLICY "Admins can view all page permissions"
ON public.user_page_permissions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

CREATE POLICY "Admins can insert page permissions"
ON public.user_page_permissions
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

CREATE POLICY "Admins can delete page permissions"
ON public.user_page_permissions
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);