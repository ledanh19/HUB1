-- ============================================================
-- Disk IO Optimization: Log Table Retention Policies
-- ============================================================
-- Purpose: Reduce Disk IO by archiving old log data
-- Tables: webhook_events (30d), audit_logs (90d), booking_changes (90d)
-- Method: pg_cron scheduled job OR manual delete function
-- ============================================================

-- 1. Create cleanup function for webhook_events (30 days retention)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup action
  INSERT INTO audit_logs (action, entity, details)
  VALUES ('CLEANUP', 'webhook_events', jsonb_build_object(
    'deleted_count', deleted_count,
    'retention_days', 30,
    'executed_at', NOW()
  ));
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create cleanup function for audit_logs (90 days retention)
-- Keeps only recent 90 days of audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND action != 'CLEANUP'; -- Don't delete cleanup records
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup action (self-referential but keeps cleanup history)
  INSERT INTO audit_logs (action, entity, details)
  VALUES ('CLEANUP', 'audit_logs', jsonb_build_object(
    'deleted_count', deleted_count,
    'retention_days', 90,
    'executed_at', NOW()
  ));
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create cleanup function for booking_changes (90 days retention)
CREATE OR REPLACE FUNCTION cleanup_old_booking_changes()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM booking_changes
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup action
  INSERT INTO audit_logs (action, entity, details)
  VALUES ('CLEANUP', 'booking_changes', jsonb_build_object(
    'deleted_count', deleted_count,
    'retention_days', 90,
    'executed_at', NOW()
  ));
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create master cleanup function that runs all cleanups
CREATE OR REPLACE FUNCTION run_all_retention_cleanups()
RETURNS jsonb AS $$
DECLARE
  webhook_deleted INTEGER;
  audit_deleted INTEGER;
  booking_changes_deleted INTEGER;
BEGIN
  -- Run cleanups
  webhook_deleted := cleanup_old_webhook_events();
  audit_deleted := cleanup_old_audit_logs();
  booking_changes_deleted := cleanup_old_booking_changes();
  
  RETURN jsonb_build_object(
    'webhook_events_deleted', webhook_deleted,
    'audit_logs_deleted', audit_deleted,
    'booking_changes_deleted', booking_changes_deleted,
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create indexes for efficient cleanup (if not exist)
-- Index on created_at for fast date-based deletes
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at 
  ON webhook_events(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_booking_changes_created_at 
  ON booking_changes(created_at);

-- ============================================================
-- USAGE INSTRUCTIONS:
-- ============================================================
-- Option A: Manual execution (recommended for small teams)
--   SELECT run_all_retention_cleanups();
--   Run weekly via: Supabase Dashboard > SQL Editor > Save as snippet
--
-- Option B: pg_cron (requires pg_cron extension enabled)
--   Enable pg_cron in Supabase Dashboard > Database > Extensions
--   Then run:
--   SELECT cron.schedule(
--     'weekly-retention-cleanup',
--     '0 3 * * 0',  -- Every Sunday at 3 AM UTC
--     'SELECT run_all_retention_cleanups();'
--   );
--
-- Option C: Edge Function cron
--   Create edge function that calls run_all_retention_cleanups()
--   Schedule via Supabase Dashboard > Edge Functions > Schedules
-- ============================================================

-- Grant execute permission to service role only
GRANT EXECUTE ON FUNCTION cleanup_old_webhook_events() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_booking_changes() TO service_role;
GRANT EXECUTE ON FUNCTION run_all_retention_cleanups() TO service_role;

COMMENT ON FUNCTION run_all_retention_cleanups() IS 
  'Master cleanup function for log tables. Run weekly to maintain disk IO performance.
   Retention: webhook_events=30d, audit_logs=90d, booking_changes=90d';
