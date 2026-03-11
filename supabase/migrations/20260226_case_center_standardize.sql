-- ============================================
-- CASE CENTER STANDARDIZATION
-- Migration: 20260226_case_center_standardize.sql
--
-- PURPOSE: Chuẩn hóa module tranh chấp thành Case Center
-- - Add columns vào ota_disputes cho case_type, settlement, refund
-- - Tạo ota_adjustment_records (manual OTA adjustments)
-- - Tạo ota_debit_note_records (manual OTA debit notes)
--
-- CONSTRAINTS:
-- ❌ Không xóa column cũ
-- ❌ Không sửa enum dispute_status
-- ❌ Không đổi flow no_show_records
-- ✅ Additive only
-- ✅ Backward compatible 100%
-- ============================================

-- ============================================
-- PART A: ADD COLUMNS TO ota_disputes
-- ============================================

-- Case classification
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS case_type TEXT DEFAULT 'DISPUTE';
  -- Values: 'DISPUTE', 'REFUND'

ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS case_status TEXT DEFAULT 'DRAFT';
  -- Values: 'DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','SETTLED','CLOSED'

ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS refund_channel TEXT;
  -- Values: 'DIRECT_TO_GUEST', 'VIA_OTA'

ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS settlement_type TEXT;
  -- Values: 'DIRECT_CASH_OUT', 'OTA_DEDUCTION', 'OTA_DEBIT_NOTE'

-- Financial fields
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS amount_requested NUMERIC DEFAULT 0;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS amount_approved NUMERIC DEFAULT 0;
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'VND';
ALTER TABLE public.ota_disputes ADD COLUMN IF NOT EXISTS ota_reference TEXT;

-- Link fields (manual matching)
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

-- ============================================
-- PART B: BACKFILL EXISTING RECORDS
-- Map old dispute_status → new case_status
-- ============================================

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

-- Backfill amount_requested from amount_in_dispute
UPDATE public.ota_disputes
SET amount_requested = amount_in_dispute
WHERE (amount_requested = 0 OR amount_requested IS NULL)
  AND amount_in_dispute > 0;

-- ============================================
-- PART C: CREATE ota_adjustment_records
-- Manual OTA adjustment tracking
-- ============================================

CREATE TABLE IF NOT EXISTS public.ota_adjustment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,              -- OTA source: BOOKING, AGODA, AIRBNB, etc.
  amount NUMERIC NOT NULL,            -- Signed: + = OTA trả thêm (win), - = OTA trừ (lose)
  reason TEXT NOT NULL,
  adjustment_date DATE NOT NULL,
  reference TEXT,                     -- OTA reference number
  note TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_adjustment_records ENABLE ROW LEVEL SECURITY;

-- RLS: Same pattern as ota_payout_deductions
CREATE POLICY "ota_adjustment_records_select"
  ON public.ota_adjustment_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "ota_adjustment_records_insert"
  ON public.ota_adjustment_records FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'ke_toan'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "ota_adjustment_records_update"
  ON public.ota_adjustment_records FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'ke_toan'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger updated_at
CREATE TRIGGER update_ota_adjustment_records_updated_at
  BEFORE UPDATE ON public.ota_adjustment_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ota_adjustment_records IS
  'Manual OTA adjustment records. amount > 0 = Win OTA (tiền về). amount < 0 = Lose OTA (bị trừ).';

-- ============================================
-- PART D: CREATE ota_debit_note_records
-- Manual OTA debit note tracking
-- ============================================

CREATE TABLE IF NOT EXISTS public.ota_debit_note_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,              -- OTA source
  amount NUMERIC NOT NULL,            -- Always positive (tiền OTA yêu cầu trả)
  issue_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN = chưa trả, PAID = đã trả
  reference TEXT,                     -- OTA debit note reference
  paid_via_cash_out_id UUID,          -- Link to cash_out when paid
  note TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_debit_note_records ENABLE ROW LEVEL SECURITY;

-- RLS: Same pattern
CREATE POLICY "ota_debit_note_records_select"
  ON public.ota_debit_note_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "ota_debit_note_records_insert"
  ON public.ota_debit_note_records FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'ke_toan'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "ota_debit_note_records_update"
  ON public.ota_debit_note_records FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'ke_toan'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger updated_at
CREATE TRIGGER update_ota_debit_note_records_updated_at
  BEFORE UPDATE ON public.ota_debit_note_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ota_debit_note_records IS
  'Manual OTA debit note records. status = OPEN (chưa trả) / PAID (đã trả). Always link cash_out when PAID.';

-- ============================================
-- PART E: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ota_disputes_case_type ON public.ota_disputes(case_type);
CREATE INDEX IF NOT EXISTS idx_ota_disputes_case_status ON public.ota_disputes(case_status);
CREATE INDEX IF NOT EXISTS idx_ota_adjustment_records_channel ON public.ota_adjustment_records(channel);
CREATE INDEX IF NOT EXISTS idx_ota_adjustment_records_date ON public.ota_adjustment_records(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_ota_debit_note_records_channel ON public.ota_debit_note_records(channel);
CREATE INDEX IF NOT EXISTS idx_ota_debit_note_records_status ON public.ota_debit_note_records(status);
