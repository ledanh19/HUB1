
-- Sprint 6-9 Part A: Table, Column, Guard Function + Triggers

-- 1. recon_runs table
CREATE TABLE IF NOT EXISTS public.recon_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  summary JSONB,
  error_message TEXT,
  created_by UUID
);
ALTER TABLE public.recon_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recon_runs_select_auth ON public.recon_runs;
CREATE POLICY recon_runs_select_auth ON public.recon_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS recon_runs_insert_auth ON public.recon_runs;
CREATE POLICY recon_runs_insert_auth ON public.recon_runs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS recon_runs_update_auth ON public.recon_runs;
CREATE POLICY recon_runs_update_auth ON public.recon_runs FOR UPDATE TO authenticated USING (true);

-- 2. deduction_id column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ota_payout_reconciliation_items' AND column_name='deduction_id') THEN
    ALTER TABLE public.ota_payout_reconciliation_items ADD COLUMN deduction_id UUID;
  END IF;
END $$;

-- 3. Period lock guard
CREATE OR REPLACE FUNCTION public.fn_guard_period_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_txn_date DATE; v_locked BOOLEAN;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'ledger_entries' THEN v_txn_date := COALESCE(NEW.entry_date, OLD.entry_date);
    WHEN 'cashflow_entries' THEN v_txn_date := COALESCE(NEW.cash_date, OLD.cash_date);
    WHEN 'hotel_collects' THEN v_txn_date := COALESCE(NEW.collected_at::date, OLD.collected_at::date);
    WHEN 'cash_outs' THEN v_txn_date := COALESCE(NEW.paid_at::date, OLD.paid_at::date);
    ELSE v_txn_date := NULL;
  END CASE;
  IF v_txn_date IS NULL THEN RETURN NEW; END IF;
  SELECT ap.is_locked INTO v_locked FROM public.accounting_periods ap
  WHERE v_txn_date BETWEEN ap.period_start::date AND ap.period_end::date AND ap.is_locked = true LIMIT 1;
  IF v_locked THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %. Không thể thêm/sửa/xóa dữ liệu.', v_txn_date USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_period_lock_ledger ON public.ledger_entries;
CREATE TRIGGER trg_period_lock_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.fn_guard_period_lock();
DROP TRIGGER IF EXISTS trg_period_lock_cashflow ON public.cashflow_entries;
CREATE TRIGGER trg_period_lock_cashflow BEFORE INSERT OR UPDATE OR DELETE ON public.cashflow_entries FOR EACH ROW EXECUTE FUNCTION public.fn_guard_period_lock();
DROP TRIGGER IF EXISTS trg_period_lock_hotel_collects ON public.hotel_collects;
CREATE TRIGGER trg_period_lock_hotel_collects BEFORE INSERT OR UPDATE OR DELETE ON public.hotel_collects FOR EACH ROW EXECUTE FUNCTION public.fn_guard_period_lock();
DROP TRIGGER IF EXISTS trg_period_lock_cash_outs ON public.cash_outs;
CREATE TRIGGER trg_period_lock_cash_outs BEFORE INSERT OR UPDATE OR DELETE ON public.cash_outs FOR EACH ROW EXECUTE FUNCTION public.fn_guard_period_lock();
