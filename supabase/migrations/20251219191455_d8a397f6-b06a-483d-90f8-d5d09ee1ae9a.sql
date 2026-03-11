-- Fix: Create functions with proper column references
-- Function to acquire edit lock
CREATE OR REPLACE FUNCTION acquire_inventory_lock(
  p_property_id UUID,
  p_cell_key TEXT,
  p_user_id UUID,
  p_duration_minutes INTEGER DEFAULT 5
)
RETURNS TABLE(success BOOLEAN, locked_by UUID, locked_at TIMESTAMPTZ, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  -- Clean expired locks first
  DELETE FROM inventory_edit_locks el WHERE el.expires_at < now();

  -- Check for existing lock
  SELECT el.* INTO v_existing 
  FROM inventory_edit_locks el
  WHERE el.property_id = p_property_id 
    AND el.cell_key = p_cell_key;

  IF v_existing IS NOT NULL THEN
    IF v_existing.locked_by = p_user_id THEN
      -- Extend own lock
      UPDATE inventory_edit_locks el
      SET expires_at = now() + (p_duration_minutes || ' minutes')::INTERVAL
      WHERE el.id = v_existing.id;
      RETURN QUERY SELECT true, p_user_id, v_existing.locked_at, 'Lock extended'::TEXT;
    ELSE
      -- Someone else has lock
      RETURN QUERY SELECT false, v_existing.locked_by, v_existing.locked_at, 
        ('Locked by another user since ' || v_existing.locked_at::TEXT)::TEXT;
    END IF;
  ELSE
    -- Create new lock
    INSERT INTO inventory_edit_locks (property_id, cell_key, locked_by, expires_at)
    VALUES (p_property_id, p_cell_key, p_user_id, now() + (p_duration_minutes || ' minutes')::INTERVAL);
    RETURN QUERY SELECT true, p_user_id, now(), 'Lock acquired'::TEXT;
  END IF;
END;
$$;

-- Function to release lock
CREATE OR REPLACE FUNCTION release_inventory_lock(
  p_property_id UUID,
  p_cell_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM inventory_edit_locks el
  WHERE el.property_id = p_property_id 
    AND el.cell_key = p_cell_key 
    AND el.locked_by = p_user_id;
  RETURN FOUND;
END;
$$;

-- Function to check alerts
CREATE OR REPLACE FUNCTION check_inventory_alerts(p_property_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics RECORD;
  v_fail_rate NUMERIC;
  v_threshold RECORD;
BEGIN
  -- Get latest metrics
  SELECT m.* INTO v_metrics 
  FROM inventory_sync_metrics m
  WHERE m.property_id = p_property_id 
  ORDER BY m.metric_date DESC 
  LIMIT 1;

  IF v_metrics IS NULL THEN RETURN; END IF;

  -- Check fail rate
  IF v_metrics.total_syncs > 0 THEN
    v_fail_rate := (v_metrics.failed_syncs::NUMERIC / v_metrics.total_syncs) * 100;
    
    SELECT ac.* INTO v_threshold 
    FROM inventory_alert_config ac
    WHERE ac.alert_type = 'sync_fail_rate' 
      AND ac.is_active = true 
      AND (ac.property_id IS NULL OR ac.property_id = p_property_id);

    IF v_threshold IS NOT NULL AND v_fail_rate > v_threshold.threshold_value THEN
      INSERT INTO inventory_alerts (property_id, alert_type, severity, message, details)
      VALUES (
        p_property_id,
        'sync_fail_rate',
        CASE WHEN v_fail_rate > 25 THEN 'critical' ELSE 'warning' END,
        'Sync fail rate is ' || round(v_fail_rate, 1) || '%',
        jsonb_build_object('fail_rate', v_fail_rate, 'total', v_metrics.total_syncs, 'failed', v_metrics.failed_syncs)
      );
    END IF;
  END IF;
END;
$$;