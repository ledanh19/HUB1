
-- ============================================================================
-- SPRINT 13C — FINALIZE/CLOSE SETTLEMENT: PERIOD LOCK GUARD
-- ============================================================================
-- Adds is_period_locked() check before finalize and close operations.
-- Uses settlement's period_from as the reference date for lock check.
-- NON-BREAKING: same signatures, additive guard only.
-- ============================================================================

-- 13C.1 — FINALIZE SETTLEMENT with period lock guard
CREATE OR REPLACE FUNCTION public.finalize_settlement_secure(
  p_settlement_id UUID
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
  v_org_id UUID := '00000000-0000-0000-0000-000000000000'::UUID;
BEGIN
  -- Get current user (server-authoritative)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  -- Check can_use permission for /host-payables/settlement
  v_has_permission := has_page_use_access('/host-payables/settlement');

  -- Also allow admin/super_admin/ke_toan role
  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền quyết toán Settlement';
  END IF;

  -- Check settlement exists and is DRAFT
  SELECT * INTO v_settlement
  FROM host_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy Settlement';
  END IF;

  IF v_settlement.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Settlement không ở trạng thái DRAFT (status: %)', v_settlement.status;
  END IF;

  -- ★ SPRINT 13C: Period lock guard
  IF is_period_locked(v_org_id, v_settlement.period_from::TEXT) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED_FINALIZE_FORBIDDEN: Kỳ kế toán chứa ngày % đã bị khóa. Không thể quyết toán.', v_settlement.period_from
      USING ERRCODE = 'P0005';
  END IF;

  -- Update to SETTLED
  UPDATE host_settlements
  SET 
    status = 'SETTLED',
    finalized_at = NOW(),
    finalized_by = v_user_id
  WHERE id = p_settlement_id;

  -- Audit log - FAIL FAST if insert fails
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'FINALIZE_SETTLEMENT', 
    'host_settlements', 
    p_settlement_id::TEXT, 
    v_user_id, 
    row_to_json(v_settlement),
    jsonb_build_object('status', 'SETTLED', 'finalized_at', NOW(), 'finalized_by', v_user_id, 'sprint13c_period_guard', true)
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;

  RETURN p_settlement_id;
END;
$$;

-- 13C.2 — CLOSE SETTLEMENT with period lock guard
CREATE OR REPLACE FUNCTION public.close_settlement_secure(
  p_settlement_id UUID
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
  v_org_id UUID := '00000000-0000-0000-0000-000000000000'::UUID;
BEGIN
  -- Get current user (server-authoritative)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  -- Check can_use permission for /host-payables/settlement
  v_has_permission := has_page_use_access('/host-payables/settlement');

  -- Also allow admin/super_admin/ke_toan role
  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền đóng kỳ Settlement';
  END IF;

  -- Check settlement exists and is SETTLED
  SELECT * INTO v_settlement
  FROM host_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy Settlement';
  END IF;

  IF v_settlement.status != 'SETTLED' THEN
    RAISE EXCEPTION 'Settlement không ở trạng thái SETTLED (status: %)', v_settlement.status;
  END IF;

  -- ★ SPRINT 13C: Period lock guard
  IF is_period_locked(v_org_id, v_settlement.period_from::TEXT) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED_CLOSE_FORBIDDEN: Kỳ kế toán chứa ngày % đã bị khóa. Không thể đóng settlement.', v_settlement.period_from
      USING ERRCODE = 'P0005';
  END IF;

  -- Update to CLOSED
  UPDATE host_settlements
  SET status = 'CLOSED'
  WHERE id = p_settlement_id;

  -- Audit log - FAIL FAST if insert fails
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'CLOSE_SETTLEMENT', 
    'host_settlements', 
    p_settlement_id::TEXT, 
    v_user_id, 
    row_to_json(v_settlement),
    jsonb_build_object('status', 'CLOSED', 'sprint13c_period_guard', true)
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;

  RETURN p_settlement_id;
END;
$$;

COMMENT ON FUNCTION public.finalize_settlement_secure IS
  'Sprint 13C: adds is_period_locked() guard before DRAFT→SETTLED. FOR UPDATE row lock preserved.';

COMMENT ON FUNCTION public.close_settlement_secure IS
  'Sprint 13C: adds is_period_locked() guard before SETTLED→CLOSED. FOR UPDATE row lock preserved.';
