-- ============================================================================
-- SPRINT 5 — FINANCE INTEGRITY HARDENING
-- ============================================================================
-- Date:     2026-03-06
-- Revision: FINAL (production-ready)
-- Depends:  20260303_sprint2_payout_hardening.sql (void_ota_payout_secure, is_active)
--           20260304_sprint3_atomic_payout_posting.sql (post_payout_ledger_entries_atomic)
--           20260228_fix_ota_payout_received_at.sql (create_multi_payout_cashin_atomic)
--           20260103_phase3_finance_hardening.sql (unlock_accounting_period)
--
-- 4 Workstreams:
--   S5.1 — Cash-in + ledger posting atomic (no silent failures)
--   S5.2 — Harden void payout (FOR UPDATE, status guard, deactivated_at)
--   S5.3 — Cancel payment request (guarded + audited RPC)
--   S5.4 — Harden unlock accounting period (super_admin only, reason ≥10 chars)
--
-- Hard rules:
--   • NON-BREAKING + ADDITIVE only
--   • OR REPLACE (idempotent deploy)
--   • SECURITY DEFINER + RBAC (existing roles only)
--   • No hard deletes, no destructive schema changes
-- ============================================================================


-- ============================================================================
-- SCHEMA ADDITIONS (additive only, IF NOT EXISTS)
-- ============================================================================

-- S5.2: Deactivation tracking on payout details
ALTER TABLE public.ota_payout_details
  ADD COLUMN IF NOT EXISTS deactivated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT;

-- S5.3: Cancellation tracking on payment requests
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by     UUID;


-- ============================================================================
-- S5.1 — ATOMIC CASH-IN + LEDGER POSTING
-- ============================================================================
-- Changes vs previous version:
--   1) RBAC: add super_admin
--   2) After status recalculation, call post_payout_ledger_entries_atomic
--      → bank fee + adjustment ledger posted in SAME transaction
--   3) Ledger failure → RAISE EXCEPTION → entire cash-in rolls back
--   4) Audit log enhanced with payout_status_after + ledger_posting_result

