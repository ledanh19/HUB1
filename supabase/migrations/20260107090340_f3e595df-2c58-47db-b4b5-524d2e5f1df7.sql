-- Enable realtime for audit_logs table
-- This allows responsible owner assignments to sync across browsers in real-time

-- Add audit_logs to realtime publication (if not already added)
DO $$
BEGIN
  -- Check if table is already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    RAISE NOTICE 'Added audit_logs to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'audit_logs already in supabase_realtime publication';
  END IF;
END $$;

-- Add index for efficient entity_id + action queries (used by responsible owner)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action 
ON public.audit_logs(entity_id, action, event_time DESC);

-- Add index for efficient entity_id queries with desc order
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time_desc
ON public.audit_logs(entity_id, event_time DESC);

COMMENT ON TABLE public.audit_logs IS 
'Audit log for all user actions. Realtime enabled for responsible owner sync.';