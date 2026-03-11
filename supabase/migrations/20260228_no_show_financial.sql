-- ============================================
-- NO_SHOW Financial Standardization
-- Migration: 20260228_no_show_financial.sql
--
-- ADDITIVE ONLY. Does NOT modify existing tables destructively.
-- ============================================

-- ============================================
-- PART A: no_show_financial_snapshots table
-- ============================================

CREATE TABLE IF NOT EXISTS public.no_show_financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  unified_booking_id TEXT NOT NULL,
  collector_type TEXT NOT NULL CHECK (collector_type IN ('HOTEL', 'OTA')),
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  collected_amount NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  charge_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (charge_status IN ('PENDING', 'COLLECTED', 'WAIVED', 'REFUNDED')),
  snapshot_date DATE NOT NULL,
  revenue_posted BOOLEAN NOT NULL DEFAULT false,
  ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  refund_ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  removed_at TIMESTAMPTZ,
  prev_booking_status TEXT,
  prev_stay_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT uq_no_show_snapshot UNIQUE (org_id, unified_booking_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshot_status
  ON no_show_financial_snapshots(charge_status)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_snapshot_booking
  ON no_show_financial_snapshots(unified_booking_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_date
  ON no_show_financial_snapshots(snapshot_date);

-- ============================================
-- PART B: RLS Policies
-- ============================================

ALTER TABLE public.no_show_financial_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_show_snapshots_select"
  ON public.no_show_financial_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "no_show_snapshots_insert"
  ON public.no_show_financial_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "no_show_snapshots_update"
  ON public.no_show_financial_snapshots
  FOR UPDATE TO authenticated USING (true);

-- ============================================
-- PART C: host_supply_segments additive column
-- ============================================

ALTER TABLE public.host_supply_segments
  ADD COLUMN IF NOT EXISTS is_voided_by_no_show BOOLEAN NOT NULL DEFAULT false;

-- Index for settlement query optimization
CREATE INDEX IF NOT EXISTS idx_hss_noshow_voided
  ON host_supply_segments(unified_booking_id)
  WHERE is_voided_by_no_show = true;
