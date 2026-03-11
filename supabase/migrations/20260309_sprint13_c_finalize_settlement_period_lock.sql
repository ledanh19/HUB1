-- ============================================================================
-- SPRINT 13.C — Period Lock Guard in finalize_settlement_secure
-- ============================================================================
-- Date: 2026-03-09
-- Risk: M3 — finalize_settlement_secure can finalize settlements in locked periods
-- Fix:  Add is_period_locked() check before allowing DRAFT → SETTLED transition
--
-- NON-BREAKING. Signature unchanged. Only adds period lock check.
-- ============================================================================

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
  -- Sprint 13.C additions
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_economic_date DATE;
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

  -- Check settlement exists and is DRAFT (with row lock)
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

  -- ════════════════════════════════════════════════════════════════
  -- Sprint 13.C FIX: Period lock check
  -- Use settlement's business date context, fallback to CURRENT_DATE
  -- ════════════════════════════════════════════════════════════════
  v_economic_date := COALESCE(v_settlement.period_to, CURRENT_DATE);

  IF is_period_locked(v_org_id, v_economic_date) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED_FINALIZE_FORBIDDEN: Kỳ kế toán đã khóa cho ngày %. '
      'Không thể finalize settlement trong kỳ đã khóa. '
      'Liên hệ super_admin để mở khóa kỳ kế toán trước.',
      v_economic_date;
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
    jsonb_build_object(
      'status', 'SETTLED',
      'finalized_at', NOW(),
      'finalized_by', v_user_id,
      -- Sprint 13.C: include economic_date for audit trail
      'economic_date', v_economic_date,
      'period_lock_checked', true,
      'org_id', v_org_id
    )
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;

  RETURN p_settlement_id;
END;
$$;

COMMENT ON FUNCTION public.finalize_settlement_secure IS
  'Sprint 13.C: Finalize settlement DRAFT → SETTLED with period lock check. '
  'FOR UPDATE row lock. RBAC: admin/super_admin/ke_toan or page permission. '
  'Period lock uses CURRENT_DATE as economic date. Full audit trail.';


-- ============================================================================
-- ALSO PATCH close_settlement_secure with period lock
-- ============================================================================
-- Close (SETTLED → CLOSED) should also respect period lock

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
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_economic_date DATE;
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

  -- Sprint 13.C: Period lock check for close operation too
  -- Use finalized_at as canonical business date (set during finalize step)
  v_economic_date := COALESCE(v_settlement.finalized_at::date, CURRENT_DATE);

  IF is_period_locked(v_org_id, v_economic_date) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED_CLOSE_FORBIDDEN: Kỳ kế toán đã khóa cho ngày %. '
      'Không thể đóng settlement trong kỳ đã khóa.',
      v_economic_date;
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
    jsonb_build_object(
      'status', 'CLOSED',
      'economic_date', v_economic_date,
      'period_lock_checked', true,
      'org_id', v_org_id
    )
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;

  RETURN p_settlement_id;
END;
$$;

COMMENT ON FUNCTION public.close_settlement_secure IS
  'Sprint 13.C: Close settlement SETTLED → CLOSED with period lock check. '
  'FOR UPDATE row lock. RBAC: admin/super_admin/ke_toan or page permission. '
  'Period lock uses CURRENT_DATE. Full audit trail.';


-- ============================================================================
-- VERIFICATION QUERIES (run after deploy)
-- ============================================================================

-- 1. Test: finalize in locked period
-- BEGIN;
-- -- Lock current period first
-- INSERT INTO accounting_periods (org_id, period_name, period_start, period_end, is_locked, locked_at)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'Test Lock', CURRENT_DATE, CURRENT_DATE, true, now());
-- -- Try finalize — should fail
-- SELECT finalize_settlement_secure(:draft_settlement_id);
-- -- Expected: PERIOD_LOCKED_FINALIZE_FORBIDDEN
-- ROLLBACK;

-- 2. Test: finalize in unlocked period
-- -- Should succeed as before
-- SELECT finalize_settlement_secure(:draft_settlement_id);

-- 3. Audit log check
-- SELECT * FROM audit_logs
-- WHERE action = 'FINALIZE_SETTLEMENT'
-- ORDER BY event_time DESC LIMIT 5;
-- Expected: after_data contains economic_date + period_lock_checked
