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

-- 6. UNLOCK_ACCOUNTING_PERIOD: Unlock a period (admin only)
CREATE OR REPLACE FUNCTION public.unlock_accounting_period(
  p_org_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  
  -- Get existing period
  SELECT * INTO v_period 
  FROM accounting_periods 
  WHERE org_id = p_org_id AND period_start = p_period_start AND period_end = p_period_end;
  
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'Kỳ kế toán không tồn tại';
  END IF;
  
  IF NOT v_period.is_locked THEN
    RAISE EXCEPTION 'Kỳ kế toán này chưa được khóa';
  END IF;
  
  -- Unlock
  UPDATE accounting_periods SET
    is_locked = false,
    unlocked_at = now(),
    unlocked_by = v_user_id,
    note = COALESCE(note || ' | ', '') || 'Mở khóa: ' || p_reason
  WHERE id = v_period.id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'Mở khóa kỳ kế toán',
    'accounting_periods',
    v_period.id::TEXT,
    v_user_id,
    jsonb_build_object('locked_at', v_period.locked_at),
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN true;
END;
$$;

-- 7. GET_ACCOUNT_BALANCE_AT_DATE: Calculate account balance at a specific date
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(
  p_cash_account_id UUID,
  p_as_of_date DATE,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC := 0;
  v_opening_date DATE;
  v_ledger_sum NUMERIC := 0;
BEGIN
  -- Get latest opening balance <= as_of_date
  SELECT opening_amount, as_of_date INTO v_opening, v_opening_date
  FROM account_opening_balances
  WHERE org_id = p_org_id 
    AND cash_account_id = p_cash_account_id
    AND as_of_date <= p_as_of_date
  ORDER BY as_of_date DESC
  LIMIT 1;
  
  -- If no opening balance found, start from 0 and beginning of time
  IF v_opening IS NULL THEN
    v_opening := 0;
    v_opening_date := '1900-01-01'::DATE;
  END IF;
  
  -- Sum ledger entries after opening date up to as_of_date
  SELECT COALESCE(SUM(
    CASE direction 
      WHEN 'DEBIT' THEN amount 
      WHEN 'CREDIT' THEN -amount 
    END
  ), 0) INTO v_ledger_sum
  FROM ledger_entries
  WHERE org_id = p_org_id
    AND cash_account_id = p_cash_account_id
    AND entry_date > v_opening_date
    AND entry_date <= p_as_of_date
    AND entry_type IN ('ORIGINAL', 'ADJUSTMENT')
    AND is_reversed = false;
  
  RETURN v_opening + v_ledger_sum;
END;
$$;

-- ============================================
-- PART D: ENFORCE PERIOD LOCK IN PHASE II RPC
-- ============================================

-- Update create_cash_out_atomic to check period lock
CREATE OR REPLACE FUNCTION public.create_cash_out_atomic(
  p_payment_request_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_paid_at TIMESTAMPTZ,
  p_bank_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_transfer_reference TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_is_out_of_process BOOLEAN DEFAULT false,
  p_out_of_process_reason TEXT DEFAULT NULL,
  p_receipt_image TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_total_paid NUMERIC;
  v_remaining NUMERIC;
  v_cash_out_id UUID;
  v_account_id UUID;
  v_user_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- *** PHASE III: Check period lock ***
  IF is_period_locked(v_org_id, p_paid_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo chi tiền cho ngày %', p_paid_at::DATE;
  END IF;
  
  -- 1. Lock request row (FOR UPDATE)
  SELECT * INTO v_request
  FROM payment_requests
  WHERE id = p_payment_request_id
  FOR UPDATE;
  
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Payment request not found: %', p_payment_request_id;
  END IF;
  
  IF v_request.status NOT IN ('APPROVED', 'PAID') THEN
    RAISE EXCEPTION 'Chỉ có thể chi tiền cho đề xuất đã được phê duyệt (current: %)', v_request.status;
  END IF;
  
  -- 2. Calculate remaining (atomic, inside lock)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM cash_outs
  WHERE payment_request_id = p_payment_request_id;
  
  v_remaining := v_request.proposed_amount - v_total_paid;
  
  -- 3. Validate amount (unless out of process)
  IF NOT p_is_out_of_process AND p_amount > v_remaining THEN
    RAISE EXCEPTION 'Số tiền chi (%) vượt quá số còn lại (%)', p_amount, v_remaining;
  END IF;
  
  -- 4. Insert cash_out
  INSERT INTO cash_outs (
    payment_request_id, amount, payment_method, paid_at,
    bank_name, bank_account_number, bank_account_name, transfer_reference,
    recipient_name, note, paid_by, is_out_of_process, out_of_process_reason,
    receipt_image, receipt_status
  )
  VALUES (
    p_payment_request_id, p_amount, p_payment_method, p_paid_at,
    p_bank_name, p_account_number, p_account_name, p_transfer_reference,
    p_recipient_name, p_note, v_user_id, p_is_out_of_process, p_out_of_process_reason,
    p_receipt_image, CASE WHEN p_receipt_image IS NOT NULL THEN 'UPLOADED' ELSE 'PENDING' END
  )
  RETURNING id INTO v_cash_out_id;
  
  -- 5. Resolve account + insert ledger
  v_account_id := resolve_account_mapping(
    'OUT', 'CASH_OUT', v_request.payment_type, p_payment_method, NULL
  );
  
  PERFORM post_ledger_entry_idempotent(
    'CASH_OUT', v_cash_out_id, v_account_id, 'CREDIT', p_amount,
    p_paid_at::DATE, 'PAYMENT_REQUEST', p_payment_request_id::TEXT, p_note
  );
  
  -- 6. Update request status if fully paid
  IF (v_total_paid + p_amount) >= v_request.proposed_amount THEN
    UPDATE payment_requests SET status = 'PAID' WHERE id = p_payment_request_id;
  END IF;
  
  -- 7. Insert cashflow_entries (maintain existing flow)
  INSERT INTO cashflow_entries (
    cash_date, source_type, source_id, direction,
    counterparty_type, counterparty_id, amount, created_by, note
  )
  VALUES (
    p_paid_at::DATE, 
    CASE 
      WHEN v_request.payment_type = 'HOST_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'HOST_SETTLEMENT_PAYMENT'
      WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'SERVICE_SETTLEMENT_PAYMENT'
      WHEN v_request.payment_type = 'INTERNAL_EXPENSE' THEN 'INTERNAL_EXPENSE'
      WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA_COMMISSION'
      ELSE 'CASH_OUT'
    END,
    CASE 
      WHEN v_request.settlement_id IS NOT NULL THEN v_request.settlement_id::TEXT
      ELSE v_cash_out_id::TEXT
    END,
    'OUT',
    CASE 
      WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
      WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
      WHEN v_request.payment_type = 'INTERNAL_EXPENSE' THEN 'INTERNAL'
      WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
      ELSE 'PAYMENT_REQUEST'
    END,
    COALESCE(v_request.partner_id::TEXT, v_request.expense_category),
    p_amount, v_user_id, p_note
  );
  
  -- 8. Create audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'Ghi nhận chi tiền (atomic)',
    'cash_outs',
    v_cash_out_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'payment_method', p_payment_method,
      'request_code', v_request.request_code,
      'ledger_account_id', v_account_id
    )
  );
  
  RETURN v_cash_out_id;
END;
$$;

-- Update create_collection_ledger_atomic to check period lock
CREATE OR REPLACE FUNCTION public.create_collection_ledger_atomic(
  p_unified_booking_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_collection_type TEXT,
  p_related_type TEXT,
  p_payer_type TEXT,
  p_related_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id UUID;
  v_account_id UUID;
  v_direction TEXT;
  v_user_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_entry_date DATE := CURRENT_DATE;
BEGIN
  v_user_id := auth.uid();
  
  -- *** PHASE III: Check period lock ***
  IF is_period_locked(v_org_id, v_entry_date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo thu tiền cho ngày %', v_entry_date;
  END IF;
  
  -- Validate collection_type
  IF p_collection_type NOT IN ('COLLECT', 'REFUND') THEN
    RAISE EXCEPTION 'Invalid collection_type: %. Must be COLLECT or REFUND', p_collection_type;
  END IF;
  
  -- 1. Insert hotel_collect
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    collection_type, related_type, related_id, payer_type,
    payee_type, collected_by, collected_at, note, status
  )
  VALUES (
    p_unified_booking_id, p_amount, p_payment_method,
    p_collection_type, p_related_type, p_related_id, p_payer_type,
    'ROOMRISE', v_user_id, now(), p_note, 'COLLECTED'
  )
  RETURNING id INTO v_collection_id;
  
  -- 2. Resolve account
  v_account_id := resolve_account_mapping(
    CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
    'HOTEL_COLLECT', NULL, p_payment_method, p_payer_type
  );
  
  -- 3. Ledger direction: COLLECT = tiền vào = DEBIT, REFUND = tiền ra = CREDIT
  v_direction := CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END;
  
  -- 4. Post ledger entry
  PERFORM post_ledger_entry_idempotent(
    'HOTEL_COLLECT', v_collection_id, v_account_id, v_direction, p_amount,
    v_entry_date, p_payer_type, p_unified_booking_id, p_note
  );
  
  -- 5. Create audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tiền (atomic)' ELSE 'Hoàn tiền (atomic)' END,
    'hotel_collects',
    v_collection_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'collection_type', p_collection_type,
      'payment_method', p_payment_method,
      'booking_id', p_unified_booking_id,
      'ledger_account_id', v_account_id
    )
  );
  
  RETURN v_collection_id;
END;
$$;

-- Update reverse_ledger_entry to check period lock
CREATE OR REPLACE FUNCTION public.reverse_ledger_entry(
  p_original_entry_id UUID,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_reversal_id UUID;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission (admin or ke_toan only)
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: only admin or ke_toan can reverse ledger entries';
  END IF;
  
  -- Get original entry
  SELECT * INTO v_original FROM ledger_entries WHERE id = p_original_entry_id;
  
  IF v_original IS NULL THEN
    RAISE EXCEPTION 'Ledger entry not found: %', p_original_entry_id;
  END IF;
  
  IF v_original.is_reversed THEN
    RAISE EXCEPTION 'Entry already reversed';
  END IF;
  
  -- *** PHASE III: Check period lock ***
  IF is_period_locked(v_org_id, v_original.entry_date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể đảo bút toán cho ngày %', v_original.entry_date;
  END IF;
  
  -- Create reversal entry (opposite direction)
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, counterparty_name,
    reversal_of_id, created_by, note
  )
  VALUES (
    v_original.org_id, CURRENT_DATE, now(), v_original.source_type,
    v_original.source_id, 'REVERSAL',
    v_original.cash_account_id, v_original.account_snapshot,
    CASE v_original.direction WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
    v_original.amount, v_original.currency,
    v_original.counterparty_type, v_original.counterparty_id, v_original.counterparty_name,
    p_original_entry_id, v_user_id, 'REVERSAL: ' || p_reason
  )
  RETURNING id INTO v_reversal_id;
  
  -- Mark original as reversed
  UPDATE ledger_entries
  SET is_reversed = true, reversed_by_id = v_reversal_id
  WHERE id = p_original_entry_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'Đảo bút toán',
    'ledger_entries',
    v_reversal_id::TEXT,
    v_user_id,
    jsonb_build_object('original_entry_id', p_original_entry_id),
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN v_reversal_id;
END;
$$;

-- ============================================
-- PART E: GRANT EXECUTE
-- ============================================

GRANT EXECUTE ON FUNCTION public.is_period_locked TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_transfer_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_ledger_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.unreconcile_ledger_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance_at_date TO authenticated;

-- ============================================
-- PART F: ADD SOURCE_TYPE FOR TRANSFERS
-- ============================================

-- Update ledger idempotency index to handle transfer (2 entries per transfer)
DROP INDEX IF EXISTS idx_ledger_idempotent;

CREATE UNIQUE INDEX idx_ledger_idempotent 
ON ledger_entries(org_id, source_type, source_id, cash_account_id, entry_type) 
WHERE entry_type = 'ORIGINAL';
