
-- ============================================
-- CASE CENTER STANDARDIZATION
-- ============================================

-- PART A: ADD COLUMNS TO ota_disputes
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS case_type TEXT DEFAULT 'DISPUTE';
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS case_status TEXT DEFAULT 'DRAFT';
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS refund_channel TEXT;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS settlement_type TEXT;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS amount_requested NUMERIC DEFAULT 0;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS amount_approved NUMERIC DEFAULT 0;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'VND';
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS ota_reference TEXT;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS payment_request_id UUID;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS cash_out_id UUID;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS ota_payout_record_id UUID;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS ota_adjustment_record_id UUID;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS ota_debit_note_record_id UUID;

COMMENT ON COLUMN public.ota_disputes.case_type IS 'DISPUTE = tranh chấp, REFUND = hoàn tiền';
COMMENT ON COLUMN public.ota_disputes.case_status IS 'State machine: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → SETTLED → CLOSED';
COMMENT ON COLUMN public.ota_disputes.refund_channel IS 'DIRECT_TO_GUEST = hoàn trực tiếp, VIA_OTA = hoàn qua OTA';
COMMENT ON COLUMN public.ota_disputes.settlement_type IS 'DIRECT_CASH_OUT / OTA_DEDUCTION / OTA_DEBIT_NOTE';
COMMENT ON COLUMN public.ota_disputes.ota_adjustment_record_id IS 'FK logic to ota_adjustment_records.id';
COMMENT ON COLUMN public.ota_disputes.ota_debit_note_record_id IS 'FK logic to ota_debit_note_records.id';

-- PART B: BACKFILL
UPDATE public.ota_disputes
SET case_status = CASE status::TEXT
  WHEN 'OPEN' THEN 'SUBMITTED'
  WHEN 'IN_REVIEW' THEN 'UNDER_REVIEW'
  WHEN 'WON' THEN 'CLOSED'
  WHEN 'LOST' THEN 'CLOSED'
  WHEN 'PARTIAL' THEN 'CLOSED'
  WHEN 'CLOSED' THEN 'CLOSED'
  ELSE 'DRAFT'
END
WHERE case_status IS NULL OR case_status = 'DRAFT';

UPDATE public.ota_disputes
SET amount_requested = amount_in_dispute
WHERE (amount_requested = 0 OR amount_requested IS NULL)
  AND amount_in_dispute > 0;

-- PART C: ota_adjustment_records
CREATE TABLE IF NOT EXISTS public.ota_adjustment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  adjustment_date DATE NOT NULL,
  reference TEXT,
  note TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_adjustment_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_adjustment_records_select' AND tablename = 'ota_adjustment_records') THEN
    CREATE POLICY "ota_adjustment_records_select" ON public.ota_adjustment_records FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_adjustment_records_insert' AND tablename = 'ota_adjustment_records') THEN
    CREATE POLICY "ota_adjustment_records_insert" ON public.ota_adjustment_records FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_adjustment_records_update' AND tablename = 'ota_adjustment_records') THEN
    CREATE POLICY "ota_adjustment_records_update" ON public.ota_adjustment_records FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE OR REPLACE TRIGGER update_ota_adjustment_records_updated_at
  BEFORE UPDATE ON public.ota_adjustment_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ota_adjustment_records IS 'Manual OTA adjustment records. amount > 0 = Win OTA. amount < 0 = Lose OTA.';

-- PART D: ota_debit_note_records
CREATE TABLE IF NOT EXISTS public.ota_debit_note_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  issue_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  reference TEXT,
  paid_via_cash_out_id UUID,
  note TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_debit_note_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_debit_note_records_select' AND tablename = 'ota_debit_note_records') THEN
    CREATE POLICY "ota_debit_note_records_select" ON public.ota_debit_note_records FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_debit_note_records_insert' AND tablename = 'ota_debit_note_records') THEN
    CREATE POLICY "ota_debit_note_records_insert" ON public.ota_debit_note_records FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_debit_note_records_update' AND tablename = 'ota_debit_note_records') THEN
    CREATE POLICY "ota_debit_note_records_update" ON public.ota_debit_note_records FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE OR REPLACE TRIGGER update_ota_debit_note_records_updated_at
  BEFORE UPDATE ON public.ota_debit_note_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ota_debit_note_records IS 'Manual OTA debit note records. status = OPEN / PAID.';

-- PART E: INDEXES
CREATE INDEX IF NOT EXISTS idx_ota_disputes_case_type ON public.ota_disputes(case_type);
CREATE INDEX IF NOT EXISTS idx_ota_disputes_case_status ON public.ota_disputes(case_status);
CREATE INDEX IF NOT EXISTS idx_ota_adjustment_records_channel ON public.ota_adjustment_records(channel);
CREATE INDEX IF NOT EXISTS idx_ota_adjustment_records_date ON public.ota_adjustment_records(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_ota_debit_note_records_channel ON public.ota_debit_note_records(channel);
CREATE INDEX IF NOT EXISTS idx_ota_debit_note_records_status ON public.ota_debit_note_records(status);
