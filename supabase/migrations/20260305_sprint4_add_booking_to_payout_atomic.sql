-- ============================================================================
-- SPRINT 4 — ATOMIC ADD-BOOKING-TO-PAYOUT WITH NO_SHOW REVENUE POSTING
-- ============================================================================
-- Date:     2026-03-05
-- Revision: FINAL (production-ready)
-- Depends:  20260303_sprint2_payout_hardening.sql (is_active, partial unique)
--           20260304_sprint3_atomic_payout_posting.sql (v_payout_ledger_gaps)
--           20260102_finance_ledger_system.sql (post_ledger_entry_idempotent)
--
-- Objective:
--   Eliminate the split between "insert payout detail" and "post NO_SHOW
--   revenue ledger" by wrapping both into ONE atomic server-side RPC.
--   If ledger posting fails, the payout detail INSERT is also rolled back.
--   No more orphan payout details without matching ledger entries for NO_SHOW.
--
-- Objects created (additive only):
--   1 function — add_booking_to_payout_atomic
--
-- Hard rules:
--   • NON-BREAKING + ADDITIVE only
--   • OR REPLACE (idempotent deploy)
--   • Existing RPCs are NOT modified (post_ledger_entry_idempotent called internally)
--   • SECURITY DEFINER + RBAC check (admin/ke_toan/super_admin)
--   • Period lock enforced via existing ledger_entries trigger
--   • Partial unique index idx_payout_details_booking_active prevents cross-payout dupes
-- ============================================================================


-- ============================================================================
-- A. ATOMIC ADD-BOOKING-TO-PAYOUT RPC
-- ============================================================================
-- Replaces FE's useAddBookingToPayout multi-step client-side flow:
--   1) Insert ota_payout_details
--   2) recalculatePayoutTotals (client-side fetch + update)
--   3) NO_SHOW: fetch snapshot → get default account → post_ledger_entry_idempotent
--              → update snapshot (all in try/catch that could swallow failures)
--
-- Now: single DB transaction. Any failure → full rollback.

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

  -- ── 2. Load + validate payout (FOR UPDATE prevents concurrent add race) ──
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

  -- CANCELLED → force amount to 0 (safety net: FE already sends 0)
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
      -- Get default cash account
      SELECT id INTO v_default_account_id
      FROM cash_accounts
      WHERE is_default = true AND is_active = true AND is_archived = false
      LIMIT 1;

      IF v_default_account_id IS NULL THEN
        RAISE EXCEPTION 'NO_DEFAULT_ACCOUNT: No active default cash account found for NO_SHOW ledger posting'
          USING ERRCODE = 'P0006';
      END IF;

      -- Post ledger entry (idempotent via source_type='NO_SHOW_REVENUE' + source_id=snapshot.id)
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

      -- Update snapshot atomically
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

  -- NO_SHOW with zero amount → WAIVED
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

COMMENT ON FUNCTION public.add_booking_to_payout_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS
  'Atomic add-booking-to-payout: inserts payout detail, recalculates totals, '
  'and posts NO_SHOW revenue to ledger — all in ONE transaction. '
  'If ledger posting fails, the detail INSERT also rolls back. '
  'Idempotent: returns already_exists if booking already active in this payout. '
  'Cross-payout uniqueness enforced by idx_payout_details_booking_active. '
  'Replaces FE multi-step flow in useAddBookingToPayout.';


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_fn INT;
  v_dep INT;
  v_idx INT;
BEGIN
  SELECT COUNT(*) INTO v_fn
    FROM pg_proc WHERE proname = 'add_booking_to_payout_atomic';

  SELECT COUNT(*) INTO v_dep
    FROM pg_proc WHERE proname = 'post_ledger_entry_idempotent';

  SELECT COUNT(*) INTO v_idx
    FROM pg_indexes WHERE indexname = 'idx_payout_details_booking_active';

  RAISE NOTICE 'Sprint 4 FINAL: add_booking_to_payout_atomic=% (expect 1), post_ledger_entry_idempotent=% (expect 1), idx_payout_details_booking_active=% (expect 1)',
    v_fn, v_dep, v_idx;

  IF v_fn < 1 THEN RAISE WARNING 'MISSING: add_booking_to_payout_atomic function'; END IF;
  IF v_dep < 1 THEN RAISE WARNING 'MISSING DEPENDENCY: post_ledger_entry_idempotent function'; END IF;
  IF v_idx < 1 THEN RAISE WARNING 'MISSING DEPENDENCY: idx_payout_details_booking_active partial unique index'; END IF;
END;
$$;
