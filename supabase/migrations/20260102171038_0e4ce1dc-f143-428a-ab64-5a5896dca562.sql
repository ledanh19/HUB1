-- ============================================
-- PHASE III: FINANCE HARDENING
-- Migration: 20260103_phase3_finance_hardening.sql
-- 
-- ADD-ONLY: Không sửa schema Phase II
-- ============================================

-- ============================================
-- PART A: NEW TABLES
-- ============================================

-- 1. ACCOUNT OPENING BALANCES
-- Số dư đầu kỳ cho mỗi tài khoản
CREATE TABLE IF NOT EXISTS public.account_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  cash_account_id UUID NOT NULL REFERENCES cash_accounts(id),
  as_of_date DATE NOT NULL,
  opening_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT account_opening_balances_unique UNIQUE (org_id, cash_account_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_opening_balances_account_date 
ON account_opening_balances(cash_account_id, as_of_date DESC);

-- 2. LEDGER RECONCILIATIONS
-- Đánh dấu khớp sao kê ngân hàng
CREATE TABLE IF NOT EXISTS public.ledger_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id UUID NOT NULL REFERENCES ledger_entries(id),
  bank_reference TEXT,
  bank_statement_date DATE,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_by UUID REFERENCES auth.users(id),
  note TEXT,
  
  CONSTRAINT ledger_reconciliations_entry_unique UNIQUE (ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_entry 
ON ledger_reconciliations(ledger_entry_id);

CREATE INDEX IF NOT EXISTS idx_reconciliations_bank_ref 
ON ledger_reconciliations(bank_reference) WHERE bank_reference IS NOT NULL;

-- 3. ACCOUNTING PERIODS (thay thế financial_periods cũ với cấu trúc mới)
-- Kỳ kế toán với date range cụ thể
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  period_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT accounting_periods_org_range_unique UNIQUE (org_id, period_start, period_end),
  CONSTRAINT accounting_periods_valid_range CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_org_locked 
ON accounting_periods(org_id, is_locked);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_date_range 
ON accounting_periods(org_id, period_start, period_end);

-- 4. CASH TRANSFERS
-- Chuyển tiền giữa các tài khoản
CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  transfer_code TEXT NOT NULL,
  from_cash_account_id UUID NOT NULL REFERENCES cash_accounts(id),
  to_cash_account_id UUID NOT NULL REFERENCES cash_accounts(id),
  transfer_date DATE NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  voided_reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT cash_transfers_different_accounts CHECK (from_cash_account_id != to_cash_account_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_transfers_org_date 
ON cash_transfers(org_id, transfer_date DESC);

CREATE INDEX IF NOT EXISTS idx_cash_transfers_accounts 
ON cash_transfers(from_cash_account_id, to_cash_account_id);

-- Generate transfer code sequence
CREATE SEQUENCE IF NOT EXISTS cash_transfer_code_seq START 1;

-- ============================================
-- PART B: RLS POLICIES
-- ============================================

ALTER TABLE public.account_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

-- Opening Balances
CREATE POLICY "Opening balances viewable by authenticated"
ON public.account_opening_balances FOR SELECT TO authenticated USING (true);

CREATE POLICY "Opening balances manageable by admin/ketoan"
ON public.account_opening_balances FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

CREATE POLICY "Opening balances updatable by admin/ketoan"
ON public.account_opening_balances FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

-- Ledger Reconciliations
CREATE POLICY "Reconciliations viewable by authenticated"
ON public.ledger_reconciliations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Reconciliations manageable by admin/ketoan"
ON public.ledger_reconciliations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

CREATE POLICY "Reconciliations deletable by admin/ketoan"
ON public.ledger_reconciliations FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

-- Accounting Periods
CREATE POLICY "Periods viewable by authenticated"
ON public.accounting_periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Periods manageable by admin only"
ON public.accounting_periods FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Periods updatable by admin only"
ON public.accounting_periods FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Cash Transfers
CREATE POLICY "Transfers viewable by authenticated"
ON public.cash_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Transfers manageable by admin/ketoan"
ON public.cash_transfers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

CREATE POLICY "Transfers updatable by admin/ketoan"
ON public.cash_transfers FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan'))
);

-- ============================================
-- PART C: RPC FUNCTIONS
-- ============================================

-- 1. IS_PERIOD_LOCKED: Check if a date falls within a locked period
CREATE OR REPLACE FUNCTION public.is_period_locked(
  p_org_id UUID,
  p_date DATE
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE org_id = p_org_id
      AND is_locked = true
      AND p_date >= period_start
      AND p_date <= period_end
  );
END;
$$;

-- 2. CREATE_CASH_TRANSFER_ATOMIC: Transfer between accounts with 2 ledger entries
CREATE OR REPLACE FUNCTION public.create_cash_transfer_atomic(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_transfer_date DATE,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_code TEXT;
  v_user_id UUID;
  v_from_account RECORD;
  v_to_account RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin or ke_toan can create transfers';
  END IF;
  
  -- Check period lock
  IF is_period_locked(p_org_id, p_transfer_date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo chuyển khoản cho ngày %', p_transfer_date;
  END IF;
  
  -- Validate accounts exist and are active
  SELECT * INTO v_from_account FROM cash_accounts WHERE id = p_from_account_id AND is_archived = false;
  SELECT * INTO v_to_account FROM cash_accounts WHERE id = p_to_account_id AND is_archived = false;
  
  IF v_from_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản nguồn không tồn tại hoặc đã lưu trữ';
  END IF;
  
  IF v_to_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản đích không tồn tại hoặc đã lưu trữ';
  END IF;
  
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Tài khoản nguồn và đích không được trùng nhau';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải lớn hơn 0';
  END IF;
  
  -- Generate transfer code
  v_transfer_code := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(nextval('cash_transfer_code_seq')::TEXT, 4, '0');
  
  -- Insert transfer record
  INSERT INTO cash_transfers (
    org_id, transfer_code, from_cash_account_id, to_cash_account_id,
    transfer_date, amount, note, created_by
  )
  VALUES (
    p_org_id, v_transfer_code, p_from_account_id, p_to_account_id,
    p_transfer_date, p_amount, p_note, v_user_id
  )
  RETURNING id INTO v_transfer_id;
  
  -- Post CREDIT entry (tiền ra từ from_account)
  PERFORM post_ledger_entry_idempotent(
    'CASH_TRANSFER', v_transfer_id, p_from_account_id, 'CREDIT', p_amount,
    p_transfer_date, 'CASH_ACCOUNT', p_to_account_id::TEXT, 
    'Chuyển đến ' || v_to_account.account_name, p_org_id
  );
  
  -- Post DEBIT entry (tiền vào to_account)
  -- Use different source_id to avoid idempotency conflict
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, created_by, note
  )
  VALUES (
    p_org_id, p_transfer_date, now(), 'CASH_TRANSFER', v_transfer_id, 'ORIGINAL',
    p_to_account_id, 
    jsonb_build_object(
      'code', v_to_account.account_code,
      'name', v_to_account.account_name,
      'bank_name', v_to_account.bank_name,
      'account_number', v_to_account.account_number
    ),
    'DEBIT', p_amount, 'VND',
    'CASH_ACCOUNT', p_from_account_id::TEXT, v_user_id, 
    'Nhận từ ' || v_from_account.account_name
  )
  ON CONFLICT (org_id, source_type, source_id, entry_type) 
  WHERE entry_type = 'ORIGINAL' AND cash_account_id = p_to_account_id
  DO NOTHING;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'Chuyển khoản nội bộ',
    'cash_transfers',
    v_transfer_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'transfer_code', v_transfer_code,
      'from_account', v_from_account.account_name,
      'to_account', v_to_account.account_name,
      'amount', p_amount,
      'transfer_date', p_transfer_date
    )
  );
  
  RETURN v_transfer_id;
END;
$$;

-- 3. RECONCILE_LEDGER_ENTRY: Mark ledger entry as reconciled
CREATE OR REPLACE FUNCTION public.reconcile_ledger_entry(
  p_ledger_entry_id UUID,
  p_bank_reference TEXT DEFAULT NULL,
  p_bank_statement_date DATE DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reconciliation_id UUID;
  v_user_id UUID;
  v_entry RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin or ke_toan can reconcile entries';
  END IF;
  
  -- Check entry exists
  SELECT * INTO v_entry FROM ledger_entries WHERE id = p_ledger_entry_id;
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Ledger entry not found: %', p_ledger_entry_id;
  END IF;
  
  -- Upsert reconciliation (idempotent)
  INSERT INTO ledger_reconciliations (
    ledger_entry_id, bank_reference, bank_statement_date, reconciled_at, reconciled_by, note
  )
  VALUES (
    p_ledger_entry_id, p_bank_reference, p_bank_statement_date, now(), v_user_id, p_note
  )
  ON CONFLICT (ledger_entry_id) DO UPDATE SET
    bank_reference = EXCLUDED.bank_reference,
    bank_statement_date = EXCLUDED.bank_statement_date,
    reconciled_at = now(),
    reconciled_by = v_user_id,
    note = EXCLUDED.note
  RETURNING id INTO v_reconciliation_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'Đối soát bút toán',
    'ledger_reconciliations',
    v_reconciliation_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'ledger_entry_id', p_ledger_entry_id,
      'bank_reference', p_bank_reference,
      'source_type', v_entry.source_type,
      'amount', v_entry.amount
    )
  );
  
  RETURN v_reconciliation_id;
