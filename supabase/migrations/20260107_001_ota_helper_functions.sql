-- ============================================================
-- OTA OPERATIONS MODULE - 001: HELPER FUNCTIONS
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Core helper functions for OTA Operations
-- Hardening: SECURITY DEFINER, search_path, REVOKE/GRANT
-- ============================================================

-- ============================================================
-- 1. is_ota_role() - Check if current user has OTA role
-- ============================================================
-- Used by: RLS policies, RPCs
-- Returns: TRUE if user is ota_staff or ota_lead

CREATE OR REPLACE FUNCTION public.is_ota_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('ota_staff', 'ota_lead')
  );
$$;

-- Security hardening
REVOKE ALL ON FUNCTION public.is_ota_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ota_role() TO authenticated;

COMMENT ON FUNCTION public.is_ota_role() IS 
'Check if current user has OTA role (ota_staff or ota_lead). 
SECURITY DEFINER - used by RLS policies to deny OTA access to sensitive tables.';

-- ============================================================
-- 2. is_ota_lead_or_admin() - Check if user can manage OTA
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_ota_lead_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('ota_lead', 'admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_ota_lead_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ota_lead_or_admin() TO authenticated;

COMMENT ON FUNCTION public.is_ota_lead_or_admin() IS 
'Check if current user is OTA lead or admin. Used for management actions.';

-- ============================================================
-- 3. normalize_ota_source() - Normalize OTA channel source
-- ============================================================
-- IMMUTABLE for index usage
-- Used by: KPI RPC only

CREATE OR REPLACE FUNCTION public.normalize_ota_source(raw_source TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE UPPER(TRIM(COALESCE(raw_source, '')))
    WHEN 'BOOKING.COM' THEN 'BOOKING_COM'
    WHEN 'BOOKINGCOM' THEN 'BOOKING_COM'
    WHEN 'BOOKING' THEN 'BOOKING_COM'
    WHEN 'AGODA' THEN 'AGODA'
    WHEN 'EXPEDIA' THEN 'EXPEDIA'
    WHEN 'AIRBNB' THEN 'AIRBNB'
    WHEN 'TRAVELOKA' THEN 'TRAVELOKA'
    WHEN 'DIRECT' THEN 'DIRECT'
    WHEN 'WEBSITE' THEN 'DIRECT'
    WHEN 'WALK-IN' THEN 'DIRECT'
    WHEN 'WALKIN' THEN 'DIRECT'
    WHEN 'PHONE' THEN 'DIRECT'
    ELSE 'UNKNOWN'
  END;
$$;

-- Public function - used for display/normalization
COMMENT ON FUNCTION public.normalize_ota_source(TEXT) IS 
'Normalize OTA source string to canonical format. IMMUTABLE for index compatibility.
Maps: booking.com -> BOOKING_COM, agoda -> AGODA, etc. Unknown -> UNKNOWN';

-- ============================================================
-- 4. has_ota_project_access() - Check project membership
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_ota_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ota_project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.has_ota_project_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ota_project_access(UUID) TO authenticated;

COMMENT ON FUNCTION public.has_ota_project_access(UUID) IS 
'Check if current user has access to OTA project (member or admin).';

-- ============================================================
-- 5. get_ota_project_role() - Get user role in project
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ota_project_role(p_project_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.ota_project_members
     WHERE project_id = p_project_id AND user_id = auth.uid() AND is_active = true),
    (SELECT 'ADMIN' FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
     LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.get_ota_project_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ota_project_role(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_ota_project_role(UUID) IS 
'Get current user role in OTA project. Returns STAFF, LEAD, or ADMIN.';

-- ============================================================
-- 6. raise_immutable_error() - Trigger function for immutable fields
-- ============================================================

CREATE OR REPLACE FUNCTION public.raise_immutable_error()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Cannot modify immutable fields';
END;
$$;

COMMENT ON FUNCTION public.raise_immutable_error() IS 
'Trigger function to prevent modification of immutable fields.';
