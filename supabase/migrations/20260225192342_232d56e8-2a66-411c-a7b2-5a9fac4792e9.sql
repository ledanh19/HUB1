-- Cleanup stuck sync_runs (timed out edge functions)
UPDATE sync_runs 
SET status = 'FAILED', 
    ended_at = now(), 
    error = 'Edge function timeout - cleaned up'
WHERE status = 'RUNNING' 
  AND started_at < now() - interval '10 minutes';