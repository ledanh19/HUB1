-- ============================================================
-- OTA OPERATIONS MODULE - PART 3: ALL RPCs
-- ============================================================

-- ============================================================
-- RPC: ota_create_task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_create_task(
  p_project_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'MEDIUM',
  p_due_date DATE DEFAULT NULL,
  p_estimated_hours NUMERIC DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can create tasks');
  END IF;
  
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM ota_project_members WHERE project_id = p_project_id AND user_id = p_assignee_id AND is_active = true) THEN
      RETURN json_build_object('success', false, 'error', 'INVALID_ASSIGNEE', 'message', 'Assignee is not an active member of this project');
    END IF;
  END IF;
  
  INSERT INTO ota_tasks (project_id, title, description, assignee_id, assigned_at, assigned_by, priority, due_date, estimated_hours, tags, created_by, updated_by)
  VALUES (p_project_id, p_title, p_description, p_assignee_id,
    CASE WHEN p_assignee_id IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_assignee_id IS NOT NULL THEN v_user_id ELSE NULL END,
    p_priority::ota_task_priority, p_due_date, p_estimated_hours, p_tags, v_user_id, v_user_id)
  RETURNING id INTO v_task_id;
  
  RETURN json_build_object('success', true, 'task_id', v_task_id, 'message', 'Task created successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_create_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_create_task TO authenticated;

-- ============================================================
-- RPC: ota_update_task_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_update_task_status(
  p_task_id UUID,
  p_new_status TEXT,
  p_actual_hours NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
  v_project_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can update tasks');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  v_project_role := get_ota_project_role(v_task.project_id);
  
  IF v_project_role = 'STAFF' AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'NOT_ASSIGNEE', 'message', 'Staff can only update their own assigned tasks');
  END IF;
  
  IF v_task.status = 'CANCELLED' THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Cannot change status of cancelled task');
  END IF;
  
  UPDATE ota_tasks SET status = p_new_status::ota_task_status, actual_hours = COALESCE(p_actual_hours, actual_hours) WHERE id = p_task_id;
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'old_status', v_task.status, 'new_status', p_new_status, 'message', 'Task status updated successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_update_task_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_task_status TO authenticated;

-- ============================================================
-- RPC: ota_assign_task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_assign_task(p_task_id UUID, p_assignee_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead or Admin can assign tasks');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM ota_project_members WHERE project_id = v_task.project_id AND user_id = p_assignee_id AND is_active = true) THEN
      RETURN json_build_object('success', false, 'error', 'INVALID_ASSIGNEE', 'message', 'Assignee is not an active member of this project');
    END IF;
  END IF;
  
  UPDATE ota_tasks SET assignee_id = p_assignee_id,
    assigned_at = CASE WHEN p_assignee_id IS NOT NULL THEN now() ELSE NULL END,
    assigned_by = CASE WHEN p_assignee_id IS NOT NULL THEN v_user_id ELSE NULL END
  WHERE id = p_task_id;
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'assignee_id', p_assignee_id, 'message', 'Task assigned successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_assign_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_assign_task TO authenticated;

-- ============================================================
-- RPC: ota_get_my_tasks
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_my_tasks(p_status TEXT DEFAULT NULL, p_project_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access tasks');
  END IF;
  
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.started_at, t.completed_at,
      t.estimated_hours, t.actual_hours, t.tags, t.created_at, p.id as project_id, p.name as project_name, pm.name as property_name
    FROM ota_tasks t
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    WHERE t.assignee_id = v_user_id AND has_ota_project_access(t.project_id)
    AND (p_status IS NULL OR t.status = p_status::ota_task_status)
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END, t.due_date NULLS LAST, t.created_at DESC
  ) t;
  
  RETURN json_build_object('success', true, 'tasks', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_my_tasks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_my_tasks TO authenticated;

-- ============================================================
-- RPC: ota_submit_evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_submit_evidence(
  p_task_id UUID, p_evidence_type TEXT, p_file_url TEXT DEFAULT NULL, p_file_name TEXT DEFAULT NULL,
  p_file_size_bytes BIGINT DEFAULT NULL, p_mime_type TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence_id UUID;
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can submit evidence');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  IF p_evidence_type = 'NOTE' AND p_file_url IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_EVIDENCE', 'message', 'NOTE type evidence should not have file_url');
  END IF;
  
  IF p_evidence_type != 'NOTE' AND p_file_url IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_EVIDENCE', 'message', 'File evidence must have file_url');
  END IF;
  
  INSERT INTO ota_task_evidence (task_id, evidence_type, file_url, file_name, file_size_bytes, mime_type, description, created_by)
  VALUES (p_task_id, p_evidence_type::ota_evidence_type, p_file_url, p_file_name, p_file_size_bytes, p_mime_type, p_description, v_user_id)
  RETURNING id INTO v_evidence_id;
  
  RETURN json_build_object('success', true, 'evidence_id', v_evidence_id, 'message', 'Evidence submitted successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_submit_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_submit_evidence TO authenticated;

-- ============================================================
-- RPC: ota_review_evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_review_evidence(p_evidence_id UUID, p_review_status TEXT, p_review_notes TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence RECORD;
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead or Admin can review evidence');
  END IF;
  
  SELECT * INTO v_evidence FROM ota_task_evidence WHERE id = p_evidence_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'EVIDENCE_NOT_FOUND', 'message', 'Evidence does not exist');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = v_evidence.task_id;
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  IF p_review_status NOT IN ('APPROVED', 'REJECTED', 'NEEDS_REVISION') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Review status must be APPROVED, REJECTED, or NEEDS_REVISION');
  END IF;
  
  IF v_evidence.created_by = v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'SELF_REVIEW', 'message', 'Cannot review your own evidence');
  END IF;
  
  UPDATE ota_task_evidence SET review_status = p_review_status::ota_evidence_review_status, reviewed_at = now(), reviewed_by = v_user_id, review_notes = p_review_notes WHERE id = p_evidence_id;
  
  RETURN json_build_object('success', true, 'evidence_id', p_evidence_id, 'old_status', v_evidence.review_status, 'new_status', p_review_status, 'message', 'Evidence reviewed successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_review_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_review_evidence TO authenticated;

-- ============================================================
-- RPC: ota_get_task_evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_evidence(p_task_id UUID, p_review_status TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_result JSON;
BEGIN
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can view evidence');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  SELECT json_agg(row_to_json(e)) INTO v_result FROM (
    SELECT e.id, e.evidence_type, e.file_url, e.file_name, e.file_size_bytes, e.mime_type, e.description,
      e.review_status, e.reviewed_at, e.review_notes, e.created_at
    FROM ota_task_evidence e
    WHERE e.task_id = p_task_id
    AND (p_review_status IS NULL OR e.review_status = p_review_status::ota_evidence_review_status)
    ORDER BY e.created_at DESC
  ) e;
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'evidence', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_evidence TO authenticated;

-- ============================================================
-- RPC: ota_get_pending_reviews
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_pending_reviews(p_project_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead or Admin can view pending reviews');
  END IF;
  
  SELECT json_agg(row_to_json(e)) INTO v_result FROM (
    SELECT e.id as evidence_id, e.evidence_type, e.file_url, e.file_name, e.description, e.created_at,
      t.id as task_id, t.title as task_title, p.id as project_id, p.name as project_name, pm.name as property_name
    FROM ota_task_evidence e
    JOIN ota_tasks t ON t.id = e.task_id
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    WHERE e.review_status = 'PENDING' AND has_ota_project_access(p.id)
    AND (p_project_id IS NULL OR p.id = p_project_id)
    ORDER BY e.created_at ASC
  ) e;
  
  RETURN json_build_object('success', true, 'pending_reviews', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_pending_reviews FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_pending_reviews TO authenticated;

-- ============================================================
-- RPC: ota_get_kpi
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_kpi(
  p_start_date DATE, p_end_date DATE, p_property_ids UUID[] DEFAULT NULL, p_group_by TEXT DEFAULT 'channel'
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
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access KPI data');
  END IF;
  
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_DATES', 'message', 'Start date and end date are required');
  END IF;
  
  IF p_start_date > p_end_date THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_DATE_RANGE', 'message', 'Start date must be before end date');
  END IF;
  
  v_date_range_days := p_end_date - p_start_date;
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  IF p_group_by = 'channel' THEN
    SELECT json_agg(row_to_json(r)) INTO v_result FROM (
      SELECT normalize_ota_source(b.ota_source) as channel, COUNT(*) as booking_count, COALESCE(SUM(b.total_amount_net), 0) as total_revenue,
        COALESCE(AVG(b.total_amount_net), 0) as avg_booking_value, COALESCE(SUM(b.nights), 0) as total_nights,
        MIN(b.booking_date) as first_booking, MAX(b.booking_date) as last_booking
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY normalize_ota_source(b.ota_source) ORDER BY booking_count DESC
    ) r;
  ELSIF p_group_by = 'property' THEN
    SELECT json_agg(row_to_json(r)) INTO v_result FROM (
      SELECT pm.id as property_id, pm.name as property_name, COUNT(*) as booking_count, COALESCE(SUM(b.total_amount_net), 0) as total_revenue,
        COALESCE(AVG(b.total_amount_net), 0) as avg_booking_value, COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY pm.id, pm.name ORDER BY booking_count DESC
    ) r;
  ELSIF p_group_by = 'daily' THEN
    SELECT json_agg(row_to_json(r)) INTO v_result FROM (
      SELECT b.booking_date as date, COUNT(*) as booking_count, COALESCE(SUM(b.total_amount_net), 0) as total_revenue, COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY b.booking_date ORDER BY b.booking_date
    ) r;
  ELSIF p_group_by = 'monthly' THEN
    SELECT json_agg(row_to_json(r)) INTO v_result FROM (
      SELECT DATE_TRUNC('month', b.booking_date)::DATE as month, COUNT(*) as booking_count, COALESCE(SUM(b.total_amount_net), 0) as total_revenue,
        COALESCE(AVG(b.total_amount_net), 0) as avg_booking_value, COALESCE(SUM(b.nights), 0) as total_nights
      FROM bookings_mirror b
      JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
      WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
      AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
      GROUP BY DATE_TRUNC('month', b.booking_date) ORDER BY month
    ) r;
  ELSE
    RETURN json_build_object('success', false, 'error', 'INVALID_GROUP_BY', 'message', 'group_by must be: channel, property, daily, or monthly');
  END IF;
  
  RETURN json_build_object('success', true, 'meta', json_build_object('start_date', v_effective_start, 'end_date', v_effective_end, 'requested_start', p_start_date, 'requested_end', p_end_date, 'date_clamped', v_date_range_days > 400, 'group_by', p_group_by, 'property_filter', p_property_ids), 'data', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_kpi FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_kpi TO authenticated;

-- ============================================================
-- RPC: ota_get_kpi_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_kpi_summary(p_start_date DATE, p_end_date DATE, p_property_ids UUID[] DEFAULT NULL)
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
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access KPI data');
  END IF;
  
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_DATES', 'message', 'Start date and end date are required');
  END IF;
  
  v_date_range_days := p_end_date - p_start_date;
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  SELECT COUNT(*) as total_bookings, COALESCE(SUM(b.total_amount_net), 0) as total_revenue, COALESCE(AVG(b.total_amount_net), 0) as avg_booking_value,
    COALESCE(SUM(b.nights), 0) as total_nights, COUNT(DISTINCT normalize_ota_source(b.ota_source)) as active_channels, COUNT(DISTINCT pm.id) as active_properties
  INTO v_result
  FROM bookings_mirror b
  JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
  WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
  AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids));
  
  RETURN json_build_object('success', true, 'meta', json_build_object('start_date', v_effective_start, 'end_date', v_effective_end, 'date_clamped', v_date_range_days > 400), 
    'summary', json_build_object('total_bookings', v_result.total_bookings, 'total_revenue', v_result.total_revenue, 'avg_booking_value', ROUND(v_result.avg_booking_value::numeric, 2), 'total_nights', v_result.total_nights, 'active_channels', v_result.active_channels, 'active_properties', v_result.active_properties));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_kpi_summary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_kpi_summary TO authenticated;

-- ============================================================
-- RPC: ota_get_channel_comparison
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_channel_comparison(p_start_date DATE, p_end_date DATE, p_property_ids UUID[] DEFAULT NULL)
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
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access KPI data');
  END IF;
  
  v_date_range_days := COALESCE(p_end_date - p_start_date, 0);
  IF v_date_range_days > 400 THEN
    v_effective_start := p_end_date - INTERVAL '400 days';
    v_effective_end := p_end_date;
  ELSE
    v_effective_start := p_start_date;
    v_effective_end := p_end_date;
  END IF;
  
  WITH totals AS (
    SELECT COUNT(*) as total_bookings, SUM(total_amount_net) as total_revenue
    FROM bookings_mirror b
    JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
    WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
    AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
  )
  SELECT json_agg(row_to_json(r)) INTO v_result FROM (
    SELECT normalize_ota_source(b.ota_source) as channel, COUNT(*) as booking_count,
      ROUND(100.0 * COUNT(*) / NULLIF(t.total_bookings, 0), 2) as booking_share_pct,
      COALESCE(SUM(b.total_amount_net), 0) as revenue,
      ROUND(100.0 * COALESCE(SUM(b.total_amount_net), 0) / NULLIF(t.total_revenue, 0), 2) as revenue_share_pct,
      ROUND(COALESCE(AVG(b.total_amount_net), 0)::numeric, 2) as avg_booking_value,
      ROUND(COALESCE(AVG(b.nights), 0)::numeric, 1) as avg_nights
    FROM bookings_mirror b
    JOIN properties_mirror pm ON pm.channex_property_id = b.channex_property_id
    CROSS JOIN totals t
    WHERE b.booking_status = 'CONFIRMED' AND b.booking_date BETWEEN v_effective_start AND v_effective_end
    AND (p_property_ids IS NULL OR pm.id = ANY(p_property_ids))
    GROUP BY normalize_ota_source(b.ota_source), t.total_bookings, t.total_revenue
    ORDER BY booking_count DESC
  ) r;
  
  RETURN json_build_object('success', true, 'meta', json_build_object('start_date', v_effective_start, 'end_date', v_effective_end), 'channels', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_channel_comparison FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_channel_comparison TO authenticated;

-- ============================================================
-- RPC: assign_ota_role & remove_ota_role & ota_list_team_members
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_ota_role(p_user_id UUID, p_role TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_assigner_id UUID;
BEGIN
  v_assigner_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_assigner_id AND role = 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only admin can assign OTA roles');
  END IF;
  IF p_role NOT IN ('ota_staff', 'ota_lead') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_ROLE', 'message', 'Role must be ota_staff or ota_lead');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'User does not exist');
  END IF;
  INSERT INTO user_roles (user_id, role) VALUES (p_user_id, p_role::app_role) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN json_build_object('success', true, 'user_id', p_user_id, 'role', p_role, 'message', 'OTA role assigned successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_ota_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_ota_role TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_ota_role(p_user_id UUID, p_role TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_assigner_id UUID;
BEGIN
  v_assigner_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_assigner_id AND role = 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only admin can remove OTA roles');
  END IF;
  IF p_role NOT IN ('ota_staff', 'ota_lead') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_ROLE', 'message', 'Role must be ota_staff or ota_lead');
  END IF;
  DELETE FROM user_roles WHERE user_id = p_user_id AND role = p_role::app_role;
  UPDATE ota_project_members SET is_active = false, deactivated_at = now(), deactivated_by = v_assigner_id WHERE user_id = p_user_id AND is_active = true;
  RETURN json_build_object('success', true, 'user_id', p_user_id, 'role', p_role, 'message', 'OTA role removed and user deactivated from all projects');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_ota_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_ota_role TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_list_team_members()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead or Admin can list team members');
  END IF;
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT u.id as user_id, u.email, ur.role, ur.created_at as role_assigned_at,
      (SELECT COUNT(*) FROM ota_project_members pm WHERE pm.user_id = u.id AND pm.is_active = true) as active_projects,
      (SELECT COUNT(*) FROM ota_tasks t WHERE t.assignee_id = u.id AND t.status NOT IN ('DONE', 'CANCELLED')) as active_tasks
    FROM auth.users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role IN ('ota_staff', 'ota_lead')
    ORDER BY ur.role DESC, u.email
  ) t;
  RETURN json_build_object('success', true, 'team_members', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_list_team_members FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_list_team_members TO authenticated;

-- ============================================================
-- INDEXES FOR KPI PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_kpi_ota ON public.bookings_mirror (channex_property_id, booking_status, booking_date) WHERE booking_status = 'CONFIRMED';
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_ota_source ON public.bookings_mirror (ota_source) WHERE booking_status = 'CONFIRMED';