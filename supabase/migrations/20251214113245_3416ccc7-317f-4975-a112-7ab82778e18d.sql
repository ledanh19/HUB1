-- Add new columns to ota_payouts for payout method and period
ALTER TABLE public.ota_payouts
ADD COLUMN IF NOT EXISTS payout_period_from date,
ADD COLUMN IF NOT EXISTS payout_period_to date,
ADD COLUMN IF NOT EXISTS payout_method text DEFAULT 'BANK_TRANSFER',
ADD COLUMN IF NOT EXISTS receiving_bank_account text,
ADD COLUMN IF NOT EXISTS payment_gateway text,
ADD COLUMN IF NOT EXISTS gross_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_payout_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deduction_total numeric DEFAULT 0;

-- Add check-out date to payout details for validation
ALTER TABLE public.ota_payout_details
ADD COLUMN IF NOT EXISTS actual_check_out_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS booking_code text,
ADD COLUMN IF NOT EXISTS deduction_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS guest_name text;

-- Create ota_payout_deductions table for tracking deductions/penalties
CREATE TABLE IF NOT EXISTS public.ota_payout_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payout_id uuid NOT NULL REFERENCES public.ota_payouts(id),
  payout_detail_id uuid REFERENCES public.ota_payout_details(id),
  unified_booking_id text,
  deduction_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason_note text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new table
ALTER TABLE public.ota_payout_deductions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ota_payout_deductions
CREATE POLICY "OTA payout deductions viewable by authenticated"
  ON public.ota_payout_deductions
  FOR SELECT
  USING (true);

CREATE POLICY "OTA payout deductions insertable by ke_toan or admin"
  ON public.ota_payout_deductions
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add comment for clarity
COMMENT ON TABLE public.ota_payout_deductions IS 'Tracks deductions/penalties applied to OTA payouts';