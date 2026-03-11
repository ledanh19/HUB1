
-- Sprint 12D: Patch create_cash_out_atomic to support settlement_source
-- Updates the existing RPC to pass settlement_id when creating cash_outs for settlement payments

-- Also add updated_at trigger for cashflow_entries
CREATE OR REPLACE FUNCTION public.fn_cashflow_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create if cashflow_entries has updated_at column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cashflow_entries' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.cashflow_entries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_cashflow_entries_updated_at ON public.cashflow_entries;
CREATE TRIGGER trg_cashflow_entries_updated_at
  BEFORE UPDATE ON public.cashflow_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_cashflow_entries_updated_at();
