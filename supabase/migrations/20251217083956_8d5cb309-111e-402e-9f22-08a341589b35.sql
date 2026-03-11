-- Create booking_amount_overrides table for confirmed prices
-- This is the single source of truth for "Giá phải thu"
CREATE TABLE public.booking_amount_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL UNIQUE,
  amount NUMERIC NOT NULL,
  note TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup by booking
CREATE INDEX idx_booking_amount_overrides_booking ON public.booking_amount_overrides(unified_booking_id);

-- Enable RLS
ALTER TABLE public.booking_amount_overrides ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Booking amount overrides viewable by authenticated"
ON public.booking_amount_overrides
FOR SELECT
USING (true);

CREATE POLICY "Booking amount overrides insertable by authenticated"
ON public.booking_amount_overrides
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Booking amount overrides updatable by authenticated"
ON public.booking_amount_overrides
FOR UPDATE
USING (true);

-- Add comment for documentation
COMMENT ON TABLE public.booking_amount_overrides IS 'Single source of truth for confirmed booking prices (Giá phải thu). Override values take precedence over OTA amounts.';