-- ============================================================================
-- SPRINTS 6–9: FINANCE INTEGRITY HARDENING
-- ============================================================================
-- Date:     2026-03-07
-- Revision: FINAL (production-ready)
-- Depends:  20260305_sprint4_add_booking_to_payout_atomic.sql
--           20260306_sprint5_finance_hardening.sql
--           20260304_sprint3_atomic_payout_posting.sql
--           20260103_phase3_finance_hardening.sql (is_period_locked)
--
-- Sprints:
--   6 — NO_SHOW & allocation integrity
--   7 — Period lock DB-level enforcement (triggers)
--   8 — Adjustment duality fix (atomic RPC + link column)
--   9 — Reconciliation monitoring (recon_runs + function)
--
-- Hard rules:
--   • NON-BREAKING + ADDITIVE only
--   • OR REPLACE (idempotent deploy)
--   • SECURITY DEFINER + RBAC (admin/ke_toan/super_admin)
--   • No hard deletes, no new roles
--   • All state transitions: FOR UPDATE + status validation + audit
-- ============================================================================


-- ============================================================================
-- SPRINT 6.1 — NO_SHOW DOUBLE-POSTING GUARD
-- ============================================================================
-- Problem: Booking with revenue_posted=true could be re-added to a payout,
--          causing potential double revenue impact.
-- Fix: Explicit guard in add_booking_to_payout_atomic. If NO_SHOW and
--      revenue already posted → RAISE EXCEPTION before inserting detail.
-- Note: Existing post_ledger_entry_idempotent provides defense-in-depth,
--       but this guard fails EARLY (before any writes occur).

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
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan can add bookings to payouts'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 2. Load + validate payout (FOR UPDATE prevents concurrent race) ──
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

  -- ── 3. Look up booking status from DB ──────────────────────────
  SELECT booking_status::TEXT INTO v_booking_status
  FROM unified_bookings
  WHERE unified_booking_id = p_unified_booking_id;

  v_is_no_show := (v_booking_status = 'NO_SHOW');

  -- ── 3a. Sprint 6.1: NO_SHOW double-posting guard ──────────────
  -- If revenue was already posted for this booking, reject allocation
  -- to prevent double revenue impact.
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

  -- CANCELLED → force amount to 0
  v_final_amount := CASE
    WHEN v_booking_status = 'CANCELLED' THEN 0
    ELSE p_expected_amount
  END;

  -- Non-CANCELLED, non-NO_SHOW must have checkout date
  IF v_booking_status IS DISTINCT FROM 'CANCELLED'
     AND v_booking_status IS DISTINCT FROM 'NO_SHOW'
     AND NULLIF(TRIM(p_actual_check_out_at), '') IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_REQUIRED: Booking must be checked out before adding to payout'
      USING ERRCODE = 'P0004';
  END IF;

  -- ── 4. Idempotency: booking already in this payout + active ────
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

  -- ── 5. INSERT payout detail ────────────────────────────────────
  -- idx_payout_details_booking_active enforces: 1 active booking globally
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

  -- ── 6. Recalculate payout totals (server-side) ─────────────────
  SELECT COALESCE(SUM(expected_amount), 0) INTO v_gross
  FROM ota_payout_details
  WHERE payout_id = p_payout_id AND is_active = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_adj_total
  FROM ota_payout_deductions
  WHERE payout_id = p_payout_id;

  v_net := v_gross + v_adj_total;

  UPDATE ota_payouts SET
    gross_amount       = v_gross,
    deduction_total    = v_adj_total,
    net_payout_amount  = v_net,
    total_amount       = v_net,
    updated_at         = now()
  WHERE id = p_payout_id;

  -- ── 7. NO_SHOW revenue posting (atomic within same txn) ────────
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

  -- ── 8. Audit log ──────────────────────────────────────────────
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

  -- ── 9. Return result ──────────────────────────────────────────
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


-- ============================================================================
-- SPRINT 6.2 — NO_SHOW RECLASSIFICATION DETECTION VIEW
-- ============================================================================
-- Detects bookings that had NO_SHOW revenue posted but current status
-- is no longer NO_SHOW (reclassified after posting → potential reversal needed).