END;
$$;

-- 4. UNRECONCILE_LEDGER_ENTRY: Remove reconciliation
CREATE OR REPLACE FUNCTION public.unreconcile_ledger_entry(
  p_ledger_entry_id UUID,
  p_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_reconciliation RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin or ke_toan can unreconcile entries';
  END IF;
  
  -- Get existing reconciliation
  SELECT * INTO v_reconciliation 
  FROM ledger_reconciliations 
  WHERE ledger_entry_id = p_ledger_entry_id;
  
  IF v_reconciliation IS NULL THEN
    RAISE EXCEPTION 'Bút toán này chưa được đối soát';
  END IF;
  
  -- Delete reconciliation
  DELETE FROM ledger_reconciliations WHERE ledger_entry_id = p_ledger_entry_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'Huỷ đối soát bút toán',
    'ledger_reconciliations',
    v_reconciliation.id::TEXT,
    v_user_id,
    jsonb_build_object(
      'bank_reference', v_reconciliation.bank_reference,
      'reconciled_at', v_reconciliation.reconciled_at
    ),
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN true;
END;
$$;

-- 5. LOCK_ACCOUNTING_PERIOD: Lock a period (admin only)
CREATE OR REPLACE FUNCTION public.lock_accounting_period(
  p_org_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id UUID;
  v_user_id UUID;
  v_period_name TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin can lock accounting periods';
  END IF;
  
  -- Generate period name
  v_period_name := to_char(p_period_start, 'MM/YYYY') || ' - ' || to_char(p_period_end, 'MM/YYYY');
  
  -- Upsert period with lock
  INSERT INTO accounting_periods (
    org_id, period_name, period_start, period_end, is_locked, locked_at, locked_by, note, created_by
  )
  VALUES (
    p_org_id, v_period_name, p_period_start, p_period_end, true, now(), v_user_id, p_note, v_user_id
  )
  ON CONFLICT (org_id, period_start, period_end) DO UPDATE SET
    is_locked = true,
    locked_at = now(),
    locked_by = v_user_id,
    note = COALESCE(EXCLUDED.note, accounting_periods.note)
  RETURNING id INTO v_period_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'Khóa kỳ kế toán',
    'accounting_periods',
    v_period_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'period_start', p_period_start,
      'period_end', p_period_end,
      'note', p_note
    )
  );
  
  RETURN v_period_id;
