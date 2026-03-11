-- Ensure bookings_mirror supports ON CONFLICT (provider, provider_booking_id)
-- The existing partial unique index (WHERE provider_booking_id IS NOT NULL) cannot be used by ON CONFLICT column inference.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'bookings_mirror'
      AND indexname = 'bookings_mirror_provider_booking_uq'
  ) THEN
    CREATE UNIQUE INDEX bookings_mirror_provider_booking_uq
      ON public.bookings_mirror (provider, provider_booking_id);
  END IF;
END $$;