CREATE OR REPLACE FUNCTION public.create_multi_payout_cashin_atomic(
  p_payout_ids UUID[],
  p_amounts NUMERIC[],
  p_cash_account_id UUID,
  p_received_at TEXT,
  p_payment_method TEXT,
  p_payment_channel TEXT DEFAULT NULL,
  p_bank_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID,
  p_total_amount NUMERIC DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_ids UUID[] := '{}';
  v_collection_id UUID;
  v_ledger_entry_id UUID;
  v_payout RECORD;
  v_account RECORD;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_i INT;
  v_amount NUMERIC;
  v_payout_id UUID;
  v_payout_status TEXT;
  v_ledger_result JSONB;
BEGIN
  -- ── 1. Auth + RBAC ──────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can record cash-in';
  END IF;

  -- ── 2. Input validation ─────────────────────────────────────────
  IF array_length(p_payout_ids, 1) != array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'payout_ids and amounts arrays must have same length';
  END IF;

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'cash_account_id là bắt buộc';
  END IF;

  SELECT * INTO v_account FROM cash_accounts
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động: %', p_cash_account_id;
  END IF;

  -- ── 3. Period lock enforcement ──────────────────────────────────
  IF is_period_locked(p_org_id, p_received_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', p_received_at;
  END IF;

  -- ── 4. Process each payout ──────────────────────────────────────
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    v_payout_id := p_payout_ids[v_i];
    v_amount := p_amounts[v_i];
    v_ledger_result := NULL;

    IF v_amount <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_payout FROM ota_payouts WHERE id = v_payout_id;
    IF v_payout IS NULL THEN
      RAISE EXCEPTION 'OTA Payout không tồn tại: %', v_payout_id;
    END IF;

    -- 4a. Insert hotel_collects
    INSERT INTO hotel_collects (
      unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
      related_type, collected_at, collected_by, collection_type,
      receipt, note, status
    ) VALUES (
      'OTA-PAYOUT-' || LEFT(v_payout_id::TEXT, 8), v_amount, p_payment_method, 'ROOMRISE', 'OTA',
      'OTA_PAYOUT', p_received_at::TIMESTAMPTZ, v_user_id, 'COLLECT',
      p_bank_reference, COALESCE(p_note, 'Tiền OTA ' || v_payout.ota_source || ' về'), 'COLLECTED'
    ) RETURNING id INTO v_collection_id;

    -- 4b. Insert allocation junction
    INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
    VALUES (v_collection_id, v_payout_id, v_amount);

    -- 4c. Insert cash-in ledger entry
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, counterparty_name, created_by, note
    ) VALUES (
      p_org_id, p_received_at::DATE, now(), 'OTA_PAYOUT', v_collection_id, 'ORIGINAL',
      p_cash_account_id,
      jsonb_build_object('code', v_account.account_code, 'name', v_account.account_name,
        'type', v_account.account_type, 'bank_name', v_account.bank_name,
        'account_number', v_account.account_number, 'selected_at', now()::TEXT,
        'selected_by', v_user_id::TEXT),
      'DEBIT', v_amount, 'VND', 'OTA', v_payout.ota_source,
      v_payout.ota_source || ' Payout', v_user_id,
      'OTA Payout Cash-In: ' || COALESCE(p_note, v_payout.ota_source)
    ) RETURNING id INTO v_ledger_entry_id;

    -- 4d. Insert cashflow entry
    INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
    VALUES (p_received_at::DATE, v_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
      'OTA ' || v_payout.ota_source || ' payout - ' || COALESCE(p_bank_reference, ''), v_user_id);

    -- 4e. Recalculate payout status
    PERFORM recalculate_ota_payout_status_v2(v_payout_id, p_received_at::TIMESTAMPTZ);

    -- ── S5.1 FIX: Atomic ledger posting for bank fee + adjustments ──
    -- After status recalculation, post ALL outstanding ledger items
    -- in the SAME transaction. Any failure → entire cash-in rolls back.
    SELECT status::TEXT INTO v_payout_status FROM ota_payouts WHERE id = v_payout_id;
    IF v_payout_status IN ('RECEIVED', 'PARTIAL') THEN
      v_ledger_result := post_payout_ledger_entries_atomic(v_payout_id, false);
    END IF;

    -- 4f. Audit log (enhanced with ledger posting result)
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES ('OTA_PAYOUT_CASHIN_ATOMIC', 'hotel_collects', v_collection_id::TEXT, v_user_id,
      jsonb_build_object(
        'payout_id', v_payout_id,
        'collection_id', v_collection_id,
        'ledger_entry_id', v_ledger_entry_id,
        'amount', v_amount,
        'cash_account_id', p_cash_account_id,
        'payout_status_after', v_payout_status,
        'ledger_posting_result', COALESCE(v_ledger_result, '{"status":"not_applicable"}'::JSONB)
      ));

    v_collection_ids := v_collection_ids || v_collection_id;
  END LOOP;

  RETURN v_collection_ids;
END;
$$;

COMMENT ON FUNCTION public.create_multi_payout_cashin_atomic IS
  'Atomic OTA payout cash-in: creates hotel_collects, allocations, ledger, cashflow, '
  'recalculates status, AND posts bank fee + adjustment ledger entries — all in ONE '
  'transaction. Sprint 5: ledger posting failures now rollback the entire cash-in.';


-- ============================================================================
-- S5.2 — HARDEN VOID PAYOUT (IN-PLACE UPDATE)
-- ============================================================================
-- Changes vs previous version:
--   1) FOR UPDATE on payout row (prevents concurrent void race)
--   2) Status guard: only PENDING payouts can be voided
--   3) Set deactivated_at + deactivated_reason on detail rows
--   4) GET DIAGNOSTICS for accurate deactivated count