CREATE OR REPLACE VIEW public.v_no_show_reclass_gaps AS
SELECT
  ns.id                       AS snapshot_id,
  ns.unified_booking_id,
  ub.booking_status::TEXT     AS current_status,
  ns.revenue_posted,
  ns.ledger_entry_id,
  ns.charge_status,
  ns.expected_amount,
  ns.collected_amount,
  ns.snapshot_date,
  ns.created_at,
  EXTRACT(DAY FROM now() - ns.created_at)::INT AS age_days
FROM public.no_show_financial_snapshots ns
JOIN public.unified_bookings ub
  ON ub.unified_booking_id = ns.unified_booking_id
WHERE ns.removed_at IS NULL
  AND ns.revenue_posted = true
  AND ub.booking_status::TEXT != 'NO_SHOW';

COMMENT ON VIEW public.v_no_show_reclass_gaps IS
  'Sprint 6.2: Detects bookings reclassified AWAY from NO_SHOW after revenue was posted. '
  'These require investigation — potential reversal of NO_SHOW revenue ledger entry. '
  'Alert-only: no automatic reversal. Count should be zero in healthy state.';


-- ============================================================================
-- SPRINT 6.3 — ALLOCATION RACE GUARD (VERIFY EXISTING)
-- ============================================================================
-- idx_payout_details_booking_active already exists (Sprint 2).
-- EXCEPTION WHEN unique_violation handler exists in add_booking_to_payout_atomic (Sprint 4).
-- This is a verification-only block.

DO $$
DECLARE v_idx INT;
BEGIN
  SELECT COUNT(*) INTO v_idx
  FROM pg_indexes WHERE indexname = 'idx_payout_details_booking_active';

  IF v_idx < 1 THEN
    RAISE WARNING 'Sprint 6.3 FAIL: idx_payout_details_booking_active missing!';
  ELSE
    RAISE NOTICE 'Sprint 6.3 PASS: Allocation race guard (partial unique index) verified.';
  END IF;
END;
$$;


-- ============================================================================
-- SPRINT 7.1 — PERIOD LOCK ENFORCEMENT TRIGGER FUNCTION
-- ============================================================================
-- DB-level enforcement: prevents inserts into financial tables when
-- the operation date falls within a locked accounting period.
-- Defense-in-depth: RPCs already check, triggers catch direct SQL.

CREATE OR REPLACE FUNCTION public.enforce_period_lock_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_check_date DATE;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN
    v_check_date := NEW.entry_date;
  ELSIF TG_TABLE_NAME = 'cashflow_entries' THEN
    v_check_date := NEW.cash_date;
  ELSIF TG_TABLE_NAME = 'hotel_collects' THEN
    v_check_date := NEW.collected_at::DATE;
  ELSIF TG_TABLE_NAME = 'cash_outs' THEN
    v_check_date := NEW.paid_at::DATE;
  ELSE
    RETURN NEW;
  END IF;

  IF v_check_date IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_locked = true
      AND v_check_date >= period_start::DATE
      AND v_check_date <= period_end::DATE
  ) THEN
    RAISE EXCEPTION 'PERIOD_LOCK: Cannot insert into % — date % falls in a locked accounting period',
      TG_TABLE_NAME, v_check_date
      USING ERRCODE = 'P0010';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_period_lock_trigger() IS
  'Sprint 7: DB-level period lock enforcement. Fires BEFORE INSERT on financial tables. '
  'Prevents writes when the operation date falls in a locked accounting period. '
  'Defense-in-depth alongside RPC-level checks.';


-- ============================================================================
-- SPRINT 7.2 — TRIGGERS ON CRITICAL TABLES
-- ============================================================================

DROP TRIGGER IF EXISTS trg_period_lock_ledger ON public.ledger_entries;
CREATE TRIGGER trg_period_lock_ledger
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION enforce_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_period_lock_cashflow ON public.cashflow_entries;
CREATE TRIGGER trg_period_lock_cashflow
  BEFORE INSERT ON public.cashflow_entries
  FOR EACH ROW
  EXECUTE FUNCTION enforce_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_period_lock_hotel_collects ON public.hotel_collects;
