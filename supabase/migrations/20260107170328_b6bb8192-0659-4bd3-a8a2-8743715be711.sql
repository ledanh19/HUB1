
-- Fix ota_get_kpi permission - add SECURITY DEFINER
-- Also create E2E test data for proper testing

-- 1. Fix ota_get_kpi permission
DROP FUNCTION IF EXISTS ota_get_kpi(DATE, DATE, UUID[], TEXT);

CREATE OR REPLACE FUNCTION ota_get_kpi(
  p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_property_ids UUID[] DEFAULT NULL,
  p_group_by TEXT DEFAULT 'channel'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_user_id UUID;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  -- Check OTA role access
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  
  IF NOT is_ota_role(v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Chỉ OTA role mới xem được KPI');
  END IF;
  
  -- Return aggregated KPI data (no PII)
  SELECT json_build_object(
    'success', true,
    'summary', json_build_object(
      'total_bookings', COALESCE((
        SELECT COUNT(*) FROM bookings_mirror 
        WHERE booking_date BETWEEN p_start_date AND p_end_date
        AND (p_property_ids IS NULL OR pms_property_id::uuid = ANY(p_property_ids))
      ), 0),
      'total_revenue', COALESCE((
        SELECT SUM(total_amount_gross) FROM bookings_mirror
        WHERE booking_date BETWEEN p_start_date AND p_end_date
        AND (p_property_ids IS NULL OR pms_property_id::uuid = ANY(p_property_ids))
      ), 0),
      'avg_nights', COALESCE((
        SELECT ROUND(AVG(nights)::numeric, 1) FROM bookings_mirror
        WHERE booking_date BETWEEN p_start_date AND p_end_date
        AND (p_property_ids IS NULL OR pms_property_id::uuid = ANY(p_property_ids))
      ), 0)
    ),
    'by_channel', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT 
          ota_source as channel,
          COUNT(*) as booking_count,
          COALESCE(SUM(total_amount_gross), 0) as revenue
        FROM bookings_mirror
        WHERE booking_date BETWEEN p_start_date AND p_end_date
        AND (p_property_ids IS NULL OR pms_property_id::uuid = ANY(p_property_ids))
        GROUP BY ota_source
        ORDER BY COUNT(*) DESC
      ) c
    ),
    'date_range', json_build_object(
      'start', p_start_date,
      'end', p_end_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (will be checked by is_ota_role)
GRANT EXECUTE ON FUNCTION ota_get_kpi(DATE, DATE, UUID[], TEXT) TO authenticated;

-- 2. Add ota_staff role to existing user for testing
INSERT INTO public.user_roles (user_id, role)
SELECT '87746750-9ca8-478e-a44e-4b3ae82e1066'::uuid, 'ota_staff'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = '87746750-9ca8-478e-a44e-4b3ae82e1066'::uuid 
  AND role = 'ota_staff'
);
