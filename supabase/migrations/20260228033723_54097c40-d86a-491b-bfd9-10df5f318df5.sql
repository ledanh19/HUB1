
-- ============================================================================
-- REFUND FINANCIAL HARDENING — Enterprise-grade Unified Refund Engine
-- ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================================================

-- ─── 1. OTA_COLLECT REFUND GUARD ────────────────────────────────────────────
-- Prevents direct refund for OTA_COLLECT bookings (must go via payout adjustment)

CREATE OR REPLACE FUNCTION public.create_collection_ledger_atomic(
  p_unified_booking_id text,
  p_amount numeric,
  p_payment_method text,
  p_collection_type text,
  p_related_type text,
  p_payer_type text,
  p_related_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_related_collection_id uuid DEFAULT NULL,
  p_reason_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_collection_id UUID;
  v_user_id UUID;
  v_cash_account_id UUID;
  v_direction TEXT;
  v_ledger_entry_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_entry_date DATE := CURRENT_DATE;
  v_payment_type TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be positive';
  END IF;
  
  -- Validate collection_type
  IF p_collection_type NOT IN ('COLLECT', 'REFUND') THEN
    RAISE EXCEPTION 'Invalid collection_type: %. Must be COLLECT or REFUND', p_collection_type;
  END IF;
  
  -- *** Check period lock ***
  IF is_period_locked(v_org_id, v_entry_date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo thu tiền cho ngày %', v_entry_date;
  END IF;
  
  -- *** PHASE E: OTA_COLLECT double-impact guard ***
  IF p_collection_type = 'REFUND' THEN
    SELECT bm.payment_type INTO v_payment_type
    FROM bookings_mirror bm
    WHERE bm.unified_booking_id = p_unified_booking_id
    LIMIT 1;
    
    IF v_payment_type = 'OTA_COLLECT' THEN
      -- Check if payout adjustment already exists for this booking
      IF EXISTS (
        SELECT 1 
        FROM ota_payout_details opd
        JOIN ota_payout_reconciliation_items ri ON ri.payout_id = opd.payout_id
        WHERE opd.unified_booking_id = p_unified_booking_id
          AND ri.item_type IN ('DISPUTE', 'MANUAL_ADJUSTMENT', 'UNDERPAYMENT')
          AND ri.ledger_entry_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'OTA_COLLECT booking đã có điều chỉnh qua OTA Payout. Hoàn tiền phải xử lý qua module OTA Payout Reconciliation để tránh tính trùng.';
      END IF;
    END IF;
  END IF;
  
  -- *** Over-refund protection ***
  IF p_collection_type = 'REFUND' AND p_related_collection_id IS NOT NULL THEN
    DECLARE
      v_original_amount NUMERIC;
      v_total_refunded NUMERIC;
    BEGIN
      SELECT amount_collected INTO v_original_amount
      FROM hotel_collects WHERE id = p_related_collection_id;
      
      SELECT COALESCE(SUM(ABS(amount_collected)), 0) INTO v_total_refunded
      FROM hotel_collects
      WHERE related_collection_id = p_related_collection_id AND collection_type = 'REFUND';
      
      IF (v_total_refunded + p_amount) > ABS(v_original_amount) THEN
        RAISE EXCEPTION 'Số tiền hoàn (% + %) vượt quá số tiền gốc (%). Không thể hoàn thêm.',
          v_total_refunded, p_amount, ABS(v_original_amount);
      END IF;
    END;
  END IF;
  
  -- Insert hotel_collect
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    collection_type, related_type, related_id, payer_type,
    note, collected_by, payee_type, status,
    related_collection_id, reason_note
  )
  VALUES (
    p_unified_booking_id, 
    CASE WHEN p_collection_type = 'REFUND' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_method,
    p_collection_type, p_related_type, p_related_id, p_payer_type,
    p_note, v_user_id, 'ROOMRISE',
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTED' ELSE 'REFUNDED' END,
    p_related_collection_id, p_reason_note
  )
  RETURNING id INTO v_collection_id;
  
  -- Create cashflow entry
  INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
  VALUES (
    v_entry_date,
    p_amount,
    CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
    'HOTEL_COLLECT',
    v_collection_id,
    p_payer_type,
    CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tiền (atomic)' ELSE 'Hoàn tiền (atomic)' END,
    v_user_id
  );
  
  -- Resolve cash account via mapping rules
  v_direction := CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END;
  v_cash_account_id := resolve_account_mapping(
    CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
    'HOTEL_COLLECT',
    p_payment_method,
    p_payer_type
  );
  
  -- Create ledger entry using idempotent function
  v_ledger_entry_id := post_ledger_entry_idempotent(
    p_source_type := 'HOTEL_COLLECT',
    p_source_id := v_collection_id, 
    p_cash_account_id := v_cash_account_id, 
    p_direction := v_direction, 
    p_amount := p_amount, 
    p_entry_date := v_entry_date,
    p_counterparty_type := p_payer_type,
    p_counterparty_id := NULL,
    p_note := CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tiền' ELSE 'Hoàn tiền' END,
    p_org_id := v_org_id
  );
  
  -- *** Save ledger_entry_id back to hotel_collects ***
  UPDATE hotel_collects
  SET ledger_entry_id = v_ledger_entry_id
  WHERE id = v_collection_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTION_CREATED' ELSE 'REFUND_CREATED' END,
    'hotel_collects',
    v_collection_id,
    v_user_id,
    jsonb_build_object(
      'unified_booking_id', p_unified_booking_id,
      'amount', p_amount,
      'collection_type', p_collection_type,
      'payment_method', p_payment_method,
      'ledger_entry_id', v_ledger_entry_id,
      'payment_type_guard', v_payment_type
    )
  );
  
  RETURN v_collection_id;
END;
$function$;


-- ─── 2. APPROVAL REFUND RPC ────────────────────────────────────────────────
-- Used when admin approves a refund request - ensures ledger entry is created

CREATE OR REPLACE FUNCTION public.approve_refund_with_ledger_atomic(
  p_approval_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_approval RECORD;
  v_payload JSONB;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_collection_id UUID;
  v_original_collection_id UUID;
  v_unified_booking_id TEXT;
  v_amount NUMERIC;
  v_payment_method TEXT;
  v_reason_note TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Permission check
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: only admin or ke_toan can approve refunds';
  END IF;
  
  -- Get approval
  SELECT * INTO v_approval FROM approvals WHERE id = p_approval_id;
  IF v_approval IS NULL THEN
    RAISE EXCEPTION 'Approval % not found', p_approval_id;
  END IF;
  IF v_approval.status != 'PENDING' THEN
    RAISE EXCEPTION 'Approval is not PENDING (current: %)', v_approval.status;
  END IF;
  
  -- Extract payload
  v_payload := v_approval.request_payload;
  v_original_collection_id := (v_payload->>'original_collection_id')::uuid;
  v_unified_booking_id := v_payload->>'unified_booking_id';
  v_amount := (v_payload->>'amount')::numeric;
  v_payment_method := v_payload->>'payment_method';
  v_reason_note := '[Đã duyệt] ' || COALESCE(v_payload->>'reason_note', '');
  
  -- Create refund via atomic RPC (creates ledger + cashflow + audit)
  v_collection_id := create_collection_ledger_atomic(
    p_unified_booking_id := v_unified_booking_id,
    p_amount := v_amount,
    p_payment_method := v_payment_method,
    p_collection_type := 'REFUND',
    p_related_type := 'ROOM',
    p_payer_type := 'GUEST',
    p_related_id := NULL,
    p_note := v_reason_note,
    p_related_collection_id := v_original_collection_id,
    p_reason_note := v_reason_note
  );
  
  -- Handle NO_SHOW snapshot (same as before, non-blocking)
  BEGIN
    DECLARE
      v_snapshot RECORD;
    BEGIN
      SELECT id, revenue_posted, ledger_entry_id INTO v_snapshot
      FROM no_show_financial_snapshots
      WHERE unified_booking_id = v_unified_booking_id
        AND removed_at IS NULL
      LIMIT 1;
      
      IF v_snapshot.id IS NOT NULL THEN
        IF v_snapshot.revenue_posted AND v_snapshot.ledger_entry_id IS NOT NULL THEN
          PERFORM reverse_ledger_entry(
            v_snapshot.ledger_entry_id,
            format('Refund for NO_SHOW booking: %s', v_unified_booking_id)
          );
          UPDATE no_show_financial_snapshots
          SET charge_status = 'REFUNDED', refund_amount = v_amount,
              updated_at = now()
          WHERE id = v_snapshot.id;
        ELSE
          UPDATE no_show_financial_snapshots
          SET charge_status = 'REFUNDED', refund_amount = v_amount,
              updated_at = now()
          WHERE id = v_snapshot.id;
        END IF;
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN NULL; -- non-blocking
  END;
  
  -- Update approval status
  UPDATE approvals
  SET status = 'APPROVED',
      approved_by = v_user_id,
      approved_at = now(),
      note = p_note
  WHERE id = p_approval_id;
  
  -- Audit
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'REFUND_APPROVED',
    'approvals',
    p_approval_id,
    v_user_id,
    jsonb_build_object(
      'refund_collection_id', v_collection_id,
      'amount', v_amount,
      'unified_booking_id', v_unified_booking_id
    )
  );
  
  RETURN jsonb_build_object(
    'approval_id', p_approval_id,
    'refund_collection_id', v_collection_id,
    'amount', v_amount,
    'status', 'APPROVED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_refund_with_ledger_atomic(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.approve_refund_with_ledger_atomic IS
  'Atomically approve a refund request: creates hotel_collect + cashflow + ledger entry in single transaction. Prevents orphaned refunds without ledger.';
