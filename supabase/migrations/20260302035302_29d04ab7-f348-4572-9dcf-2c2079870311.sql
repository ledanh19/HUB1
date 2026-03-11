
-- Sprint 5: Finance Hardening
-- NON-BREAKING + ADDITIVE only

-- ═══════════════════════════════════════════════════════════
-- 1) Additive columns on ota_payout_details
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.ota_payout_details
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_reason text;

-- ═══════════════════════════════════════════════════════════
-- 2) Additive columns on payment_requests
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- ═══════════════════════════════════════════════════════════
-- 3) cancel_payment_request_secure RPC
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_payment_request_secure(
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_request record;
  v_result jsonb;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập';
  END IF;

  -- RBAC check
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'ke_toan', 'super_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Bạn không có quyền hủy đề xuất thanh toán';
  END IF;

  -- Reason required
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Vui lòng nhập lý do hủy';
  END IF;

  -- Fetch request
  SELECT * INTO v_request FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy đề xuất thanh toán';
  END IF;

  -- Only PENDING can be cancelled
  IF v_request.status != 'PENDING' THEN
    RAISE EXCEPTION 'STATUS_INVALID: Chỉ đề xuất ở trạng thái Chờ duyệt mới có thể hủy (hiện tại: %)', v_request.status;
  END IF;

  -- Update status
  UPDATE public.payment_requests
  SET status = 'CANCELLED',
      cancelled_at = now(),
      cancelled_reason = trim(p_reason),
      cancelled_by = v_user_id
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'CANCEL_PAYMENT_REQUEST',
    'payment_requests',
    p_request_id::text,
    v_user_id,
    jsonb_build_object(
      'request_code', v_request.request_code,
      'reason', trim(p_reason),
      'previous_status', v_request.status,
      'cancelled_by', v_user_id
    )
  );

  v_result := jsonb_build_object(
    'request_id', p_request_id,
    'status', 'CANCELLED',
    'cancelled_at', now()
  );

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4) unlock_accounting_period_secure RPC
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unlock_accounting_period_secure(
  p_period_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_period record;
  v_result jsonb;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập';
  END IF;

  -- RBAC: only super_admin
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Chỉ Super Admin mới có quyền mở khóa kỳ kế toán';
  END IF;

  -- Reason required (min 10 chars)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Lý do mở khóa phải có ít nhất 10 ký tự';
  END IF;

  -- Fetch period
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy kỳ kế toán';
  END IF;

  IF NOT v_period.is_locked THEN
    RAISE EXCEPTION 'STATUS_INVALID: Kỳ kế toán này chưa được khóa';
  END IF;

  -- Unlock
  UPDATE public.accounting_periods
  SET is_locked = false,
      unlocked_at = now(),
      unlocked_by = v_user_id,
      note = COALESCE(note, '') || E'\n[UNLOCK ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || trim(p_reason)
  WHERE id = p_period_id;

  -- Audit log
  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'UNLOCK_ACCOUNTING_PERIOD',
    'accounting_periods',
    p_period_id::text,
    v_user_id,
    jsonb_build_object(
      'period_name', v_period.period_name,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end,
      'reason', trim(p_reason),
      'unlocked_by', v_user_id
    )
  );

  v_result := jsonb_build_object(
    'period_id', p_period_id,
    'is_locked', false,
    'unlocked_at', now()
  );

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5) Update void_ota_payout_secure to populate deactivated_at/reason
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.void_ota_payout_secure(
  p_payout_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_payout record;
  v_has_cashin boolean;
  v_detail_count int;
  v_result jsonb;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập';
  END IF;

  -- RBAC
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'ke_toan', 'super_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Bạn không có quyền hủy phiếu payout';
  END IF;

  -- Reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Vui lòng nhập lý do hủy';
  END IF;

  -- Fetch payout
  SELECT * INTO v_payout FROM public.ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy phiếu payout';
  END IF;

  -- Only PENDING can be voided
  IF v_payout.status != 'PENDING' THEN
    RAISE EXCEPTION 'STATUS_INVALID: Chỉ phiếu PENDING mới có thể hủy (hiện tại: %)', v_payout.status;
  END IF;

  -- Check no cash-in
  SELECT EXISTS(
    SELECT 1 FROM public.collection_payout_allocations WHERE payout_id = p_payout_id
  ) INTO v_has_cashin;
  IF v_has_cashin THEN
    RAISE EXCEPTION 'HAS_CASHIN: Không thể hủy phiếu đã có giao dịch tiền về. Vui lòng đảo bút toán trước.';
  END IF;

  -- Deactivate details (soft-void with Sprint 5 columns)
  UPDATE public.ota_payout_details
  SET is_active = false,
      is_voided = true,
      deactivated_at = now(),
      deactivated_reason = trim(p_reason)
  WHERE payout_id = p_payout_id AND is_active = true;
  GET DIAGNOSTICS v_detail_count = ROW_COUNT;

  -- Void payout header
  UPDATE public.ota_payouts
  SET status = 'VOIDED',
      is_voided = true,
      voided_at = now(),
      voided_by = v_user_id,
      void_reason = trim(p_reason)
  WHERE id = p_payout_id;

  -- Audit
  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'VOID_OTA_PAYOUT',
    'ota_payouts',
    p_payout_id::text,
    v_user_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'details_deactivated', v_detail_count,
      'previous_status', v_payout.status,
      'ota_source', v_payout.ota_source,
      'gross_amount', v_payout.gross_amount
    )
  );

  v_result := jsonb_build_object(
    'payout_id', p_payout_id,
    'status', 'VOIDED',
    'details_deactivated', v_detail_count
  );

  RETURN v_result;
END;
$$;
