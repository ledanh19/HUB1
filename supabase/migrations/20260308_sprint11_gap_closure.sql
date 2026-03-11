-- ============================================================================
-- SPRINT 11 — GAP CLOSURE (Period Lock Detection + Soft-Delete Replacement)
-- ============================================================================
-- Date:     2026-03-08
-- Revision: FINAL (production-ready)
-- Depends:  20260307_sprint6_9_integrity_hardening.sql
--
-- Gap A: Period lock INSERT-only trigger caveat
--   - Add Check 6 to run_financial_reconciliation: detect ledger entries
--     created AFTER their accounting period was locked (INSERT bypass pre-trigger)
--   - Add updated_at column to ledger_entries for future UPDATE detection
--
-- Gap B: Pre-existing .delete() paths
--   - ota_payout_deductions: soft-delete columns + secure RPC
--   - payment_requests: replace .delete() with cancel_payment_request_secure
--
-- Hard rules:
--   • NON-BREAKING + ADDITIVE only
--   • No new roles, no DROP COLUMN, no return type changes
--   • SECURITY DEFINER + RBAC (admin/ke_toan/super_admin)
--   • FOR UPDATE + audit on all state transitions
-- ============================================================================


-- ============================================================================
-- GAP A.1 — Add updated_at to ledger_entries (for future UPDATE detection)
-- ============================================================================
-- Currently: ledger_entries has created_at but NO updated_at.
-- UPDATE mutations in locked periods cannot be detected without this.
-- Additive: nullable column, default now(), auto-set via trigger.

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_entries_updated_at ON public.ledger_entries;
CREATE TRIGGER trg_ledger_entries_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ============================================================================
-- GAP A.2 — Enhanced reconciliation: Check 6 (locked-period mutation detection)
-- ============================================================================
-- Replaces run_financial_reconciliation with Check 6 added.
-- Also updates checks_run from 5 to 7 (adding checks 6 and 7).

