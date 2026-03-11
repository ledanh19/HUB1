
-- 1) RPC to deactivate (soft-delete) a booking from payout
CREATE OR REPLACE FUNCTION public.deactivate_payout_detail_secure(
  p_detail_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_detail record;
  v_payout record;
  v_new_gross numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT ur.role INTO v_role FROM user_roles ur WHERE ur.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'ke_toan', 'super_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Lý do phải có ít nhất 5 ký tự';
  END IF;

  SELECT * INTO v_detail FROM ota_payout_details WHERE id = p_detail_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DETAIL_NOT_FOUND';
  END IF;
  IF NOT v_detail.is_active THEN
    RAISE EXCEPTION 'ALREADY_DEACTIVATED';
  END IF;

  SELECT * INTO v_payout FROM ota_payouts WHERE id = v_detail.payout_id FOR UPDATE;
  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'PAYOUT_VOIDED';
  END IF;
  IF v_payout.status != 'PENDING' THEN
    RAISE EXCEPTION 'PAYOUT_NOT_PENDING: Chỉ có thể xóa booking khi payout ở trạng thái PENDING';
  END IF;

  UPDATE ota_payout_details
  SET is_active = false,
      deactivated_at = now(),
      deactivated_reason = trim(p_reason)
  WHERE id = p_detail_id;

  SELECT COALESCE(SUM(expected_amount), 0) INTO v_new_gross
  FROM ota_payout_details
  WHERE payout_id = v_detail.payout_id AND is_active = true;

  UPDATE ota_payouts
  SET gross_amount = v_new_gross,
      net_payout_amount = v_new_gross + COALESCE(deduction_total, 0),
      updated_at = now()
  WHERE id = v_detail.payout_id;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'DEACTIVATE_PAYOUT_DETAIL',
    'ota_payout_details',
    p_detail_id::text,
    v_user_id,
    jsonb_build_object(
      'payout_id', v_detail.payout_id,
      'unified_booking_id', v_detail.unified_booking_id,
      'expected_amount', v_detail.expected_amount,
      'reason', trim(p_reason),
      'new_gross', v_new_gross
    )
  );

  RETURN jsonb_build_object(
    'status', 'deactivated',
    'detail_id', p_detail_id,
    'new_gross', v_new_gross
  );
END;
$$;

-- 2) Update delete_payout_deduction_secure to cascade recon items + recalculate totals
CREATE OR REPLACE FUNCTION public.delete_payout_deduction_secure(
  p_deduction_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_deduction record;
  v_payout record;
  v_new_deduction_total numeric;
  v_deleted_recon_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT ur.role INTO v_role FROM user_roles ur WHERE ur.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'ke_toan', 'super_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Lý do xóa phải có ít nhất 5 ký tự';
  END IF;

  SELECT * INTO v_deduction FROM ota_payout_deductions WHERE id = p_deduction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEDUCTION_NOT_FOUND';
  END IF;
  IF v_deduction.is_deleted THEN
    RAISE EXCEPTION 'ALREADY_DELETED';
  END IF;

  SELECT * INTO v_payout FROM ota_payouts WHERE id = v_deduction.payout_id FOR UPDATE;
  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'PAYOUT_VOIDED';
  END IF;

  UPDATE ota_payout_deductions
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_user_id,
      deleted_reason = trim(p_reason)
  WHERE id = p_deduction_id;

  -- Cascade: delete linked reconciliation items by deduction_id
  WITH deleted_recon AS (
    DELETE FROM ota_payout_reconciliation_items
    WHERE deduction_id = p_deduction_id
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_recon_count FROM deleted_recon;

  -- Fallback: match legacy data without deduction_id link
  IF v_deleted_recon_count = 0 THEN
    WITH legacy_match AS (
      DELETE FROM ota_payout_reconciliation_items
      WHERE payout_id = v_deduction.payout_id
        AND amount = v_deduction.amount
        AND note LIKE '%' || LEFT(COALESCE(v_deduction.reason_note, ''), 20) || '%'
        AND item_type = 'MANUAL_ADJUSTMENT'
      RETURNING id
    )
    SELECT count(*) INTO v_deleted_recon_count FROM legacy_match;
  END IF;

  -- Recalculate deduction_total
  SELECT COALESCE(SUM(amount), 0) INTO v_new_deduction_total
  FROM ota_payout_deductions
  WHERE payout_id = v_deduction.payout_id AND is_deleted = false;

  UPDATE ota_payouts
  SET deduction_total = v_new_deduction_total,
      net_payout_amount = gross_amount + v_new_deduction_total,
      updated_at = now()
  WHERE id = v_deduction.payout_id;

  -- Recalculate reconciliation status
  PERFORM recalculate_ota_payout_status_v2(v_deduction.payout_id, now());

  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'DELETE_PAYOUT_DEDUCTION',
    'ota_payout_deductions',
    p_deduction_id::text,
    v_user_id,
    jsonb_build_object(
      'payout_id', v_deduction.payout_id,
      'deduction_type', v_deduction.deduction_type,
      'amount', v_deduction.amount,
      'reason', trim(p_reason),
      'deleted_recon_items', v_deleted_recon_count,
      'new_deduction_total', v_new_deduction_total
    )
  );

  RETURN jsonb_build_object(
    'status', 'deleted',
    'deduction_id', p_deduction_id,
    'deleted_recon_items', v_deleted_recon_count,
    'new_deduction_total', v_new_deduction_total
  );
END;
$$;
