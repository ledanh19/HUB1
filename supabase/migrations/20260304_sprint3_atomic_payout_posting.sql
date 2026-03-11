-- ============================================================================
-- SPRINT 3 — ATOMIC PAYOUT LEDGER POSTING
-- ============================================================================
-- Date:     2026-03-04
-- Revision: FINAL (production-ready)
-- Depends:  20260303_sprint2_payout_hardening.sql
--           20260228_ota_payout_adj_reporting.sql (existing posting RPCs)
--           20260227084244 (post_ota_payout_bank_fee_to_ledger_atomic)
--
-- Objective:
--   Eliminate "silent ledger posting failures" by wrapping all payout ledger
--   posting (bank fee + adjustments) into ONE atomic server-side RPC.
--   If any posting fails, the ENTIRE operation rolls back — no partial state.
--
-- Objects created (additive only):
--   1 function — post_payout_ledger_entries_atomic
--   1 view     — v_payout_ledger_gaps (comprehensive gap detection)
--
-- Hard rules:
--   • NON-BREAKING + ADDITIVE only
--   • Every statement idempotent (OR REPLACE)
--   • Existing RPCs are NOT modified (called internally as sub-functions)
--   • SECURITY DEFINER + RBAC check
--   • Period lock enforced via existing ledger_entries trigger
-- ============================================================================


-- ============================================================================
-- A. ATOMIC PAYOUT LEDGER POSTING RPC
-- ============================================================================
-- Wraps:
--   1) post_ota_payout_bank_fee_to_ledger_atomic(payout_id)
--   2) post_ota_payout_adjustment_to_ledger_atomic(recon_item_id) x N
-- in a SINGLE transaction. If any sub-call raises, entire txn rolls back.
--
-- Called by FE after cash-in (replaces useAutoPostLedger best-effort loop).
-- Also callable as a retry / manual "post all" button.
--
-- Tie-out delta check is included server-side (was previously FE-only).

CREATE OR REPLACE FUNCTION public.post_payout_ledger_entries_atomic(
  p_payout_id  UUID,
  p_force      BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payout          RECORD;
  v_user_id         UUID;
  v_bank_result     JSONB;
  v_adj_result      JSONB;
  v_bank_posted     BOOLEAN := false;
  v_bank_skipped    BOOLEAN := false;
  v_adj_posted      INT := 0;
  v_adj_skipped     INT := 0;
  v_item            RECORD;
  v_total_received  NUMERIC;
  v_expected        NUMERIC;
  v_bank_fee        NUMERIC;
  v_adj_total       NUMERIC;
  v_delta           NUMERIC;
  v_has_bank_fee_item BOOLEAN;
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
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan can post ledger entries'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 2. Load + validate payout ──────────────────────────────────
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout % not found', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RAISE EXCEPTION 'VOIDED: Cannot post ledger for voided payout %', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status NOT IN ('RECEIVED', 'PARTIAL') THEN
    RAISE EXCEPTION 'STATUS_INVALID: Payout % has status=%, expected RECEIVED or PARTIAL',
      p_payout_id, v_payout.status
      USING ERRCODE = 'P0003';
  END IF;

  -- ── 3. Tie-out delta check (server-side) ───────────────────────
  -- Compute total received from non-voided allocations
  WITH voided_originals AS (
    SELECT hc.related_collection_id
    FROM hotel_collects hc
    WHERE hc.collection_type = 'VOID'
      AND hc.related_collection_id IS NOT NULL
  )
  SELECT COALESCE(SUM(cpa.allocated_amount), 0)
  INTO v_total_received
  FROM collection_payout_allocations cpa
  WHERE cpa.payout_id = p_payout_id
    AND cpa.collection_id NOT IN (SELECT related_collection_id FROM voided_originals);

  SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT','OTHER','DISPUTE') THEN amount ELSE 0 END), 0)
  INTO v_bank_fee, v_adj_total
  FROM ota_payout_reconciliation_items
  WHERE payout_id = p_payout_id;

  v_expected := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
  v_delta := v_expected - v_total_received - v_bank_fee - v_adj_total;

  IF ABS(v_delta) > 1 AND NOT p_force THEN
    -- Audit the skip
    INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
    VALUES (
      'PAYOUT_LEDGER_POSTING_SKIPPED',
      'ota_payouts',
      p_payout_id::TEXT,
      jsonb_build_object(
        'reason', 'tie_out_delta_exceeded',
        'delta', v_delta,
        'expected', v_expected,
        'received', v_total_received,
        'bank_fee', v_bank_fee,
        'adj_total', v_adj_total
      ),
      v_user_id
    );

    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'status', 'skipped',
      'reason', 'tie_out_delta_exceeded',
      'delta', v_delta,
      'expected', v_expected,
      'received', v_total_received,
      'bank_fee', v_bank_fee,
      'adj_total', v_adj_total
    );
  END IF;

  -- ── 4. Post bank fee ───────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM ota_payout_reconciliation_items
    WHERE payout_id = p_payout_id AND item_type = 'BANK_TRANSFER_FEE'
  ) INTO v_has_bank_fee_item;

  IF v_bank_fee > 0 AND v_has_bank_fee_item THEN
    v_bank_result := post_ota_payout_bank_fee_to_ledger_atomic(p_payout_id);

    IF (v_bank_result->>'status') = 'already_posted' THEN
      v_bank_skipped := true;
    ELSE
      v_bank_posted := true;
    END IF;
  END IF;

  -- ── 5. Post all unposted adjustments ───────────────────────────
  FOR v_item IN
    SELECT id, item_type, amount
    FROM ota_payout_reconciliation_items
    WHERE payout_id = p_payout_id
      AND ledger_entry_id IS NULL
      AND item_type != 'BANK_TRANSFER_FEE'
      AND amount > 0
    ORDER BY created_at
  LOOP
    v_adj_result := post_ota_payout_adjustment_to_ledger_atomic(v_item.id);

    IF (v_adj_result->>'already_posted')::boolean IS TRUE
       OR (v_adj_result->>'skipped')::boolean IS TRUE THEN
      v_adj_skipped := v_adj_skipped + 1;
    ELSE
      v_adj_posted := v_adj_posted + 1;
    END IF;
  END LOOP;

  -- ── 6. Audit log ───────────────────────────────────────────────
  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'PAYOUT_LEDGER_POSTING_ATOMIC',
    'ota_payouts',
    p_payout_id::TEXT,
    jsonb_build_object(
      'bank_fee_posted', v_bank_posted,
      'bank_fee_skipped', v_bank_skipped,
      'adjustments_posted', v_adj_posted,
      'adjustments_skipped', v_adj_skipped,
      'delta', v_delta,
      'forced', p_force
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'status', 'posted',
    'bank_fee_posted', v_bank_posted,
    'bank_fee_skipped', v_bank_skipped,
    'adjustments_posted', v_adj_posted,
    'adjustments_skipped', v_adj_skipped,
    'delta', v_delta
  );
