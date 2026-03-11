-- Create booking_changes table to track sync history from Channex
CREATE TABLE public.booking_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL,
  pms_booking_id TEXT,
  change_source TEXT NOT NULL DEFAULT 'CHANNEX_SYNC', -- CHANNEX_SYNC, CHANNEX_WEBHOOK, MANUAL
  change_type TEXT NOT NULL, -- INSERT, UPDATE, STATUS_CHANGE, DATES_CHANGE, AMOUNT_CHANGE
  changed_fields JSONB, -- Array of field names that changed
  before_data JSONB, -- Previous values
  after_data JSONB, -- New values
  source_updated_at TIMESTAMPTZ, -- Channex's updated_at timestamp
  sync_run_id UUID REFERENCES public.sync_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_booking_changes_unified_booking_id ON public.booking_changes(unified_booking_id);
CREATE INDEX idx_booking_changes_created_at ON public.booking_changes(created_at DESC);

-- Enable RLS
ALTER TABLE public.booking_changes ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read
CREATE POLICY "Authenticated users can read booking_changes"
ON public.booking_changes
FOR SELECT
TO authenticated
USING (true);

-- Enable realtime for booking_changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_changes;

-- Add comment explaining the table
COMMENT ON TABLE public.booking_changes IS 'Tracks all changes to bookings from Channex sync, webhooks, or manual edits for audit/history purposes';