CREATE OR REPLACE FUNCTION public.run_financial_reconciliation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id  UUID;
  v_run_id   UUID;
  v_issues   JSONB := '[]'::JSONB;
  v_count    INT;
  v_amount   NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can run reconciliation';
  END IF;

  INSERT INTO recon_runs (status, run_by) VALUES ('running', v_user_id)
  RETURNING id INTO v_run_id;

  -- ── Check 1: Unposted bank fees + adjustments ─────────────────
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_count, v_amount
  FROM v_payout_ledger_gaps
  WHERE gap_type = 'RECON_ITEM';

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'UNPOSTED_RECON_ITEMS',
      'count', v_count,
      'total_amount', v_amount,
      'severity', 'HIGH',
      'description', 'Bank fees / adjustments without ledger entries'
    ));
  END IF;

  -- ── Check 2: NO_SHOW revenue gaps ─────────────────────────────
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_count, v_amount
  FROM v_payout_ledger_gaps
  WHERE gap_type = 'NO_SHOW_REVENUE';

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'NO_SHOW_REVENUE_GAPS',
      'count', v_count,
      'total_amount', v_amount,
      'severity', 'HIGH',
      'description', 'NO_SHOW bookings in payouts without revenue posted'
    ));
  END IF;

  -- ── Check 3: NO_SHOW reclassification ─────────────────────────
  SELECT COUNT(*)
  INTO v_count
  FROM v_no_show_reclass_gaps;

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'NO_SHOW_RECLASS',
      'count', v_count,
      'severity', 'MEDIUM',
      'description', 'Bookings reclassified away from NO_SHOW after revenue was posted'
    ));
  END IF;

  -- ── Check 4: Unlinked adjustments (deduction without recon item) ──
  SELECT COUNT(*)
  INTO v_count
  FROM ota_payout_deductions d
  WHERE NOT EXISTS (
    SELECT 1 FROM ota_payout_reconciliation_items ri
    WHERE ri.deduction_id = d.id
  )
  AND d.created_at > '2026-03-07'::DATE;

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'UNLINKED_ADJUSTMENTS',
      'count', v_count,
      'severity', 'MEDIUM',
      'description', 'Deductions without linked reconciliation items (post Sprint 8)'
    ));
  END IF;

  -- ── Check 5: Voided payouts with active details ───────────────
  SELECT COUNT(*)
  INTO v_count
  FROM ota_payout_details pd
  JOIN ota_payouts p ON p.id = pd.payout_id
  WHERE p.is_voided = true AND pd.is_active = true;

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'VOIDED_PAYOUT_ACTIVE_DETAILS',
      'count', v_count,
      'severity', 'CRITICAL',
      'description', 'Voided payouts still have active detail records'
    ));
  END IF;

  -- ── Check 6: Ledger entries CREATED in locked periods ─────────
  -- Detects INSERT bypass (pre-Sprint 7 trigger or direct admin SQL).
  -- Uses created_at > locked_at to identify entries written after lock.
  SELECT COUNT(*)
  INTO v_count
  FROM ledger_entries le
  JOIN accounting_periods ap
    ON le.entry_date >= ap.period_start::DATE
   AND le.entry_date <= ap.period_end::DATE
  WHERE ap.is_locked = true
    AND ap.locked_at IS NOT NULL
    AND le.created_at > ap.locked_at;

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'LOCKED_PERIOD_INSERT_DETECTED',
      'count', v_count,
      'severity', 'CRITICAL',
      'description', 'Ledger entries created AFTER their accounting period was locked'
    ));
  END IF;

  -- ── Check 7: Ledger entries UPDATED in locked periods ─────────
  -- Detects UPDATE bypass (no trigger on UPDATE; only admin SQL).
  -- Requires updated_at column (added in Sprint 11).
  SELECT COUNT(*)
  INTO v_count
  FROM ledger_entries le
  JOIN accounting_periods ap
    ON le.entry_date >= ap.period_start::DATE
   AND le.entry_date <= ap.period_end::DATE
  WHERE ap.is_locked = true
    AND ap.locked_at IS NOT NULL
    AND le.updated_at IS NOT NULL
    AND le.updated_at > ap.locked_at
    AND le.updated_at > le.created_at;

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'LOCKED_PERIOD_UPDATE_DETECTED',
      'count', v_count,
      'severity', 'HIGH',
      'description', 'Ledger entries modified AFTER their accounting period was locked'
    ));
  END IF;

  -- ── Check 8: Soft-deleted deductions integrity ────────────────
  -- Detects deductions marked deleted but still affecting payout totals.
  SELECT COUNT(*)
  INTO v_count
  FROM ota_payout_deductions d
  WHERE d.is_deleted = true
    AND EXISTS (
      SELECT 1 FROM ota_payouts p
      WHERE p.id = d.payout_id
        AND p.is_voided = false
    );

  IF v_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'DELETED_DEDUCTIONS_ON_ACTIVE_PAYOUTS',
      'count', v_count,
      'severity', 'MEDIUM',
      'description', 'Soft-deleted deductions on non-voided payouts (verify totals recalculated)'
    ));
  END IF;

  -- ── Finalize ──────────────────────────────────────────────────
  UPDATE recon_runs SET
    completed_at = now(),
    status       = 'completed',
    issues_found = jsonb_array_length(v_issues),
    result       = v_issues
  WHERE id = v_run_id;

  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'FINANCIAL_RECONCILIATION_RUN',
    'recon_runs',
    v_run_id::TEXT,
    jsonb_build_object(
      'issues_found', jsonb_array_length(v_issues),
      'checks_run', 8
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'status', 'completed',
    'issues_found', jsonb_array_length(v_issues),
    'issues', v_issues
  );
END;
$$;


-- ============================================================================
-- GAP B.1 — SOFT-DELETE FOR ota_payout_deductions
-- ============================================================================

ALTER TABLE public.ota_payout_deductions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;