END;
$$;

COMMENT ON FUNCTION public.post_payout_ledger_entries_atomic(UUID, BOOLEAN) IS
  'Atomic posting of ALL payout ledger entries (bank fee + adjustments) in one '
  'transaction. If any posting fails, the entire operation rolls back. '
  'Idempotent: already-posted items are skipped. '
  'Includes server-side tie-out delta check (bypass with p_force=true). '
  'Replaces FE best-effort loop in useAutoPostLedger.ts.';


-- ============================================================================
-- B. COMPREHENSIVE GAP DETECTION VIEW
-- ============================================================================
-- Improves on v_unposted_payout_items by adding:
--   1) NO_SHOW revenue gap detection
--   2) Entry date info for period lock debugging
--   3) Age calculation for SLA monitoring

CREATE OR REPLACE VIEW public.v_payout_ledger_gaps AS
-- Part 1: Unposted bank fees + adjustments (existing logic, enhanced)
SELECT
  'RECON_ITEM'::TEXT     AS gap_type,
  ri.id                  AS source_id,
  ri.payout_id,
  ri.item_type           AS detail_type,
  ri.amount,
  ri.created_at,
  op.payout_date,
  op.ota_source,
  op.status              AS payout_status,
  op.received_at,
  op.is_voided,
  EXTRACT(DAY FROM now() - COALESCE(op.received_at, ri.created_at))::INT AS age_days,
  ri.ledger_entry_id     AS existing_ledger_id
FROM public.ota_payout_reconciliation_items ri
JOIN public.ota_payouts op ON op.id = ri.payout_id
WHERE ri.ledger_entry_id IS NULL
  AND ri.amount > 0
  AND op.is_voided = false
  AND op.status IN ('RECEIVED', 'PARTIAL')

UNION ALL

-- Part 2: NO_SHOW bookings in payouts without revenue posted
SELECT
  'NO_SHOW_REVENUE'::TEXT  AS gap_type,
  ns.id                    AS source_id,
  pd.payout_id,
  'NO_SHOW_REVENUE'        AS detail_type,
  pd.expected_amount       AS amount,
  pd.created_at,
  op.payout_date,
  op.ota_source,
  op.status                AS payout_status,
  op.received_at,
  op.is_voided,
  EXTRACT(DAY FROM now() - pd.created_at)::INT AS age_days,
  ns.ledger_entry_id       AS existing_ledger_id
FROM public.ota_payout_details pd
JOIN public.ota_payouts op ON op.id = pd.payout_id
JOIN public.unified_bookings ub ON ub.unified_booking_id = pd.unified_booking_id
LEFT JOIN public.no_show_financial_snapshots ns
  ON ns.unified_booking_id = pd.unified_booking_id
  AND ns.removed_at IS NULL
WHERE ub.booking_status = 'NO_SHOW'
  AND pd.expected_amount > 0
  AND pd.is_active = true
  AND op.is_voided = false
  AND (ns.revenue_posted IS NULL OR ns.revenue_posted = false);

COMMENT ON VIEW public.v_payout_ledger_gaps IS
  'Comprehensive ledger gap detection for payouts. '
  'Part 1: Unposted bank fees + adjustments (recon items without ledger_entry_id). '
  'Part 2: NO_SHOW bookings without revenue posted to ledger. '
  'age_days shows SLA compliance. All gaps should trend to zero.';


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_fn INT; v_views INT;
BEGIN
  SELECT COUNT(*) INTO v_fn
    FROM pg_proc WHERE proname = 'post_payout_ledger_entries_atomic';

  SELECT COUNT(*) INTO v_views
    FROM information_schema.views
   WHERE table_schema = 'public'
     AND table_name = 'v_payout_ledger_gaps';

  RAISE NOTICE 'Sprint 3 FINAL: atomic_rpc=%, gap_view=%', v_fn, v_views;
  IF v_fn < 1 THEN RAISE WARNING 'Expected post_payout_ledger_entries_atomic, found %', v_fn; END IF;
  IF v_views < 1 THEN RAISE WARNING 'Expected v_payout_ledger_gaps, found %', v_views; END IF;
END;
$$;