CREATE TRIGGER trg_period_lock_hotel_collects
  BEFORE INSERT ON public.hotel_collects
  FOR EACH ROW
  EXECUTE FUNCTION enforce_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_period_lock_cash_outs ON public.cash_outs;
CREATE TRIGGER trg_period_lock_cash_outs
  BEFORE INSERT ON public.cash_outs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_period_lock_trigger();


-- ============================================================================
-- SPRINT 8.1 — ADJUSTMENT LINK COLUMN
-- ============================================================================

ALTER TABLE public.ota_payout_reconciliation_items
  ADD COLUMN IF NOT EXISTS deduction_id UUID NULL;

COMMENT ON COLUMN public.ota_payout_reconciliation_items.deduction_id IS
  'Sprint 8: Links reconciliation item to its corresponding deduction record. '
  'Eliminates duality: one adjustment = one deduction + one recon item, linked.';


-- ============================================================================
-- SPRINT 8.2 — ATOMIC ADJUSTMENT RPC
-- ============================================================================
-- Creates BOTH ota_payout_deductions + ota_payout_reconciliation_items
-- + posts ledger entry — all in one transaction.

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
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan/super_admin can create adjustments'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Adjustment reason is required';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Adjustment amount must be non-zero';
  END IF;

  -- ── 2. Load + validate payout ──────────────────────────────────
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_NOT_FOUND: Payout % not found', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'VOIDED: Cannot adjust voided payout %', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. Insert deduction ────────────────────────────────────────
  INSERT INTO ota_payout_deductions (
    payout_id, unified_booking_id, payout_detail_id,
    deduction_type, amount, reason_note, created_by
  ) VALUES (
    p_payout_id, p_unified_booking_id, p_payout_detail_id,
    p_deduction_type, p_amount, TRIM(p_reason), v_user_id
  )
  RETURNING id INTO v_deduction_id;

  -- ── 4. Insert reconciliation item (linked) ─────────────────────
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

  -- ── 5. Post ledger entry via existing atomic function ──────────
  v_ledger_result := post_ota_payout_adjustment_to_ledger_atomic(v_recon_id);

  -- ── 6. Recalculate payout totals ───────────────────────────────
  SELECT COALESCE(SUM(expected_amount), 0) INTO v_gross
  FROM ota_payout_details
  WHERE payout_id = p_payout_id AND is_active = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_ded_total
  FROM ota_payout_deductions
  WHERE payout_id = p_payout_id;

  v_net := v_gross + v_ded_total;

  UPDATE ota_payouts SET
    gross_amount      = v_gross,
    deduction_total   = v_ded_total,
    net_payout_amount = v_net,
    total_amount      = v_net,
    updated_at        = now()
  WHERE id = p_payout_id;

  PERFORM recalculate_ota_payout_status_v2(p_payout_id);

  -- ── 7. Audit log ──────────────────────────────────────────────
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

COMMENT ON FUNCTION public.create_payout_adjustment_atomic IS
  'Sprint 8: Atomic payout adjustment — creates deduction + reconciliation item + '
  'ledger entry in ONE transaction. Links deduction_id for traceability. '
  'Failure in any step rolls back everything.';


-- ============================================================================
-- SPRINT 9.1 — RECONCILIATION RUNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recon_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running',
  issues_found INT DEFAULT 0,
  result       JSONB DEFAULT '[]'::JSONB,
  run_by       UUID
);

COMMENT ON TABLE public.recon_runs IS
  'Sprint 9: Financial reconciliation run history. Each row = one reconciliation '
  'check execution. result contains array of detected issues.';

ALTER TABLE public.recon_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_runs_select_auth ON public.recon_runs;
CREATE POLICY recon_runs_select_auth
  ON public.recon_runs FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- SPRINT 9.2 — RECONCILIATION FUNCTION
-- ============================================================================

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
      'checks_run', 5
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

COMMENT ON FUNCTION public.run_financial_reconciliation() IS
  'Sprint 9: Financial reconciliation check. Detects gaps, mismatches, and '
  'integrity violations across the finance engine. Results stored in recon_runs.';


