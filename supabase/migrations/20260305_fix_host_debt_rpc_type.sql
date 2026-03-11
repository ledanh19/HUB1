-- ================================================================
-- HOTFIX: dashboard_host_debt_summary_v1 — date <= text type mismatch
-- Error: "operator does not exist: date <= text"
-- Fix: use date type instead of text for today comparison
-- ================================================================

-- Re-create with fixed type (CREATE OR REPLACE is safe/idempotent)
CREATE OR REPLACE FUNCTION public.dashboard_host_debt_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today         date := CURRENT_DATE;
    v_total_paid    numeric := 0;
    v_total_payable numeric := 0;
    v_unsettled_cnt int     := 0;
    v_actual_payable   numeric := 0;
    v_actual_unsettled int     := 0;
    v_actual_count     int     := 0;
    v_expected_payable numeric := 0;
    v_expected_count   int     := 0;
    seg RECORD;
    v_extra_amount numeric;
    v_is_checked_in boolean;
    v_is_no_show    boolean;
    v_supply_started boolean;
    v_segment_total  numeric;
BEGIN
    -- 1. Total paid from cashflow_entries (HOST_SETTLEMENT_PAYMENT OUT)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM cashflow_entries
     WHERE source_type = 'HOST_SETTLEMENT_PAYMENT'
       AND direction = 'OUT';

    -- 2. Loop segments + compute
    FOR seg IN
        SELECT hss.id,
               hss.unified_booking_id,
               hss.partner_id,
               hss.total_amount,
               hss.settlement_id,
               hss.date_from
          FROM host_supply_segments hss
    LOOP
        -- Extra charges for this segment's booking+partner
        SELECT COALESCE(SUM(hec.amount), 0)
          INTO v_extra_amount
          FROM host_extra_charges hec
         WHERE hec.unified_booking_id = seg.unified_booking_id
           AND hec.partner_id = seg.partner_id;

        v_segment_total := COALESCE(seg.total_amount, 0) + v_extra_amount;
        v_total_payable := v_total_payable + v_segment_total;

        IF seg.settlement_id IS NULL THEN
            v_unsettled_cnt := v_unsettled_cnt + 1;
        END IF;

        -- Check stays for actual vs expected split
        SELECT
            EXISTS (
                SELECT 1 FROM stays s
                 WHERE s.unified_booking_id = seg.unified_booking_id
                   AND (s.actual_check_in_at IS NOT NULL
                        OR s.stay_status IN ('CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT'))
            ),
            EXISTS (
                SELECT 1 FROM stays s
                 WHERE s.unified_booking_id = seg.unified_booking_id
                   AND s.stay_status = 'NO_SHOW'
            )
          INTO v_is_checked_in, v_is_no_show;

        -- If no-show and not checked in, skip
        IF v_is_no_show AND NOT v_is_checked_in THEN
            CONTINUE;
        END IF;

        v_supply_started := (seg.date_from IS NOT NULL AND seg.date_from <= v_today);

        IF v_is_checked_in AND v_supply_started THEN
            v_actual_payable := v_actual_payable + v_segment_total;
            v_actual_count := v_actual_count + 1;
            IF seg.settlement_id IS NULL THEN
                v_actual_unsettled := v_actual_unsettled + 1;
            END IF;
        ELSE
            v_expected_payable := v_expected_payable + v_segment_total;
            v_expected_count := v_expected_count + 1;
        END IF;
    END LOOP;

    -- If no segments found, return zeros
    IF v_total_payable = 0 AND v_actual_count = 0 AND v_expected_count = 0 THEN
        RETURN jsonb_build_object(
            'totalPayable', 0, 'totalPaid', 0, 'remaining', 0,
            'unpaidCount', 0, 'unsettledCount', 0,
            'actualPayable', 0, 'actualUnsettled', 0, 'actualRemaining', 0, 'actualCount', 0,
            'expectedPayable', 0, 'expectedRemaining', 0, 'expectedCount', 0
        );
    END IF;

    -- Compute derived fields
    DECLARE
        v_remaining        numeric := GREATEST(0, v_total_payable - v_total_paid);
        v_unpaid_count     int     := CASE WHEN v_remaining > 0 THEN (
            SELECT COUNT(*) FROM host_supply_segments
        ) ELSE 0 END;
        v_paid_to_actual   numeric := LEAST(v_total_paid, v_actual_payable);
        v_actual_remaining numeric := GREATEST(0, v_actual_payable - v_paid_to_actual);
    BEGIN
        RETURN jsonb_build_object(
            'totalPayable',      v_total_payable,
            'totalPaid',         v_total_paid,
            'remaining',         v_remaining,
            'unpaidCount',       v_unpaid_count,
            'unsettledCount',    v_unsettled_cnt,
            'actualPayable',     v_actual_payable,
            'actualUnsettled',   v_actual_unsettled,
            'actualRemaining',   v_actual_remaining,
            'actualCount',       v_actual_count,
            'expectedPayable',   v_expected_payable,
            'expectedRemaining', v_expected_payable,
            'expectedCount',     v_expected_count
        );
    END;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.dashboard_host_debt_summary_v1() TO authenticated;