CREATE OR REPLACE FUNCTION public.void_ota_payout_secure(
  p_payout_id  UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payout         RECORD;
  v_user_id        UUID;
  v_alloc_count    INT;
  v_detail_count   INT;
  v_deduction_count INT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated to void a payout'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan can void payouts'
      USING ERRCODE = 'P0001';
  END IF;

  -- Load payout FOR UPDATE (prevents concurrent void race)
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout % không tồn tại', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'status', 'already_voided',
      'voided_at', v_payout.voided_at
    );
  END IF;

  -- Status guard: only PENDING payouts can be voided
  IF v_payout.status != 'PENDING' THEN
    RAISE EXCEPTION
      'NOT_VOIDABLE: Payout % has status=%, only PENDING payouts can be voided',
      p_payout_id, v_payout.status
      USING ERRCODE = 'P0002';
  END IF;

  -- Gate: no cash-in allocations
  SELECT COUNT(*) INTO v_alloc_count
    FROM collection_payout_allocations
   WHERE payout_id = p_payout_id;

  IF v_alloc_count > 0 THEN
    RAISE EXCEPTION
      'VOID_BLOCKED: Payout has % cash-in allocation(s). '
      'Reverse cash-in first via đảo bút toán thu tiền.',
      v_alloc_count
      USING ERRCODE = 'P0002';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Lý do hủy bắt buộc' USING ERRCODE = 'P0003';
  END IF;

  -- 1) Soft-void the payout
  UPDATE ota_payouts
     SET is_voided     = true,
         voided_at     = now(),
         voided_reason = TRIM(p_reason),
         voided_by     = v_user_id,
         status        = 'PENDING',
         updated_at    = now()
   WHERE id = p_payout_id;

  -- 2) Deactivate details → releases booking for re-allocation
  UPDATE ota_payout_details
     SET is_active          = false,
         deactivated_at     = now(),
         deactivated_reason = 'PAYOUT_VOID'
   WHERE payout_id = p_payout_id
     AND is_active = true;

  GET DIAGNOSTICS v_detail_count = ROW_COUNT;

  SELECT COUNT(*) INTO v_deduction_count
    FROM ota_payout_deductions WHERE payout_id = p_payout_id;

  -- 3) Audit log
  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'VOID_OTA_PAYOUT',
    'ota_payouts',
    p_payout_id::TEXT,
    jsonb_build_object(
      'payout_id', p_payout_id,
      'reason', TRIM(p_reason),
      'voided_by', v_user_id,
      'details_deactivated', v_detail_count,
      'deductions_preserved', v_deduction_count,
      'previous_status', v_payout.status,
      'ota_source', v_payout.ota_source,
      'total_amount', v_payout.total_amount
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'status', 'voided',
    'voided_at', now(),
    'voided_by', v_user_id,
    'details_deactivated', v_detail_count,
    'deductions_preserved', v_deduction_count
  );
END;
$$;

COMMENT ON FUNCTION public.void_ota_payout_secure(UUID, TEXT) IS
  'Soft-void a payout. FOR UPDATE row lock. Only PENDING status allowed. '
  'Blocks if cash-in exists. Deactivates details with timestamp + reason. '
  'No rows are deleted. Full audit trail. Sprint 5 hardened.';


