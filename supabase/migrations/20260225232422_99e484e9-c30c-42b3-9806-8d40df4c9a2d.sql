
-- Create trigger function using anon key (verify_jwt=false on target function)
CREATE OR REPLACE FUNCTION public.notify_webhook_event_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0ZnBqcWtodGpiYWxhb2R5bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NjE1NDAsImV4cCI6MjA4MTIzNzU0MH0.YbGXFXyzfWtRN_Q3YmGU1tG4uwK_94dUnFnsAb1EG9g';
BEGIN
  IF NEW.status = 'PENDING' AND NEW.is_valid = true THEN
    -- Get URL from vault
    SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    IF _supabase_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/process-webhook-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _anon_key,
          'apikey', _anon_key
        ),
        body := jsonb_build_object('event_id', NEW.id::text),
        timeout_milliseconds := 5000
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_webhook_event_pending ON public.webhook_events;
CREATE TRIGGER trg_webhook_event_pending
  AFTER INSERT ON public.webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_webhook_event_pending();

-- pg_cron fallback every 2 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('process-pending-webhooks');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'process-pending-webhooks',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/process-webhook-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0ZnBqcWtodGpiYWxhb2R5bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NjE1NDAsImV4cCI6MjA4MTIzNzU0MH0.YbGXFXyzfWtRN_Q3YmGU1tG4uwK_94dUnFnsAb1EG9g',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0ZnBqcWtodGpiYWxhb2R5bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NjE1NDAsImV4cCI6MjA4MTIzNzU0MH0.YbGXFXyzfWtRN_Q3YmGU1tG4uwK_94dUnFnsAb1EG9g'
    ),
    body := '{"batch_size": 50}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
