
CREATE OR REPLACE FUNCTION public.cancel_payment_request_secure(p_request_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
  v_has_cashout BOOLEAN;
  v_has_collection BOOLEAN;
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

  IF v_request.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'already_cancelled'
    );
  END IF;

  IF v_request.status NOT IN ('PENDING', 'APPROVED') THEN
    RAISE EXCEPTION 'STATUS_INVALID: Payment request % has status=%, only PENDING/APPROVED can be cancelled',
      p_request_id, v_request.status
      USING ERRCODE = 'P0003';
  END IF;

  IF v_request.status = 'APPROVED' THEN
    SELECT EXISTS(
      SELECT 1 FROM cash_outs WHERE payment_request_id = p_request_id
    ) INTO v_has_cashout;
    
    IF v_has_cashout THEN
      RAISE EXCEPTION 'HAS_CASHOUT: Không thể hủy đề xuất đã có phiếu chi. Vui lòng hủy phiếu chi trước.'
        USING ERRCODE = 'P0003';
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM hotel_collects 
      WHERE related_id = p_request_id::TEXT 
        AND related_type = 'PAYMENT_REQUEST'
    ) INTO v_has_collection;
    
    IF v_has_collection THEN
      RAISE EXCEPTION 'HAS_COLLECTION: Không thể hủy đề xuất đã có phiếu thu. Vui lòng hủy phiếu thu trước.'
        USING ERRCODE = 'P0003';
    END IF;
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
      'proposed_amount', v_request.proposed_amount,
      'previous_status', v_request.status
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'cancelled',
    'cancelled_at', now(),
    'request_code', v_request.request_code,
    'previous_status', v_request.status
  );
END;
$$;