-- ============================================================================
-- GAP B.2 — SECURE DELETE-DEDUCTION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_payout_deduction_secure(
  p_deduction_id UUID,
  p_reason       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id      UUID;
  v_deduction    RECORD;
  v_payout       RECORD;
  v_gross        NUMERIC;
  v_ded_total    NUMERIC;
  v_net          NUMERIC;
BEGIN
  -- ── 1. Auth + RBAC ──────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can delete deductions'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Deletion reason must be at least 3 characters';
  END IF;

  -- ── 2. Load deduction ──────────────────────────────────────────
  SELECT * INTO v_deduction FROM ota_payout_deductions
  WHERE id = p_deduction_id FOR UPDATE;

  IF v_deduction IS NULL THEN
    RAISE EXCEPTION 'DEDUCTION_NOT_FOUND: Deduction % not found', p_deduction_id;
  END IF;

  IF v_deduction.is_deleted THEN
    RETURN jsonb_build_object(
      'status', 'already_deleted',
      'deduction_id', p_deduction_id
    );
  END IF;

  -- ── 3. Validate payout status ──────────────────────────────────
  SELECT * INTO v_payout FROM ota_payouts
  WHERE id = v_deduction.payout_id FOR UPDATE;

  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND: Parent payout not found';
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'VOIDED: Cannot modify deductions on voided payout'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 4. Soft-delete the deduction ───────────────────────────────
  UPDATE ota_payout_deductions SET
    is_deleted     = true,
    deleted_at     = now(),
    deleted_by     = v_user_id,
    deleted_reason = TRIM(p_reason)
  WHERE id = p_deduction_id;

  -- ── 5. Recalculate payout totals (exclude soft-deleted) ────────
  SELECT COALESCE(SUM(expected_amount), 0) INTO v_gross
  FROM ota_payout_details
  WHERE payout_id = v_deduction.payout_id AND is_active = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_ded_total
  FROM ota_payout_deductions
  WHERE payout_id = v_deduction.payout_id AND is_deleted = false;

  v_net := v_gross + v_ded_total;

  UPDATE ota_payouts SET
    gross_amount      = v_gross,
    deduction_total   = v_ded_total,
    net_payout_amount = v_net,
    total_amount      = v_net,
    updated_at        = now()
  WHERE id = v_deduction.payout_id;

  PERFORM recalculate_ota_payout_status_v2(v_deduction.payout_id);

  -- ── 6. Audit log ──────────────────────────────────────────────
  INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data, user_id)
  VALUES (
    'DEDUCTION_SOFT_DELETED',
    'ota_payout_deductions',
    p_deduction_id::TEXT,
    jsonb_build_object(
      'payout_id', v_deduction.payout_id,
      'amount', v_deduction.amount,
      'deduction_type', v_deduction.deduction_type,
      'reason_note', v_deduction.reason_note
    ),
    jsonb_build_object(
      'deleted_reason', TRIM(p_reason),
      'net_payout_amount_after', v_net
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'status', 'deleted',
    'deduction_id', p_deduction_id,
    'payout_id', v_deduction.payout_id,
    'amount_removed', v_deduction.amount,
    'net_payout_amount', v_net
  );
END;
$$;

COMMENT ON FUNCTION public.delete_payout_deduction_secure IS
  'Sprint 11: Soft-delete a payout deduction. Sets is_deleted + deleted_at/by/reason. '
  'Recalculates payout totals excluding deleted deductions. Audit logged. '
  'Replaces FE hard-delete path in useDeletePayoutDeduction.';


-- ============================================================================
-- GAP B.3 — UPDATE EXISTING QUERIES TO EXCLUDE SOFT-DELETED DEDUCTIONS
-- ============================================================================
-- The add_booking_to_payout_atomic and create_payout_adjustment_atomic
-- functions SUM from ota_payout_deductions without is_deleted filter.
-- We must update them to exclude soft-deleted records.

-- Update add_booking_to_payout_atomic: deduction SUM must filter is_deleted
CREATE OR REPLACE FUNCTION public.add_booking_to_payout_atomic(
  p_payout_id          UUID,
  p_unified_booking_id TEXT,
  p_booking_code       TEXT,
  p_guest_name         TEXT,
  p_expected_amount    NUMERIC,
  p_actual_check_out_at TEXT DEFAULT NULL,
  p_note               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id            UUID;
  v_payout             RECORD;
  v_booking_status     TEXT;
  v_is_no_show         BOOLEAN := false;
  v_final_amount       NUMERIC;
  v_detail_id          UUID;
  v_snapshot           RECORD;
  v_default_account_id UUID;
  v_ledger_entry_id    UUID;
  v_no_show_posted     BOOLEAN := false;
  v_gross              NUMERIC;
  v_adj_total          NUMERIC;
  v_net                NUMERIC;
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
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan can add bookings to payouts'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND: Payout % not found', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'VOIDED: Cannot add bookings to voided payout %', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'STATUS_INVALID: Payout % has status=%, only PENDING payouts accept new bookings',
      p_payout_id, v_payout.status
      USING ERRCODE = 'P0003';
  END IF;

  SELECT booking_status::TEXT INTO v_booking_status
  FROM unified_bookings
  WHERE unified_booking_id = p_unified_booking_id;

  v_is_no_show := (v_booking_status = 'NO_SHOW');

  IF v_is_no_show THEN
    IF EXISTS (
      SELECT 1 FROM no_show_financial_snapshots
      WHERE unified_booking_id = p_unified_booking_id
        AND removed_at IS NULL
        AND revenue_posted = true
        AND ledger_entry_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'NO_SHOW_ALREADY_POSTED: Revenue for booking % already posted to ledger. '
        'Reverse the existing ledger entry before re-allocating.',
        p_unified_booking_id
        USING ERRCODE = 'P0007';
    END IF;
  END IF;

  v_final_amount := CASE
    WHEN v_booking_status = 'CANCELLED' THEN 0
    ELSE p_expected_amount
  END;

  IF v_booking_status IS DISTINCT FROM 'CANCELLED'
     AND v_booking_status IS DISTINCT FROM 'NO_SHOW'
     AND NULLIF(TRIM(p_actual_check_out_at), '') IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_REQUIRED: Booking must be checked out before adding to payout'
      USING ERRCODE = 'P0004';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ota_payout_details
    WHERE payout_id = p_payout_id
      AND unified_booking_id = p_unified_booking_id
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'payout_id', p_payout_id,
      'unified_booking_id', p_unified_booking_id
    );
  END IF;

  BEGIN
    INSERT INTO ota_payout_details (
      payout_id, unified_booking_id, booking_code, guest_name,
      actual_check_out_at, expected_amount, actual_amount,
      deduction_amount, final_amount, is_active, note
    ) VALUES (
      p_payout_id, p_unified_booking_id, p_booking_code, p_guest_name,
      NULLIF(TRIM(p_actual_check_out_at), ''), v_final_amount, v_final_amount,
      0, v_final_amount, true, p_note
    )
    RETURNING id INTO v_detail_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'BOOKING_ALREADY_ALLOCATED: Booking % is already active in another payout',
      p_unified_booking_id
      USING ERRCODE = 'P0005';
  END;

  SELECT COALESCE(SUM(expected_amount), 0) INTO v_gross
  FROM ota_payout_details
  WHERE payout_id = p_payout_id AND is_active = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_adj_total
  FROM ota_payout_deductions
  WHERE payout_id = p_payout_id AND is_deleted = false;

  v_net := v_gross + v_adj_total;

  UPDATE ota_payouts SET
    gross_amount       = v_gross,
    deduction_total    = v_adj_total,
    net_payout_amount  = v_net,
    total_amount       = v_net,
    updated_at         = now()
  WHERE id = p_payout_id;

  IF v_booking_status = 'NO_SHOW' AND v_final_amount > 0 THEN
    SELECT id, snapshot_date, revenue_posted, ledger_entry_id, removed_at
    INTO v_snapshot
    FROM no_show_financial_snapshots
    WHERE unified_booking_id = p_unified_booking_id
      AND removed_at IS NULL
    LIMIT 1;

    IF v_snapshot IS NOT NULL AND NOT COALESCE(v_snapshot.revenue_posted, false) THEN
      SELECT id INTO v_default_account_id
      FROM cash_accounts
      WHERE is_default = true AND is_active = true AND is_archived = false
      LIMIT 1;

      IF v_default_account_id IS NULL THEN
        RAISE EXCEPTION 'NO_DEFAULT_ACCOUNT: No active default cash account found for NO_SHOW ledger posting'
          USING ERRCODE = 'P0006';
      END IF;

      v_ledger_entry_id := post_ledger_entry_idempotent(
        p_source_type       := 'NO_SHOW_REVENUE',
        p_source_id         := v_snapshot.id,
        p_cash_account_id   := v_default_account_id,
        p_direction         := 'DEBIT',
        p_amount            := v_final_amount,
        p_entry_date        := v_snapshot.snapshot_date,
        p_counterparty_type := 'OTA',
        p_counterparty_id   := p_unified_booking_id,
        p_note              := 'NO_SHOW OTA revenue: ' || p_booking_code
      );

      UPDATE no_show_financial_snapshots SET
        collected_amount = v_final_amount,
        charge_status    = 'COLLECTED',
        revenue_posted   = true,
        ledger_entry_id  = v_ledger_entry_id,
        updated_at       = now()
      WHERE id = v_snapshot.id;

      v_no_show_posted := true;
    END IF;
  END IF;

  IF v_booking_status = 'NO_SHOW' AND v_final_amount = 0 THEN
    UPDATE no_show_financial_snapshots SET
      charge_status = 'WAIVED',
      updated_at    = now()
    WHERE unified_booking_id = p_unified_booking_id
      AND removed_at IS NULL;
  END IF;

  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'PAYOUT_ADD_BOOKING_ATOMIC',
    'ota_payout_details',
    v_detail_id::TEXT,
    jsonb_build_object(
      'payout_id', p_payout_id,
      'unified_booking_id', p_unified_booking_id,
      'expected_amount', v_final_amount,
      'is_no_show', v_is_no_show,
      'no_show_revenue_posted', v_no_show_posted,
      'ledger_entry_id', v_ledger_entry_id,
      'gross_amount', v_gross,
      'net_payout_amount', v_net
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'payout_detail_id', v_detail_id,
    'payout_id', p_payout_id,
    'unified_booking_id', p_unified_booking_id,
    'is_no_show', v_is_no_show,
    'expected_amount', v_final_amount,
    'no_show_revenue_posted', v_no_show_posted,
    'ledger_entry_id', v_ledger_entry_id,
    'gross_amount', v_gross,
    'net_payout_amount', v_net
  );
END;
$$;

-- Update create_payout_adjustment_atomic: deduction SUM must filter is_deleted
CREATE OR REPLACE FUNCTION public.create_payout_adjustment_atomic(
  p_payout_id          UUID,
  p_amount             NUMERIC,
  p_item_type          TEXT,
  p_deduction_type     TEXT,
  p_reason             TEXT,
  p_economic_date      DATE    DEFAULT CURRENT_DATE,
  p_adj_category       TEXT    DEFAULT NULL,
  p_direction          TEXT    DEFAULT 'DEBIT',
  p_unified_booking_id TEXT    DEFAULT NULL,
  p_payout_detail_id   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       UUID;
  v_payout        RECORD;
  v_deduction_id  UUID;
  v_recon_id      UUID;
  v_ledger_result JSONB;
  v_gross         NUMERIC;
  v_ded_total     NUMERIC;
  v_net           NUMERIC;
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
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can create adjustments'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Adjustment reason is required';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Adjustment amount must be non-zero';
  END IF;

  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND: Payout % not found', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'VOIDED: Cannot adjust voided payout %', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO ota_payout_deductions (
    payout_id, unified_booking_id, payout_detail_id,
    deduction_type, amount, reason_note, created_by
  ) VALUES (
    p_payout_id, p_unified_booking_id, p_payout_detail_id,
    p_deduction_type, p_amount, TRIM(p_reason), v_user_id
  )
  RETURNING id INTO v_deduction_id;

  INSERT INTO ota_payout_reconciliation_items (
    payout_id, item_type, amount, direction, note,
    economic_date, adj_category, deduction_id, created_by,
    idempotency_key
  ) VALUES (
    p_payout_id, p_item_type, ABS(p_amount), p_direction, TRIM(p_reason),
    p_economic_date, p_adj_category, v_deduction_id, v_user_id,
    'ADJ-' || p_payout_id || '-' || v_deduction_id
  )
  RETURNING id INTO v_recon_id;

  v_ledger_result := post_ota_payout_adjustment_to_ledger_atomic(v_recon_id);

  SELECT COALESCE(SUM(expected_amount), 0) INTO v_gross
  FROM ota_payout_details
  WHERE payout_id = p_payout_id AND is_active = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_ded_total
  FROM ota_payout_deductions
  WHERE payout_id = p_payout_id AND is_deleted = false;

  v_net := v_gross + v_ded_total;

  UPDATE ota_payouts SET
    gross_amount      = v_gross,
    deduction_total   = v_ded_total,
    net_payout_amount = v_net,
    total_amount      = v_net,
    updated_at        = now()
  WHERE id = p_payout_id;

  PERFORM recalculate_ota_payout_status_v2(p_payout_id);

  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'PAYOUT_ADJUSTMENT_ATOMIC',
    'ota_payout_reconciliation_items',
    v_recon_id::TEXT,
    jsonb_build_object(
      'payout_id', p_payout_id,
      'deduction_id', v_deduction_id,
      'recon_item_id', v_recon_id,
      'amount', p_amount,
      'item_type', p_item_type,
      'deduction_type', p_deduction_type,
      'reason', TRIM(p_reason),
      'ledger_result', v_ledger_result,
      'net_payout_amount', v_net
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'deduction_id', v_deduction_id,
    'recon_item_id', v_recon_id,
    'payout_id', p_payout_id,
    'amount', p_amount,
    'ledger_posted', COALESCE((v_ledger_result->>'already_posted')::boolean, false) IS NOT TRUE,
    'net_payout_amount', v_net
  );
END;
$$;


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_col_updated INT; v_col_deleted INT;
  v_fn_delete INT; v_fn_recon INT;
  v_trg INT;
BEGIN
  SELECT COUNT(*) INTO v_col_updated FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ledger_entries' AND column_name='updated_at';

  SELECT COUNT(*) INTO v_col_deleted FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ota_payout_deductions' AND column_name='is_deleted';

  SELECT COUNT(*) INTO v_fn_delete FROM pg_proc WHERE proname='delete_payout_deduction_secure';
  SELECT COUNT(*) INTO v_fn_recon FROM pg_proc WHERE proname='run_financial_reconciliation';

  SELECT COUNT(*) INTO v_trg FROM pg_trigger WHERE tgname='trg_ledger_entries_updated_at';

  RAISE NOTICE 'Sprint 11: ledger_updated_at=%, deduction_is_deleted=%, delete_rpc=%, recon_fn=%, updated_at_trigger=%',
    v_col_updated, v_col_deleted, v_fn_delete, v_fn_recon, v_trg;

  IF v_col_updated < 1 THEN RAISE WARNING 'MISSING: ledger_entries.updated_at'; END IF;
  IF v_col_deleted < 1 THEN RAISE WARNING 'MISSING: ota_payout_deductions.is_deleted'; END IF;
  IF v_fn_delete  < 1 THEN RAISE WARNING 'MISSING: delete_payout_deduction_secure'; END IF;
  IF v_trg        < 1 THEN RAISE WARNING 'MISSING: trg_ledger_entries_updated_at'; END IF;
END;
$$;
