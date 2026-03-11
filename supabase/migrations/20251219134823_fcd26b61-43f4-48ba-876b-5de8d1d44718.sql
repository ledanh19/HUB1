
-- Create enum for confidence level
CREATE TYPE public.confidence_level AS ENUM ('LOW', 'MED', 'HIGH');

-- Create enum for guest source type
CREATE TYPE public.guest_source_type AS ENUM ('OTA', 'MANUAL', 'CRM');

-- Create enum for match method
CREATE TYPE public.match_method AS ENUM ('SOURCE_KEY', 'EMAIL', 'REAL_PHONE', 'MANUAL', 'CREATED_NEW');

-- Create enum for guest role in booking
CREATE TYPE public.guest_role AS ENUM ('PRIMARY', 'SECONDARY');

-- =============================================
-- TABLE: guests (canonical guest records)
-- =============================================
CREATE TABLE public.guests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  primary_email TEXT,
  primary_phone TEXT,
  nationality TEXT DEFAULT 'Vietnam',
  confidence_level public.confidence_level NOT NULL DEFAULT 'LOW',
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID REFERENCES public.test_scenarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for matching
CREATE INDEX idx_guests_email ON public.guests(primary_email) WHERE primary_email IS NOT NULL;
CREATE INDEX idx_guests_phone ON public.guests(primary_phone) WHERE primary_phone IS NOT NULL;
CREATE INDEX idx_guests_name ON public.guests(full_name);

-- Enable RLS
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Guests viewable by authenticated" ON public.guests
  FOR SELECT USING (true);

CREATE POLICY "Guests insertable by authenticated" ON public.guests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Guests updatable by authenticated" ON public.guests
  FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_guests_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TABLE: guest_identities (identity per source)
-- =============================================
CREATE TABLE public.guest_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  source_type public.guest_source_type NOT NULL,
  source_name TEXT NOT NULL, -- AGODA, BOOKING, EXPEDIA, WALKIN, etc.
  source_guest_key TEXT, -- OTA's guest ID if available
  email_raw TEXT,
  email_norm TEXT, -- normalized: lowercase, trim
  phone_raw TEXT,
  phone_norm TEXT, -- normalized phone
  phone_is_proxy BOOLEAN NOT NULL DEFAULT false,
  name_raw TEXT,
  name_norm TEXT, -- normalized: unaccent, lowercase, trim
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID REFERENCES public.test_scenarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for matching
CREATE INDEX idx_guest_identities_guest ON public.guest_identities(guest_id);
CREATE INDEX idx_guest_identities_source_key ON public.guest_identities(source_name, source_guest_key) 
  WHERE source_guest_key IS NOT NULL;
CREATE INDEX idx_guest_identities_email ON public.guest_identities(email_norm) WHERE email_norm IS NOT NULL;
CREATE INDEX idx_guest_identities_phone ON public.guest_identities(phone_norm) 
  WHERE phone_norm IS NOT NULL AND phone_is_proxy = false;

-- Enable RLS
ALTER TABLE public.guest_identities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Guest identities viewable by authenticated" ON public.guest_identities
  FOR SELECT USING (true);

CREATE POLICY "Guest identities insertable by authenticated" ON public.guest_identities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Guest identities updatable by authenticated" ON public.guest_identities
  FOR UPDATE USING (true);

-- =============================================
-- TABLE: booking_guest_links (link bookings to guests)
-- =============================================
CREATE TABLE public.booking_guest_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL,
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  role public.guest_role NOT NULL DEFAULT 'PRIMARY',
  match_method public.match_method NOT NULL,
  confidence public.confidence_level NOT NULL DEFAULT 'LOW',
  matched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  matched_by UUID, -- user who manually matched, if applicable
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID REFERENCES public.test_scenarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Ensure one primary guest per booking
  CONSTRAINT unique_primary_guest_per_booking UNIQUE (unified_booking_id, role)
);

-- Indexes
CREATE INDEX idx_booking_guest_links_booking ON public.booking_guest_links(unified_booking_id);
CREATE INDEX idx_booking_guest_links_guest ON public.booking_guest_links(guest_id);

-- Enable RLS
ALTER TABLE public.booking_guest_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Booking guest links viewable by authenticated" ON public.booking_guest_links
  FOR SELECT USING (true);

CREATE POLICY "Booking guest links insertable by authenticated" ON public.booking_guest_links
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Booking guest links updatable by authenticated" ON public.booking_guest_links
  FOR UPDATE USING (true);

CREATE POLICY "Booking guest links deletable by admin" ON public.booking_guest_links
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- TABLE: guest_merge_suggestions (for suggested merges)
-- =============================================
CREATE TABLE public.guest_merge_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  target_guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  suggestion_reason TEXT NOT NULL,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT different_guests CHECK (source_guest_id != target_guest_id)
);

-- Enable RLS
ALTER TABLE public.guest_merge_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merge suggestions viewable by authenticated" ON public.guest_merge_suggestions
  FOR SELECT USING (true);

CREATE POLICY "Merge suggestions insertable by authenticated" ON public.guest_merge_suggestions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Merge suggestions updatable by admin" ON public.guest_merge_suggestions
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- TABLE: guest_merge_history (audit trail for merges)
-- =============================================
CREATE TABLE public.guest_merge_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merged_from_guest_id UUID NOT NULL,
  merged_to_guest_id UUID NOT NULL REFERENCES public.guests(id),
  merged_guest_data JSONB NOT NULL, -- snapshot of merged guest before deletion
  merge_reason TEXT,
  merged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  merged_by UUID,
  is_rollback_available BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.guest_merge_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merge history viewable by authenticated" ON public.guest_merge_history
  FOR SELECT USING (true);

CREATE POLICY "Merge history insertable by admin" ON public.guest_merge_history
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