END;
$$;

-- 6. UNLOCK_ACCOUNTING_PERIOD: Unlock a period (admin only, requires reason)
CREATE OR REPLACE FUNCTION public.unlock_accounting_period(
  p_org_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id UUID;
  v_user_id UUID;
  v_period RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin can unlock accounting periods';
  END IF;
  
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do mở khóa (ít nhất 5 ký tự)';
  END IF;
  
  -- Get period
  SELECT * INTO v_period 
  FROM accounting_periods 
  WHERE org_id = p_org_id 
    AND period_start = p_period_start 
    AND period_end = p_period_end;
  
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'Kỳ kế toán không tồn tại';
  END IF;
  
  IF NOT v_period.is_locked THEN
    RAISE EXCEPTION 'Kỳ kế toán này chưa được khóa';
  END IF;
  
  -- Update unlock
  UPDATE accounting_periods
  SET 
    is_locked = false,
    unlocked_at = now(),
    unlocked_by = v_user_id,
    note = COALESCE(note, '') || E'\n[MỞ KHÓA ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ']: ' || p_reason
  WHERE id = v_period.id
  RETURNING id INTO v_period_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'Mở khóa kỳ kế toán',
    'accounting_periods',
    v_period_id::TEXT,
    v_user_id,
    jsonb_build_object('locked_at', v_period.locked_at),
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN v_period_id;
END;
$$;