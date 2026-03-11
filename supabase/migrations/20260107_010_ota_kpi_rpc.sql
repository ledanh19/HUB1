-- ============================================================
-- OTA OPERATIONS MODULE - 010: KPI RPC
-- ============================================================
-- Date: 2026-01-07
-- Purpose: OTA KPI aggregation via SECURITY DEFINER RPC
-- 
-- CRITICAL Design Decisions:
--   1. RPC only, NO VIEW (views inherit caller's RLS)
--   2. SECURITY DEFINER bypasses RLS (controlled access)
--   3. Date range clamped to ≤ 400 days
--   4. Uses normalize_ota_source() IMMUTABLE function
--   5. Date axis: booking_date (not check_in_date)
--   6. Status filter: CONFIRMED only
--   7. Property FK: properties_mirror.id (SSOT dimension)
-- ============================================================

-- ============================================================
-- RPC: ota_get_kpi
-- Main KPI aggregation function for OTA performance
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_kpi(
  p_start_date DATE,
  p_end_date DATE,
  p_property_ids UUID[] DEFAULT NULL,
  p_group_by TEXT DEFAULT 'channel'  -- 'channel', 'property', 'daily', 'monthly'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_date_range_days INT;
  v_effective_start DATE;
  v_effective_end DATE;
BEGIN
  -- ============================================================
  -- SECURITY CHECK: OTA role required
  -- ============================================================
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access KPI data'
    );
  END IF;
  
  -- ============================================================
  -- DATE VALIDATION & CLAMPING
  -- ============================================================
  -- Validate dates provided
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_DATES',
      'message', 'Start date and end date are required'
    );
  END IF;
  
  IF p_start_date > p_end_date THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_DATE_RANGE',
      'message', 'Start date must be before end date'
    );
  END IF;
  
  -- Calculate date range
  v_date_range_days := p_end_date - p_start_date;
  
  -- CLAMP to max 400 days
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  -- ============================================================
  -- AGGREGATION BY GROUP TYPE
  -- ============================================================
  IF p_group_by = 'channel' THEN
    -- Group by OTA channel (normalized)
    SELECT json_agg(row_to_json(r))
    INTO v_result
    FROM (
      SELECT 
        normalize_ota_source(b.ota_source) as channel,
        COUNT(*) as booking_count,
        COALESCE(SUM(b.total_price), 0) as total_revenue,
        COALESCE(AVG(b.total_price), 0) as avg_booking_value,
        COALESCE(SUM(b.nights), 0) as total_nights,
        MIN(b.booking_date) as first_booking,
        MAX(b.booking_date) as last_booking
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED'
        AND b.booking_date BETWEEN v_effective_start AND v_effective_end
        AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY normalize_ota_source(b.ota_source)
      ORDER BY booking_count DESC
    ) r;
    
  ELSIF p_group_by = 'property' THEN
    -- Group by property
    SELECT json_agg(row_to_json(r))
    INTO v_result
    FROM (
      SELECT 
        pm.id as property_id,
        pm.name as property_name,
        COUNT(*) as booking_count,
        COALESCE(SUM(b.total_price), 0) as total_revenue,
        COALESCE(AVG(b.total_price), 0) as avg_booking_value,
        COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED'
        AND b.booking_date BETWEEN v_effective_start AND v_effective_end
        AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY pm.id, pm.name
      ORDER BY booking_count DESC
    ) r;
    
  ELSIF p_group_by = 'daily' THEN
    -- Group by day
    SELECT json_agg(row_to_json(r))
    INTO v_result
    FROM (
      SELECT 
        b.booking_date as date,
        COUNT(*) as booking_count,
        COALESCE(SUM(b.total_price), 0) as total_revenue,
        COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED'
        AND b.booking_date BETWEEN v_effective_start AND v_effective_end
        AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY b.booking_date
      ORDER BY b.booking_date
    ) r;
    
  ELSIF p_group_by = 'monthly' THEN
    -- Group by month
    SELECT json_agg(row_to_json(r))
    INTO v_result
    FROM (
      SELECT 
        DATE_TRUNC('month', b.booking_date)::DATE as month,
        COUNT(*) as booking_count,
        COALESCE(SUM(b.total_price), 0) as total_revenue,
        COALESCE(AVG(b.total_price), 0) as avg_booking_value,
        COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED'
        AND b.booking_date BETWEEN v_effective_start AND v_effective_end
        AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY DATE_TRUNC('month', b.booking_date)
      ORDER BY month
    ) r;
    
  ELSE
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_GROUP_BY',
      'message', 'group_by must be: channel, property, daily, or monthly'
    );
  END IF;
  
  -- ============================================================
  -- RETURN RESULT
  -- ============================================================
  RETURN json_build_object(
    'success', true,
    'meta', json_build_object(
      'start_date', v_effective_start,
      'end_date', v_effective_end,
      'requested_start', p_start_date,
      'requested_end', p_end_date,
      'date_clamped', v_date_range_days > 400,
      'group_by', p_group_by,
      'property_filter', p_property_ids
    ),
    'data', COALESCE(v_result, '[]'::json)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

-- Security hardening
REVOKE ALL ON FUNCTION public.ota_get_kpi FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_kpi TO authenticated;

-- ============================================================
-- RPC: ota_get_kpi_summary
-- Quick summary stats for dashboard header
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_kpi_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_property_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
  v_date_range_days INT;
  v_effective_start DATE;
  v_effective_end DATE;
BEGIN
  -- Security check
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access KPI data'
    );
  END IF;
  
  -- Validate dates
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_DATES',
      'message', 'Start date and end date are required'
    );
  END IF;
  
  -- Date clamping
  v_date_range_days := p_end_date - p_start_date;
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  -- Get summary stats
  SELECT 
    COUNT(*) as total_bookings,
    COALESCE(SUM(b.total_price), 0) as total_revenue,
    COALESCE(AVG(b.total_price), 0) as avg_booking_value,
    COALESCE(SUM(b.nights), 0) as total_nights,
    COUNT(DISTINCT normalize_ota_source(b.ota_source)) as active_channels,
    COUNT(DISTINCT pm.id) as active_properties
  INTO v_result
  FROM bookings_mirror b
  JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
  WHERE b.booking_status = 'CONFIRMED'
    AND b.booking_date BETWEEN v_effective_start AND v_effective_end
    AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids));
  
  RETURN json_build_object(
    'success', true,
    'meta', json_build_object(
      'start_date', v_effective_start,
      'end_date', v_effective_end,
      'date_clamped', v_date_range_days > 400
    ),
    'summary', json_build_object(
      'total_bookings', v_result.total_bookings,
      'total_revenue', v_result.total_revenue,
      'avg_booking_value', ROUND(v_result.avg_booking_value::numeric, 2),
      'total_nights', v_result.total_nights,
      'active_channels', v_result.active_channels,
      'active_properties', v_result.active_properties
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_kpi_summary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_kpi_summary TO authenticated;

-- ============================================================
-- RPC: ota_get_channel_comparison
-- Compare performance across OTA channels
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_channel_comparison(
  p_start_date DATE,
  p_end_date DATE,
  p_property_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_date_range_days INT;
  v_effective_start DATE;
  v_effective_end DATE;
BEGIN
  -- Security check
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access KPI data'
    );
  END IF;
  
  -- Date clamping
  v_date_range_days := COALESCE(p_end_date - p_start_date, 0);
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  -- Channel comparison with percentage
  WITH totals AS (
    SELECT 
      COUNT(*) as total_bookings,
      SUM(total_price) as total_revenue
    FROM bookings_mirror b
    JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
    WHERE b.booking_status = 'CONFIRMED'
      AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
  )
  SELECT json_agg(row_to_json(r))
  INTO v_result
  FROM (
    SELECT 
      normalize_ota_source(b.ota_source) as channel,
      COUNT(*) as booking_count,
      ROUND(100.0 * COUNT(*) / NULLIF(t.total_bookings, 0), 2) as booking_share_pct,
      COALESCE(SUM(b.total_price), 0) as revenue,
      ROUND(100.0 * COALESCE(SUM(b.total_price), 0) / NULLIF(t.total_revenue, 0), 2) as revenue_share_pct,
      ROUND(COALESCE(AVG(b.total_price), 0)::numeric, 2) as avg_booking_value,
      ROUND(COALESCE(AVG(b.nights), 0)::numeric, 1) as avg_nights
    FROM bookings_mirror b
    JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
    CROSS JOIN totals t
    WHERE b.booking_status = 'CONFIRMED'
      AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
    GROUP BY normalize_ota_source(b.ota_source), t.total_bookings, t.total_revenue
    ORDER BY booking_count DESC
  ) r;
  
  RETURN json_build_object(
    'success', true,
    'meta', json_build_object(
      'start_date', v_effective_start,
      'end_date', v_effective_end
    ),
    'channels', COALESCE(v_result, '[]'::json)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_channel_comparison FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_channel_comparison TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION public.ota_get_kpi IS 
'Main KPI RPC for OTA performance. Uses SECURITY DEFINER to bypass RLS. Date axis: booking_date. Status: CONFIRMED only. Max range: 400 days.';

COMMENT ON FUNCTION public.ota_get_kpi_summary IS 
'Quick summary stats for OTA dashboard header. Same security model as ota_get_kpi.';

COMMENT ON FUNCTION public.ota_get_channel_comparison IS 
'Channel comparison with market share percentages. Same security model as ota_get_kpi.';
