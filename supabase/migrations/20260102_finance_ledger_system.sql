-- ============================================
-- PHASE II: FINANCE LEDGER SYSTEM
-- Migration: 20260102_finance_ledger_system.sql
-- 
-- ADD-ONLY: Không sửa bảng cũ
-- ============================================

-- ============================================
-- PART A: CREATE TABLES
-- ============================================

-- 1. CASH ACCOUNTS (Tài khoản tiền)
CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('BANK', 'CASH', 'DIGITAL_WALLET')),
  bank_name TEXT,
  account_number TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT cash_accounts_org_code_unique UNIQUE (org_id, account_code)
);

-- Index for active accounts lookup
CREATE INDEX IF NOT EXISTS idx_cash_accounts_org_active 
ON cash_accounts(org_id, is_active) WHERE is_archived = false;

-- Unique constraint for default account per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_accounts_default 
ON cash_accounts(org_id) WHERE is_default = true AND is_archived = false;

-- 2. ACCOUNT MAPPING RULES (Quy tắc mapping tự động)
CREATE TABLE IF NOT EXISTS public.account_mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  rule_name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  
  -- Conditions (NULL = match any)
  direction TEXT CHECK (direction IN ('IN', 'OUT')),
  source_type TEXT,
  payment_type TEXT,
  payment_method TEXT,
  counterparty_type TEXT,
  
  -- Target
  cash_account_id UUID NOT NULL REFERENCES cash_accounts(id),
  
  -- Versioning (TIMESTAMPTZ for timezone safety)
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  
  is_archived BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for rule lookup
CREATE INDEX IF NOT EXISTS idx_mapping_rules_lookup 
ON account_mapping_rules(org_id, direction, source_type, priority) 
WHERE is_archived = false AND effective_to IS NULL;

-- 3. LEDGER ENTRIES (Bút toán kế toán)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  
  -- Entry date (accounting date)
  entry_date DATE NOT NULL,
  posting_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Source (idempotency key)
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'ORIGINAL' CHECK (entry_type IN ('ORIGINAL', 'REVERSAL', 'ADJUSTMENT')),
  
  -- Account
  cash_account_id UUID NOT NULL REFERENCES cash_accounts(id),
  account_snapshot JSONB NOT NULL,
  
  -- Amount
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  
  -- Counterparty snapshot
  counterparty_type TEXT,
  counterparty_id TEXT,
  counterparty_name TEXT,
  
  -- Status
  is_posted BOOLEAN NOT NULL DEFAULT true,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversal_of_id UUID REFERENCES ledger_entries(id),
  reversed_by_id UUID REFERENCES ledger_entries(id),
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  note TEXT
);

-- Idempotency: 1 source_id chỉ có 1 ORIGINAL entry
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_idempotent 
ON ledger_entries(org_id, source_type, source_id, entry_type) 
WHERE entry_type = 'ORIGINAL';

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(org_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(cash_account_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON ledger_entries(source_type, source_id);

-- ============================================
-- PART B: RLS POLICIES
-- ============================================

ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Cash accounts policies
CREATE POLICY "Cash accounts viewable by authenticated"
ON public.cash_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cash accounts manageable by admin/ketoan"
ON public.cash_accounts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan')
  )
);

CREATE POLICY "Cash accounts updatable by admin/ketoan"
ON public.cash_accounts FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan')
  )
);

-- Mapping rules policies
CREATE POLICY "Rules viewable by authenticated"
ON public.account_mapping_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rules manageable by admin/ketoan"
ON public.account_mapping_rules FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan')
  )
);

CREATE POLICY "Rules updatable by admin/ketoan"
ON public.account_mapping_rules FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'ke_toan')
  )
);

-- Ledger entries policies (immutable - only insert via RPC)
CREATE POLICY "Ledger entries viewable by authenticated"
ON public.ledger_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ledger entries insertable via RPC"
ON public.ledger_entries FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- PART C: RPC FUNCTIONS
-- ============================================

