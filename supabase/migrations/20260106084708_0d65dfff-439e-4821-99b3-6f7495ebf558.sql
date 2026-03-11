-- =============================================
-- Disk IO Optimization: Log Retention Functions
-- =============================================
-- Purpose: Prevent unbounded storage growth by implementing
-- retention policies for high-volume log tables.
-- 
-- Tables affected:
-- - webhook_events: 30 day retention
-- - audit_logs: 90 day retention
-- - booking_changes: 90 day retention
-- =============================================

-- Function: Cleanup old webhook events (30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % webhook_events older than 30 days', deleted_count;
  RETURN deleted_count;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table webhook_events does not exist, skipping';
    RETURN 0;
END;
$$;

-- Function: Cleanup old audit logs (90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_logs
  WHERE event_time < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % audit_logs older than 90 days', deleted_count;
  RETURN deleted_count;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table audit_logs does not exist, skipping';
    RETURN 0;
END;
$$;

-- Function: Cleanup old booking changes (90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_booking_changes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.booking_changes
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % booking_changes older than 90 days', deleted_count;
  RETURN deleted_count;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table booking_changes does not exist, skipping';
    RETURN 0;
END;
$$;

-- Master function: Run all retention cleanups
CREATE OR REPLACE FUNCTION public.run_all_retention_cleanups()
RETURNS TABLE(
  table_name TEXT,
  deleted_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_deleted INTEGER;
  audit_deleted INTEGER;
  booking_changes_deleted INTEGER;
BEGIN
  -- Run all cleanup functions
  webhook_deleted := public.cleanup_old_webhook_events();
  audit_deleted := public.cleanup_old_audit_logs();
  booking_changes_deleted := public.cleanup_old_booking_changes();
  
  -- Return results
  RETURN QUERY
  SELECT 'webhook_events'::TEXT, webhook_deleted
  UNION ALL
  SELECT 'audit_logs'::TEXT, audit_deleted
  UNION ALL
  SELECT 'booking_changes'::TEXT, booking_changes_deleted;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_booking_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_all_retention_cleanups() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.run_all_retention_cleanups() IS 
'Master cleanup function for log retention. Run weekly via: SELECT * FROM run_all_retention_cleanups();';