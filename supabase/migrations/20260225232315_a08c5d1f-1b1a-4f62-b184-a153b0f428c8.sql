
-- Enable realtime for key tables (drop first to be idempotent)
DO $$
BEGIN
  -- bookings_mirror
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings_mirror;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- booking_changes
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_changes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- conversations
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- messages
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- webhook_events
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