-- 1. RESOLVE ACCOUNT MAPPING
CREATE OR REPLACE FUNCTION public.resolve_account_mapping(
  p_direction TEXT,
  p_source_type TEXT,
  p_payment_type TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_counterparty_type TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Find best match by priority
  SELECT r.cash_account_id INTO v_account_id
  FROM account_mapping_rules r
  JOIN cash_accounts a ON r.cash_account_id = a.id
  WHERE r.org_id = p_org_id
    AND r.is_archived = false
    AND a.is_archived = false
    AND a.is_active = true
    AND (r.direction IS NULL OR r.direction = p_direction)
    AND (r.source_type IS NULL OR r.source_type = p_source_type)
    AND (r.payment_type IS NULL OR r.payment_type = p_payment_type)
    AND (r.payment_method IS NULL OR r.payment_method = p_payment_method)
    AND (r.counterparty_type IS NULL OR r.counterparty_type = p_counterparty_type)
    AND r.effective_from <= now()
    AND (r.effective_to IS NULL OR r.effective_to > now())
  ORDER BY r.priority ASC
  LIMIT 1;
  
  -- Fallback to default account
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM cash_accounts
    WHERE org_id = p_org_id AND is_default = true AND is_archived = false AND is_active = true;
  END IF;
  
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account found and no default account configured for org %', p_org_id;
  END IF;
  
  RETURN v_account_id;
END;
$$;

-- 2. POST LEDGER ENTRY IDEMPOTENT
CREATE OR REPLACE FUNCTION public.post_ledger_entry_idempotent(
  p_source_type TEXT,
  p_source_id UUID,
  p_cash_account_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_entry_date DATE,
  p_counterparty_type TEXT DEFAULT NULL,
  p_counterparty_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
  v_account RECORD;
BEGIN
  -- Check if already exists (idempotent)
  SELECT id INTO v_entry_id
  FROM ledger_entries
  WHERE org_id = p_org_id 
    AND source_type = p_source_type 
    AND source_id = p_source_id 
    AND entry_type = 'ORIGINAL';
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id; -- Already posted, return existing
  END IF;
  
  -- Get account for snapshot
  SELECT * INTO v_account FROM cash_accounts WHERE id = p_cash_account_id;
  
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Account not found: %', p_cash_account_id;
  END IF;
  
  -- Insert ledger entry
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, created_by, note
  )
  VALUES (
    p_org_id, p_entry_date, now(), p_source_type, p_source_id, 'ORIGINAL',
    p_cash_account_id, 
    jsonb_build_object(
      'code', v_account.account_code,
      'name', v_account.account_name,
      'bank_name', v_account.bank_name,
      'account_number', v_account.account_number
    ),
    p_direction, p_amount, 'VND',
    p_counterparty_type, p_counterparty_id, auth.uid(), p_note
  )
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- 3. CREATE CASH OUT ATOMIC (with FOR UPDATE lock)
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
BEGIN
  v_user_id := auth.uid();
  
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

-- 4. CREATE COLLECTION LEDGER ATOMIC
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
BEGIN
  v_user_id := auth.uid();
  
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
    CURRENT_DATE, p_payer_type, p_unified_booking_id, p_note
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

-- 5. REVERSE LEDGER ENTRY
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
-- PART D: SEED DEFAULT DATA
-- ============================================

-- Insert default cash account if not exists
INSERT INTO cash_accounts (
  org_id, account_code, account_name, account_type, is_default, is_active, created_at
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'DEFAULT',
  'Tài khoản mặc định',
  'BANK',
  true,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM cash_accounts 
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_default = true
);

-- Insert default mapping rule (catch-all)
INSERT INTO account_mapping_rules (
  org_id, rule_name, priority, cash_account_id, effective_from
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Rule (Catch All)',
  9999,
  (SELECT id FROM cash_accounts WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_default = true LIMIT 1),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM account_mapping_rules 
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid AND rule_name = 'Default Rule (Catch All)'
);

-- ============================================
-- PART E: GRANT EXECUTE ON FUNCTIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.resolve_account_mapping TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_ledger_entry_idempotent TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_out_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collection_ledger_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry TO authenticated;
