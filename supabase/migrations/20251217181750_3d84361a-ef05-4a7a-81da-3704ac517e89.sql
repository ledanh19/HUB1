-- Create booking_warnings table for persistent warning storage
CREATE TABLE IF NOT EXISTS public.booking_warnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id text NOT NULL,
  pms_booking_id text,
  warning_type text NOT NULL,
  warning_code text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'WARNING',
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sync_run_id uuid,
  metadata jsonb
);

-- Enable RLS
ALTER TABLE public.booking_warnings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Booking warnings viewable by authenticated" ON public.booking_warnings
  FOR SELECT USING (true);

CREATE POLICY "Booking warnings insertable by authenticated" ON public.booking_warnings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Booking warnings updatable by authenticated" ON public.booking_warnings
  FOR UPDATE USING (true);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_booking_warnings_unified_booking_id ON public.booking_warnings(unified_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_warnings_pms_booking_id ON public.booking_warnings(pms_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_warnings_warning_code ON public.booking_warnings(warning_code);
CREATE INDEX IF NOT EXISTS idx_booking_warnings_is_resolved ON public.booking_warnings(is_resolved);

-- Comment for documentation
COMMENT ON TABLE public.booking_warnings IS 'Persistent storage for OTA sync warnings - SOURCE OF TRUTH v1.0 compliant';
COMMENT ON COLUMN public.booking_warnings.warning_code IS 'Standard codes: HOTEL_COLLECT_NET_ESTIMATED_FROM_OTA, OTA_COLLECT_NO_REMITTANCE, FINANCE_DATA_MISSING, FINANCE_ANOMALY, MULTI_ROOM, GUEST_NAME_MISSING, PAYMENT_TYPE_UNKNOWN, SUM_MISMATCH, INITIAL_IMPORT';