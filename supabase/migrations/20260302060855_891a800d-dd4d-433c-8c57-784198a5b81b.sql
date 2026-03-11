
-- Sprint 12B: Patch schema safety
-- Ensure cash_outs can work without payment_request_id for direct settlement payments

-- Add settlement_source columns to cash_outs (additive, nullable)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cash_outs' AND column_name='settlement_id'
  ) THEN
    ALTER TABLE public.cash_outs ADD COLUMN settlement_id UUID DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cash_outs' AND column_name='settlement_type'
  ) THEN
    ALTER TABLE public.cash_outs ADD COLUMN settlement_type TEXT DEFAULT NULL;
  END IF;
END $$;

-- Add index for settlement lookup
CREATE INDEX IF NOT EXISTS idx_cash_outs_settlement_id ON public.cash_outs(settlement_id) WHERE settlement_id IS NOT NULL;

-- Add index for cashflow metadata lookup
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_metadata ON public.cashflow_entries USING gin(metadata) WHERE metadata IS NOT NULL;
