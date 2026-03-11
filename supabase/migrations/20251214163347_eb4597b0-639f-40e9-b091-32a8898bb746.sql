-- Create refund_threshold_config table for approval workflow
CREATE TABLE IF NOT EXISTS public.refund_thresholds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold_amount numeric NOT NULL DEFAULT 1000000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.refund_thresholds ENABLE ROW LEVEL SECURITY;

-- Policies for refund_thresholds (admin only for write, all authenticated can read)
CREATE POLICY "Refund thresholds viewable by authenticated"
ON public.refund_thresholds FOR SELECT
USING (true);

CREATE POLICY "Refund thresholds insertable by admin"
ON public.refund_thresholds FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Refund thresholds updatable by admin"
ON public.refund_thresholds FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Insert default threshold (1 million VND)
INSERT INTO public.refund_thresholds (threshold_amount, is_active)
VALUES (1000000, true);