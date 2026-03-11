
-- ============================================================================
-- RPC: create_ota_payout_deduction_atomic
-- Inserts a deduction into ota_payout_deductions and recalculates
-- ota_payouts.deduction_total and net_payout_amount atomically.
-- Does NOT create ledger entries (reconciliation/P&L handles that separately).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_ota_payout_deduction_atomic(
  p_payout_id UUID,
  p_amount NUMERIC,
  p_deduction_type TEXT,
  p_reason_note TEXT,
  p_unified_booking_id TEXT DEFAULT NULL,
  p_payout_detail_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_payout RECORD;
  v_deduction_id UUID;
  v_new_deduction_total NUMERIC;
  v_new_net NUMERIC;
  v_existing_id UUID;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- RBAC check
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Validate inputs
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF p_reason_note IS NULL OR trim(p_reason_note) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  -- Idempotency guard: check by deduction_type + amount + reason for same payout
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.ota_payout_deductions
    WHERE payout_id = p_payout_id
      AND deduction_type = p_deduction_type
      AND amount = p_amount
      AND reason_note = p_reason_note
      AND is_deleted = false
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'deduction_id', v_existing_id,
        'already_exists', true
      );
    END IF;
  END IF;

  -- Lock payout row
  SELECT * INTO v_payout
  FROM public.ota_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'PAYOUT_VOIDED';
  END IF;

  -- Insert deduction (amount is signed: positive=INCREASE, negative=DECREASE)
  INSERT INTO public.ota_payout_deductions (
    payout_id, payout_detail_id, unified_booking_id,
    deduction_type, amount, reason_note, created_by
  ) VALUES (
    p_payout_id, p_payout_detail_id, p_unified_booking_id,
    p_deduction_type, p_amount, trim(p_reason_note), v_user_id
  )
  RETURNING id INTO v_deduction_id;

  -- Recompute deduction_total from all active deductions
  SELECT COALESCE(SUM(amount), 0) INTO v_new_deduction_total
  FROM public.ota_payout_deductions
  WHERE payout_id = p_payout_id AND is_deleted = false;

  -- Compute new net
  v_new_net := COALESCE(v_payout.gross_amount, 0) + v_new_deduction_total;

  -- Update payout totals
  UPDATE public.ota_payouts
  SET deduction_total = v_new_deduction_total,
      net_payout_amount = v_new_net,
      total_amount = v_new_net,
      updated_at = now()
  WHERE id = p_payout_id;

  -- Audit log
  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'CREATE_PAYOUT_DEDUCTION',
    'ota_payout_deductions',
    v_deduction_id::text,
    v_user_id,
    jsonb_build_object(
      'payout_id', p_payout_id,
      'deduction_type', p_deduction_type,
      'amount', p_amount,
      'reason_note', p_reason_note,
      'new_deduction_total', v_new_deduction_total,
      'new_net_payout_amount', v_new_net
    )
  );

  RETURN jsonb_build_object(
    'deduction_id', v_deduction_id,
    'already_exists', false,
    'new_deduction_total', v_new_deduction_total,
    'new_net_payout_amount', v_new_net
  );
END;
$$;

COMMENT ON FUNCTION public.create_ota_payout_deduction_atomic IS
  'Atomically creates a payout deduction and recalculates deduction_total + net_payout_amount. '
  'Does NOT create ledger entries — that is handled by reconciliation/P&L flow separately.';