-- ============================================================================
-- SPRINT 9.3 — FINANCIAL INTEGRITY SUMMARY VIEW (for dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_financial_integrity_summary AS
SELECT
  (SELECT COUNT(*) FROM v_payout_ledger_gaps WHERE gap_type = 'RECON_ITEM')
    AS unposted_recon_items,
  (SELECT COALESCE(SUM(amount), 0) FROM v_payout_ledger_gaps WHERE gap_type = 'RECON_ITEM')
    AS unposted_recon_amount,
  (SELECT COUNT(*) FROM v_payout_ledger_gaps WHERE gap_type = 'NO_SHOW_REVENUE')
    AS no_show_revenue_gaps,
  (SELECT COUNT(*) FROM v_no_show_reclass_gaps)
    AS no_show_reclass_count,
  (SELECT COUNT(*) FROM ota_payout_details pd
   JOIN ota_payouts p ON p.id = pd.payout_id
   WHERE p.is_voided = true AND pd.is_active = true)
    AS voided_payout_active_details,
  (SELECT COUNT(*) FROM recon_runs WHERE status = 'completed'
   AND completed_at > now() - INTERVAL '24 hours')
    AS recon_runs_last_24h,
  (SELECT COALESCE((SELECT issues_found FROM recon_runs
   WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1), -1))
    AS last_recon_issues;

COMMENT ON VIEW public.v_financial_integrity_summary IS
  'Sprint 9: Dashboard-ready summary of financial integrity metrics. '
  'All counts should be zero in a healthy system.';


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_fn1 INT; v_fn2 INT; v_fn3 INT;
  v_trg INT; v_views INT;
  v_tbl INT; v_col INT;
BEGIN
  SELECT COUNT(*) INTO v_fn1 FROM pg_proc WHERE proname = 'add_booking_to_payout_atomic';
  SELECT COUNT(*) INTO v_fn2 FROM pg_proc WHERE proname = 'create_payout_adjustment_atomic';
  SELECT COUNT(*) INTO v_fn3 FROM pg_proc WHERE proname = 'run_financial_reconciliation';

  PERFORM 1 FROM pg_proc WHERE proname = 'enforce_period_lock_trigger';
  IF NOT FOUND THEN RAISE WARNING 'MISSING: enforce_period_lock_trigger function'; END IF;

  SELECT COUNT(*) INTO v_trg FROM pg_trigger
  WHERE tgname IN (
    'trg_period_lock_ledger', 'trg_period_lock_cashflow',
    'trg_period_lock_hotel_collects', 'trg_period_lock_cash_outs'
  );

  SELECT COUNT(*) INTO v_views FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN ('v_no_show_reclass_gaps', 'v_financial_integrity_summary');

  SELECT COUNT(*) INTO v_tbl FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'recon_runs';

  SELECT COUNT(*) INTO v_col FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ota_payout_reconciliation_items'
    AND column_name = 'deduction_id';

  RAISE NOTICE 'Sprint 6-9 FINAL: booking_atomic=%, adjustment_atomic=%, recon_fn=%, triggers=% (expect 4), views=% (expect 2), recon_tbl=%, link_col=%',
    v_fn1, v_fn2, v_fn3, v_trg, v_views, v_tbl, v_col;

  IF v_fn1 < 1 THEN RAISE WARNING 'MISSING: add_booking_to_payout_atomic'; END IF;
  IF v_fn2 < 1 THEN RAISE WARNING 'MISSING: create_payout_adjustment_atomic'; END IF;
  IF v_fn3 < 1 THEN RAISE WARNING 'MISSING: run_financial_reconciliation'; END IF;
  IF v_trg < 4 THEN RAISE WARNING 'MISSING: Expected 4 period lock triggers, found %', v_trg; END IF;
  IF v_views < 2 THEN RAISE WARNING 'MISSING: Expected 2 new views, found %', v_views; END IF;
  IF v_tbl < 1 THEN RAISE WARNING 'MISSING: recon_runs table'; END IF;
  IF v_col < 1 THEN RAISE WARNING 'MISSING: deduction_id column on ota_payout_reconciliation_items'; END IF;
END;
$$;