-- ============================================================================
-- S5.3 — CANCEL PAYMENT REQUEST SECURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_payment_request_secure(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can cancel payment requests'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Cancellation reason is required'
      USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_request FROM payment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Payment request % not found', p_request_id;
  END IF;

  -- Idempotent: already cancelled
  IF v_request.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'already_cancelled'
    );
  END IF;

  IF v_request.status != 'PENDING' THEN
    RAISE EXCEPTION 'STATUS_INVALID: Payment request % has status=%, only PENDING can be cancelled',
      p_request_id, v_request.status
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE payment_requests SET
    status           = 'CANCELLED',
    cancelled_at     = now(),
    cancelled_reason = TRIM(p_reason),
    cancelled_by     = v_user_id
  WHERE id = p_request_id;

  INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data, user_id)
  VALUES (
    'CANCEL_PAYMENT_REQUEST',
    'payment_requests',
    p_request_id::TEXT,
    jsonb_build_object('status', v_request.status, 'proposed_amount', v_request.proposed_amount),
    jsonb_build_object(
      'status', 'CANCELLED',
      'reason', TRIM(p_reason),
      'cancelled_by', v_user_id,
      'request_code', v_request.request_code,
      'payment_type', v_request.payment_type,
      'proposed_amount', v_request.proposed_amount
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'cancelled',
    'cancelled_at', now(),
    'request_code', v_request.request_code
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_payment_request_secure(UUID, TEXT) IS
  'Cancel a PENDING payment request. Auth + RBAC guarded. FOR UPDATE row lock. '
  'Idempotent: returns already_cancelled if already done. Full audit trail.';


-- ============================================================================
-- S5.4 — HARDEN UNLOCK ACCOUNTING PERIOD
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unlock_accounting_period_secure(
  p_period_id UUID,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_period  RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- super_admin ONLY
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only super_admin can unlock accounting periods'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) <= 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Unlock reason must be longer than 10 characters'
      USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id FOR UPDATE;
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period % not found', p_period_id;
  END IF;

  IF NOT v_period.is_locked THEN
    RAISE EXCEPTION 'PERIOD_NOT_LOCKED: Kỳ kế toán này chưa được khóa';
  END IF;

  UPDATE accounting_periods SET
    is_locked   = false,
    unlocked_at = now(),
    unlocked_by = v_user_id,
    note        = COALESCE(note || ' | ', '') || 'Mở khóa (secure): ' || TRIM(p_reason)
  WHERE id = p_period_id;

  INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data, user_id)
  VALUES (
    'UNLOCK_ACCOUNTING_PERIOD_SECURE',
    'accounting_periods',
    p_period_id::TEXT,
    jsonb_build_object(
      'is_locked', true,
      'locked_at', v_period.locked_at,
      'period_name', v_period.period_name
    ),
    jsonb_build_object(
      'is_locked', false,
      'reason', TRIM(p_reason),
      'unlocked_by', v_user_id,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'status', 'unlocked',
    'period_name', v_period.period_name,
    'unlocked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.unlock_accounting_period_secure(UUID, TEXT) IS
  'Unlock an accounting period. RESTRICTED to super_admin only. '
  'Reason must be > 10 characters. FOR UPDATE row lock. Full audit trail. '
  'Sprint 5 hardening — replaces permissive unlock_accounting_period.';


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_fn1 INT; v_fn2 INT; v_fn3 INT; v_fn4 INT;
  v_col1 INT; v_col2 INT;
BEGIN
  SELECT COUNT(*) INTO v_fn1 FROM pg_proc WHERE proname = 'cancel_payment_request_secure';
  SELECT COUNT(*) INTO v_fn2 FROM pg_proc WHERE proname = 'unlock_accounting_period_secure';
  SELECT COUNT(*) INTO v_fn3 FROM pg_proc WHERE proname = 'void_ota_payout_secure';
  SELECT COUNT(*) INTO v_fn4 FROM pg_proc WHERE proname = 'create_multi_payout_cashin_atomic';

  SELECT COUNT(*) INTO v_col1
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ota_payout_details'
     AND column_name IN ('deactivated_at', 'deactivated_reason');

  SELECT COUNT(*) INTO v_col2
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payment_requests'
     AND column_name IN ('cancelled_at', 'cancelled_reason', 'cancelled_by');

  RAISE NOTICE 'Sprint 5 FINAL: cancel_pr=%, unlock_secure=%, void_payout=%, cashin_atomic=%, detail_cols=% (expect 2), pr_cols=% (expect 3)',
    v_fn1, v_fn2, v_fn3, v_fn4, v_col1, v_col2;

  IF v_fn1 < 1 THEN RAISE WARNING 'MISSING: cancel_payment_request_secure'; END IF;
  IF v_fn2 < 1 THEN RAISE WARNING 'MISSING: unlock_accounting_period_secure'; END IF;
  IF v_fn3 < 1 THEN RAISE WARNING 'MISSING: void_ota_payout_secure'; END IF;
  IF v_fn4 < 1 THEN RAISE WARNING 'MISSING: create_multi_payout_cashin_atomic'; END IF;
  IF v_col1 < 2 THEN RAISE WARNING 'MISSING: deactivated_at/deactivated_reason columns on ota_payout_details'; END IF;
  IF v_col2 < 3 THEN RAISE WARNING 'MISSING: cancelled_at/cancelled_reason/cancelled_by columns on payment_requests'; END IF;
END;
$$;
