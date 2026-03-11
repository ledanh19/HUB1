-- Add assigned_to and last_activity_at to ota_disputes
ALTER TABLE public.ota_disputes 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone DEFAULT now();

-- Create dispute_attachments table for evidence files
CREATE TABLE public.dispute_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id uuid NOT NULL REFERENCES public.ota_disputes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'OTHER',
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create ota_deductions table for LOST/PARTIAL results
CREATE TABLE public.ota_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id uuid NOT NULL REFERENCES public.ota_disputes(id),
  unified_booking_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'VND',
  reason text NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id),
  is_reversal boolean NOT NULL DEFAULT false,
  reversal_of uuid REFERENCES public.ota_deductions(id),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dispute_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_deductions ENABLE ROW LEVEL SECURITY;

-- RLS policies for dispute_attachments
CREATE POLICY "Dispute attachments viewable by authenticated" 
ON public.dispute_attachments FOR SELECT 
USING (true);

CREATE POLICY "Dispute attachments insertable by authenticated" 
ON public.dispute_attachments FOR INSERT 
WITH CHECK (true);

-- RLS policies for ota_deductions
CREATE POLICY "OTA deductions viewable by authenticated" 
ON public.ota_deductions FOR SELECT 
USING (true);

CREATE POLICY "OTA deductions insertable by authenticated" 
ON public.ota_deductions FOR INSERT 
WITH CHECK (true);

-- Create trigger to update last_activity_at
CREATE OR REPLACE FUNCTION public.update_dispute_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dispute_activity
BEFORE UPDATE ON public.ota_disputes
FOR EACH ROW
EXECUTE FUNCTION public.update_dispute_last_activity();

-- Create storage bucket for dispute attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('dispute-attachments', 'dispute-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dispute-attachments bucket
CREATE POLICY "Authenticated users can view dispute attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'dispute-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload dispute attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'dispute-attachments' AND auth.role() = 'authenticated');