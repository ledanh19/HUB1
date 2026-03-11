
-- ============================================================
-- VOID SETTLEMENT – Additive Migration (RE-CREATE)
-- ============================================================

ALTER TABLE public.host_settlements 
  DROP CONSTRAINT IF EXISTS host_settlements_status_check;

ALTER TABLE public.host_settlements 
  ADD CONSTRAINT host_settlements_status_check 
  CHECK (status IN ('DRAFT', 'PARTIALLY_PAID', 'SETTLED', 'CLOSED', 'VOID'));

ALTER TABLE public.host_settlements 
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_host_settlements_status 
  ON public.host_settlements(status);

CREATE INDEX IF NOT EXISTS idx_host_settlements_voided_at 
  ON public.host_settlements(voided_at) WHERE voided_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.void_settlement_secure(
  p_settlement_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_settlement RECORD;
  v_audit_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cashout_count INTEGER;
  v_pr_cancelled_count INTEGER;
  v_seg_unlocked_count INTEGER;
  v_ec_unlocked_count INTEGER;
  v_sc_unlocked_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  v_has_permission := has_page_use_access('/host-payables/settlement');

  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền hủy quyết toán Settlement';
  END IF;

  SELECT * INTO v_settlement
  FROM host_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy Settlement';
  END IF;

  IF v_settlement.status = 'VOID' THEN
    RETURN p_settlement_id;
  END IF;

  IF v_settlement.status != 'SETTLED' THEN
    RAISE EXCEPTION 'Chỉ có thể hủy quyết toán ở trạng thái SETTLED (hiện tại: %)', v_settlement.status;
  END IF;

  IF COALESCE(v_settlement.total_paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Không thể hủy: đã có thanh toán (total_paid_amount = %)', v_settlement.total_paid_amount;
  END IF;

  SELECT COUNT(*) INTO v_cashout_count
  FROM payment_requests pr
  JOIN cash_outs co ON co.payment_request_id = pr.id
  WHERE pr.settlement_id = p_settlement_id
    AND COALESCE(pr.payment_type, '') IN ('HOST_PAYMENT', 'SERVICE_PARTNER_PAYMENT');

  IF v_cashout_count > 0 THEN
    RAISE EXCEPTION 'Không thể hủy: đã có % phiếu chi tiền liên kết. Phải hủy phiếu chi trước.', v_cashout_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cashflow_entries
    WHERE source_type = 'HOST_SETTLEMENT_PAYMENT'
      AND source_id = p_settlement_id::TEXT
      AND direction = 'OUT'
  ) THEN
    RAISE EXCEPTION 'Không thể hủy: đã có bút toán thanh toán trong cashflow_entries. Kiểm tra lại dữ liệu.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_period_locked') THEN
    IF is_period_locked(v_org_id, COALESCE(v_settlement.finalized_at::DATE, CURRENT_DATE)) THEN
      RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể hủy quyết toán.';
    END IF;
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Phải nhập lý do hủy quyết toán';
  END IF;

  UPDATE host_settlements
  SET 
    status = 'VOID',
    voided_at = NOW(),
    voided_by = v_user_id,
    void_reason = TRIM(p_reason)
  WHERE id = p_settlement_id;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'VOID_SETTLEMENT',
    'host_settlements',
    p_settlement_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'status', v_settlement.status,
      'finalized_at', v_settlement.finalized_at,
      'total_paid_amount', v_settlement.total_paid_amount,
      'settlement_code', v_settlement.settlement_code
    ),
    jsonb_build_object(
      'status', 'VOID',
      'voided_at', NOW(),
      'voided_by', v_user_id,
      'void_reason', TRIM(p_reason)
    )
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed – transaction rolled back';
  END IF;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  SELECT 
    'VOID_SETTLEMENT_CASCADE_PR',
    'payment_requests',
    pr.id::TEXT,
    v_user_id,
    jsonb_build_object('status', pr.status, 'settlement_id', pr.settlement_id),
    jsonb_build_object('status', 'CANCELLED', 'void_settlement_id', p_settlement_id)
  FROM payment_requests pr
  WHERE pr.settlement_id = p_settlement_id
    AND pr.status NOT IN ('CANCELLED', 'REJECTED');

  UPDATE payment_requests
  SET status = 'CANCELLED'
  WHERE settlement_id = p_settlement_id
    AND status NOT IN ('CANCELLED', 'REJECTED');

  GET DIAGNOSTICS v_pr_cancelled_count = ROW_COUNT;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  SELECT 
    'VOID_SETTLEMENT_UNLOCK_SEGMENT',
    'host_supply_segments',
    seg.id::TEXT,
    v_user_id,
    jsonb_build_object('settlement_id', seg.settlement_id, 'locked_at', seg.locked_at),
    jsonb_build_object('settlement_id', NULL, 'locked_at', NULL, 'void_settlement_id', p_settlement_id)
  FROM host_supply_segments seg
  WHERE seg.settlement_id = p_settlement_id;

  UPDATE host_supply_segments
  SET settlement_id = NULL, locked_at = NULL
  WHERE settlement_id = p_settlement_id;

  GET DIAGNOSTICS v_seg_unlocked_count = ROW_COUNT;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  SELECT 
    'VOID_SETTLEMENT_UNLOCK_EXTRA_CHARGE',
    'host_extra_charges',
    ec.id::TEXT,
    v_user_id,
    jsonb_build_object('settlement_id', ec.settlement_id, 'locked_at', ec.locked_at),
    jsonb_build_object('settlement_id', NULL, 'locked_at', NULL, 'void_settlement_id', p_settlement_id)
  FROM host_extra_charges ec
  WHERE ec.settlement_id = p_settlement_id;

  UPDATE host_extra_charges
  SET settlement_id = NULL, locked_at = NULL
  WHERE settlement_id = p_settlement_id;

  GET DIAGNOSTICS v_ec_unlocked_count = ROW_COUNT;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  SELECT 
    'VOID_SETTLEMENT_UNLOCK_SURCHARGE',
    'host_surcharges',
    sc.id::TEXT,
    v_user_id,
    jsonb_build_object('settlement_id', sc.settlement_id, 'locked_at', sc.locked_at),
    jsonb_build_object('settlement_id', NULL, 'locked_at', NULL, 'void_settlement_id', p_settlement_id)
  FROM host_surcharges sc
  WHERE sc.settlement_id = p_settlement_id;

  UPDATE host_surcharges
  SET settlement_id = NULL, locked_at = NULL
  WHERE settlement_id = p_settlement_id;

  GET DIAGNOSTICS v_sc_unlocked_count = ROW_COUNT;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'VOID_SETTLEMENT_SUMMARY',
    'host_settlements',
    p_settlement_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'settlement_code', v_settlement.settlement_code,
      'partner_id', v_settlement.partner_id,
      'reason', TRIM(p_reason),
      'payment_requests_cancelled', v_pr_cancelled_count,
      'segments_unlocked', v_seg_unlocked_count,
      'extra_charges_unlocked', v_ec_unlocked_count,
      'surcharges_unlocked', v_sc_unlocked_count
    )
  );

  RETURN p_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_settlement_secure(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.void_settlement_secure IS 
'Server-authoritative RPC for voiding a SETTLED settlement that has no payments disbursed.
Guards: status=SETTLED, total_paid_amount=0, no cash_outs, period not locked.
Cascade: cancels payment_requests, unlocks segments/charges/surcharges.
Idempotent: if already VOID returns success without duplicate audit.
Audit: fail-fast pattern – all actions logged with before/after snapshots.';
