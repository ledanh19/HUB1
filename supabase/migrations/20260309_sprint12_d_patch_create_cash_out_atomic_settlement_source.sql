-- ============================================================================
-- SPRINT 12.D — PATCH create_cash_out_atomic: Unified Settlement Source ID
-- ============================================================================
-- Date: 2026-03-09
-- Purpose:
--   Stop producing legacy source_id = settlement_id for settlement payments.
--   All settlement payment cashflow entries now follow unified rule:
--     cashflow_entries.source_id = cash_out_id::text
--     cashflow_entries.metadata = {..., settlement_id, payment_request_id, unified_source_id}
--     ledger_entries.source_id = cash_out_id (already correct)
--
-- Changes from previous version (20260111141832):
--   1. cashflow source_id: settlement_id::TEXT → v_cash_out_id::TEXT (ALWAYS)
--   2. cashflow metadata: NOW POPULATED for settlement payments
--   3. ledger source_type: 'CASH_OUT' → actual settlement type for settlement payments
--   4. resolve_account_mapping: 5-param → 4-param (matches live function signature)
--   5. Audit log: includes settlement_id in metadata
--
-- NON-BREAKING: signature unchanged. Only cashflow/ledger semantics improved.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_cash_out_atomic(
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
  p_is_out_of_process BOOLEAN DEFAULT FALSE,
  p_out_of_process_reason TEXT DEFAULT NULL,
  p_receipt_image TEXT DEFAULT NULL
)
RETURNS UUID
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
  v_has_permission BOOLEAN;
  v_audit_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  -- Sprint 12.D additions
  v_cashflow_source_type TEXT;
  v_cashflow_metadata JSONB;
  v_ledger_source_type TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;
  
  -- Permission check using server-authoritative helper
  v_has_permission := has_page_use_access('/payments/cashout');

  -- Also allow admin/super_admin/ke_toan role without explicit permission
  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận chi tiền';
  END IF;
  
  -- Check period lock (if function exists)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_period_locked') THEN
    IF is_period_locked(v_org_id, p_paid_at::DATE) THEN
      RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo chi tiền cho ngày %', p_paid_at::DATE;
    END IF;
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

  -- ========================================
  -- 5. Determine source_type for ledger + cashflow
  -- ========================================
  -- Sprint 12.D: settlement payments get their specific source_type for BOTH ledger and cashflow
  IF v_request.payment_type = 'HOST_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN
    v_cashflow_source_type := 'HOST_SETTLEMENT_PAYMENT';
    v_ledger_source_type := 'HOST_SETTLEMENT_PAYMENT';
  ELSIF v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN
    v_cashflow_source_type := 'SERVICE_SETTLEMENT_PAYMENT';
    v_ledger_source_type := 'SERVICE_SETTLEMENT_PAYMENT';
  ELSE
    v_cashflow_source_type := 'CASH_OUT';
    v_ledger_source_type := 'CASH_OUT';
  END IF;

  -- ========================================
  -- 6. Resolve account + insert ledger
  -- ========================================
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_account_mapping') THEN
    -- Sprint 12.D FIX: use 4-param signature (matches 20260104 canonical version)
    v_account_id := resolve_account_mapping(
      'OUT',
      v_ledger_source_type,
      p_payment_method,
      CASE
        WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
        WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
        WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
        ELSE 'OTHER'
      END
    );

    -- Sprint 12.D: ledger source_type = settlement type (not generic CASH_OUT)
    -- source_id = cash_out_id (unified rule — already correct in all versions)
    PERFORM post_ledger_entry_idempotent(
      v_ledger_source_type,     -- e.g. 'HOST_SETTLEMENT_PAYMENT' (was: 'CASH_OUT')
      v_cash_out_id,            -- source_id = cash_out_id (unchanged)
      v_account_id,
      'CREDIT',
      p_amount,
      p_paid_at::DATE,
      CASE
        WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
        WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
        WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
        ELSE 'OTHER'
      END,
      COALESCE(v_request.partner_id::TEXT, v_request.expense_category),
      p_note
    );
  END IF;
  
  -- 7. Update request status if fully paid
  IF (v_total_paid + p_amount) >= v_request.proposed_amount THEN
    UPDATE payment_requests SET status = 'PAID' WHERE id = p_payment_request_id;
  END IF;

  -- ========================================
  -- 8. Build cashflow metadata (Sprint 12.D)
  -- ========================================
  -- For settlement payments: store settlement_id + payment_request_id for joins
  IF v_request.settlement_id IS NOT NULL THEN
    v_cashflow_metadata := jsonb_build_object(
      'settlement_id', v_request.settlement_id,
      'payment_request_id', v_request.id,
      'unified_source_id', v_cash_out_id,
      'settlement_type', v_request.settlement_type,
      'request_code', v_request.request_code
    );
  ELSE
    v_cashflow_metadata := jsonb_build_object(
      'payment_request_id', v_request.id,
      'unified_source_id', v_cash_out_id,
      'request_code', v_request.request_code
    );
  END IF;

  -- ========================================
  -- 9. Insert cashflow_entries (UNIFIED SOURCE_ID RULE)
  -- ========================================
  -- Sprint 12.D CRITICAL CHANGE:
  --   BEFORE: source_id = settlement_id::TEXT (when settlement_id IS NOT NULL)
  --   AFTER:  source_id = v_cash_out_id::TEXT (ALWAYS)
  --   settlement_id is stored in metadata for backward-compat joins
  INSERT INTO cashflow_entries (
    cash_date, source_type, source_id, direction,
    counterparty_type, counterparty_id, amount, created_by, note,
    metadata  -- Sprint 12.D: now populated
  )
  VALUES (
    p_paid_at::DATE,
    v_cashflow_source_type,
    -- UNIFIED RULE: ALWAYS use cash_out_id (never settlement_id)
    v_cash_out_id::TEXT,
    'OUT',
    CASE 
      WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
      WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
      WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
      ELSE 'OTHER'
    END,
    COALESCE(v_request.partner_id::TEXT, v_request.expense_category),
    p_amount, v_user_id, p_note,
    v_cashflow_metadata  -- Sprint 12.D: metadata with settlement_id
  );
  
  -- ========================================
  -- 10. Audit log - FAIL FAST if insert fails
  -- ========================================
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
      'ledger_account_id', v_account_id,
      -- Sprint 12.D: include settlement tracking
      'settlement_id', v_request.settlement_id,
      'payment_request_id', v_request.id,
      'cashflow_source_type', v_cashflow_source_type,
      'unified_source_id', v_cash_out_id
    )
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;
  
  RETURN v_cash_out_id;
