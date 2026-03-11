-- Enable realtime for stays table
ALTER PUBLICATION supabase_realtime ADD TABLE public.stays;

-- Enable realtime for manual_bookings table (if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'manual_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_bookings;
  END IF;
END $$;

-- Enable realtime for guest_documents table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'guest_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_documents;
  END IF;
END $$;

-- Enable realtime for host_supply_segments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'host_supply_segments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.host_supply_segments;
  END IF;
END $$;