-- ============================================
-- FIX: "Ngày nhận thanh toán" showing "—" for PARTIAL payouts
--
-- Root cause: recalculate_ota_payout_status_v2 only sets
--   ota_payouts.received_at when status = 'RECEIVED'.
--   PARTIAL payouts (money received but not fully) never get
--   received_at populated → UI shows "—".
--
-- Fix:
--   A. Patch function: extend condition to IN ('RECEIVED', 'PARTIAL')
--   B. Backfill: populate received_at for existing PARTIAL/RECEIVED
--      payouts that have NULL received_at, using earliest
--      hotel_collects.collected_at via collection_payout_allocations.
--
-- 100% ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================

-- ═══════════════════════════════════════════════════════════════
-- A. PATCH: recalculate_ota_payout_status_v2
--    Change: 'RECEIVED' → IN ('RECEIVED', 'PARTIAL')
--    for both received_at and reconciled_at
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status_v2(
    p_payout_id UUID,
    p_received_at TIMESTAMPTZ DEFAULT now()
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payout RECORD;
    v_total_received NUMERIC;
    v_expected_amount NUMERIC;
    v_bank_fee NUMERIC;
    v_adj_total NUMERIC;
    v_new_status TEXT;
    v_is_settled BOOLEAN;
BEGIN
    SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
    IF v_payout IS NULL THEN RETURN; END IF;

    WITH voided_originals AS (
        SELECT hc.related_collection_id
        FROM hotel_collects hc
        WHERE hc.collection_type = 'VOID'
          AND hc.related_collection_id IS NOT NULL
          AND hc.related_collection_id IN (
              SELECT cpa.collection_id FROM collection_payout_allocations cpa WHERE cpa.payout_id = p_payout_id
          )
    )
    SELECT COALESCE(SUM(cpa.allocated_amount), 0)
    INTO v_total_received
    FROM collection_payout_allocations cpa
    INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
    WHERE cpa.payout_id = p_payout_id
      AND hc.collection_type = 'COLLECT'
      AND hc.id NOT IN (SELECT related_collection_id FROM voided_originals);

    SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT', 'OTHER', 'DISPUTE') THEN amount ELSE 0 END), 0)
    INTO v_bank_fee, v_adj_total
    FROM ota_payout_reconciliation_items WHERE payout_id = p_payout_id;

    v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
    v_is_settled := (v_total_received + v_bank_fee + v_adj_total) >= (v_expected_amount - 1);

    IF v_total_received <= 0 THEN
        v_new_status := 'PENDING';
    ELSIF v_is_settled THEN
        v_new_status := 'RECEIVED';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;

    UPDATE ota_payouts SET
        bank_fee_total = v_bank_fee,
        adjustment_total = v_adj_total,
        is_reconciled = v_is_settled,
        status = v_new_status::payout_status,
        -- FIX: set received_at for BOTH RECEIVED and PARTIAL (was only RECEIVED)
        -- COALESCE preserves earliest date (first cash-in)
        received_at = CASE WHEN v_new_status IN ('RECEIVED', 'PARTIAL')
                           THEN COALESCE(received_at, p_received_at)
                           ELSE received_at END,
        -- reconciled_at = system audit timestamp, also extend to PARTIAL
        reconciled_at = CASE WHEN v_new_status IN ('RECEIVED', 'PARTIAL')
                             THEN COALESCE(reconciled_at, now())
                             ELSE reconciled_at END,
        updated_at = now()
    WHERE id = p_payout_id;
END;
$$;

COMMENT ON FUNCTION public.recalculate_ota_payout_status_v2(UUID, TIMESTAMPTZ) IS
  'Recalculate OTA payout status, received_at, reconciled_at, bank_fee, adj totals. '
  'FIX 2026-03-11: received_at now set for PARTIAL (not just RECEIVED), '
  'preserving earliest cash-in date via COALESCE.';

-- ═══════════════════════════════════════════════════════════════
-- B. BACKFILL: Populate received_at for existing payouts
--    where status IN ('PARTIAL', 'RECEIVED') AND received_at IS NULL
--
--    SOT linkage:
--      ota_payouts.id
--        → collection_payout_allocations.payout_id
--        → collection_payout_allocations.collection_id
--        → hotel_collects.id (where collection_type = 'COLLECT' and not voided)
--        → hotel_collects.collected_at (= user-entered received date)
--
--    We take MIN(collected_at) = earliest receipt date.
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_rec RECORD;
    v_backfilled INT := 0;
BEGIN
    FOR v_rec IN
        SELECT p.id AS payout_id,
               (
                   SELECT MIN(hc.collected_at)
                   FROM collection_payout_allocations cpa
                   INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
                   WHERE cpa.payout_id = p.id
                     AND hc.collection_type = 'COLLECT'
                     -- Exclude voided collections
                     AND hc.id NOT IN (
                         SELECT hc2.related_collection_id
                         FROM hotel_collects hc2
                         WHERE hc2.collection_type = 'VOID'
                           AND hc2.related_collection_id IS NOT NULL
                     )
               ) AS earliest_receipt_date
        FROM ota_payouts p
        WHERE p.status IN ('PARTIAL', 'RECEIVED')
          AND p.received_at IS NULL
          AND p.is_voided = false
    LOOP
        -- Only update if we found a real receipt date
        IF v_rec.earliest_receipt_date IS NOT NULL THEN
            UPDATE ota_payouts
            SET received_at = v_rec.earliest_receipt_date,
                updated_at = now()
            WHERE id = v_rec.payout_id;

            INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
            VALUES (
                'BACKFILL_PAYOUT_RECEIVED_AT',
                'ota_payouts',
                v_rec.payout_id::TEXT,
                '00000000-0000-0000-0000-000000000000',
                jsonb_build_object(
                    'reason', 'Fix PARTIAL/RECEIVED payouts missing received_at',
                    'derived_from', 'MIN(hotel_collects.collected_at) via collection_payout_allocations',
                    'earliest_receipt_date', v_rec.earliest_receipt_date::TEXT,
                    'migration', '20260311_fix_partial_payout_received_at'
                )
            );

            v_backfilled := v_backfilled + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfilled received_at for % payouts (PARTIAL + RECEIVED with NULL received_at)', v_backfilled;
END $$;

-- Grant permissions (idempotent)
GRANT EXECUTE ON FUNCTION public.recalculate_ota_payout_status_v2(UUID, TIMESTAMPTZ) TO authenticated;