END;
$$;

COMMENT ON FUNCTION public.create_cash_out_atomic IS
  'Sprint 12.D: Atomic cash out with unified source_id rule. '
  'Settlement payments: source_id=cash_out_id, settlement_id in metadata. '
  'Ledger: source_type=HOST_SETTLEMENT_PAYMENT/SERVICE_SETTLEMENT_PAYMENT (not generic CASH_OUT). '
  'Non-settlement: unchanged behavior.';


-- ============================================================================
-- GUARDRAIL QUERIES (run after deploy to verify)
-- ============================================================================

-- 1. No new legacy rows (settlement_id as source_id without metadata)
-- SELECT COUNT(*) AS legacy_count
-- FROM cashflow_entries
-- WHERE source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')
--   AND is_valid_uuid(source_id) = true
--   AND (metadata IS NULL OR NOT (metadata ? 'settlement_id'))
--   AND created_at >= '2026-03-09';
-- Expected: 0

-- 2. No source_id = settlement_id (should be cash_out_id)
-- SELECT COUNT(*) AS bad_source_id_count
-- FROM cashflow_entries cf
-- WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')
--   AND is_valid_uuid(cf.source_id)
--   AND NOT EXISTS (SELECT 1 FROM cash_outs co WHERE co.id::text = cf.source_id)
--   AND EXISTS (SELECT 1 FROM host_settlements hs WHERE hs.id::text = cf.source_id)
--   AND cf.created_at >= '2026-03-09';
-- Expected: 0

-- 3. Triple-entry consistency for new settlement payments
-- SELECT
--   cf.id AS cashflow_id,
--   cf.source_id AS cash_out_source_id,
--   EXISTS(SELECT 1 FROM cash_outs co WHERE co.id::text = cf.source_id) AS has_cash_out,
--   EXISTS(SELECT 1 FROM ledger_entries le WHERE le.source_id::text = cf.source_id
--          AND le.source_type = cf.source_type) AS has_ledger,
--   cf.metadata->>'settlement_id' AS settlement_id_in_metadata
-- FROM cashflow_entries cf
-- WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')
--   AND cf.created_at >= '2026-03-09'
-- ORDER BY cf.created_at DESC;
-- Expected: has_cash_out=true, has_ledger=true, settlement_id_in_metadata != null
