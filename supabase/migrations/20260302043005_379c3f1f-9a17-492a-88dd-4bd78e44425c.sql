-- Sprint 11: Gap Closure — soft-delete deductions + ledger updated_at
-- ADDITIVE + NON-BREAKING

-- ═══════════════════════════════════════════════════════════
-- 1. Add soft-delete columns to ota_payout_deductions
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.ota_payout_deductions
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

-- ═══════════════════════════════════════════════════════════
-- 2. Add updated_at to ledger_entries + auto-update trigger
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entries_updated_at ON public.ledger_entries;
CREATE TRIGGER trg_ledger_entries_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 3. RPC: delete_payout_deduction_secure (soft-delete)
-- ═══════════════════════════════════════════════════════════
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
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- RBAC via user_roles
  SELECT ur.role INTO v_role
  FROM user_roles ur
  WHERE ur.user_id = v_user_id
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'ke_toan', 'super_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Reason required
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Lý do xóa phải có ít nhất 5 ký tự';
  END IF;

  -- Fetch deduction
  SELECT * INTO v_deduction
  FROM ota_payout_deductions
  WHERE id = p_deduction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_deduction.is_deleted THEN
    RAISE EXCEPTION 'ALREADY_DELETED';
  END IF;

  -- Fetch payout to check status
  SELECT * INTO v_payout
  FROM ota_payouts
  WHERE id = v_deduction.payout_id;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'PAYOUT_VOIDED';
  END IF;

  -- Soft-delete
  UPDATE ota_payout_deductions
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_user_id,
      deleted_reason = trim(p_reason)
  WHERE id = p_deduction_id;

  -- Audit log
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
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object('status', 'deleted', 'deduction_id', p_deduction_id);
END;
$$;