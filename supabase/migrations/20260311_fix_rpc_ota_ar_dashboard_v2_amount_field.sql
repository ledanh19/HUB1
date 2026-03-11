-- ============================================================================
-- FIX: rpc_get_ota_ar_dashboard_v2 — pending_payouts CTE
-- Bug: used total_amount instead of net_payout_amount, missing is_voided=false
-- This aligns the RPC with client-side useOtaPayoutPendingSummary hook.
-- NON-BREAKING: same output shape, corrected values only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_ota_ar_dashboard_v2(
  p_property_id TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_channex_property_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_group_id CONSTANT TEXT := '72e58e1b-1e34-4678-9100-71c778ecf6d0';
BEGIN
  WITH
  -- 1. Tenant property scope
  tenant_props AS (
    SELECT channex_property_id
    FROM channex_property_groups
    WHERE channex_group_id = v_group_id
  ),

  -- 2. OTA_COLLECT bookings in scope (not CANCELLED)
  ota_bookings AS (
    SELECT
      bm.unified_booking_id,
      bm.ota_source,
      bm.channex_property_id,
      bm.ota_property_id,
      bm.total_amount_net,
      bm.check_out_date
    FROM bookings_mirror bm
    INNER JOIN tenant_props tp ON tp.channex_property_id = bm.channex_property_id
    WHERE bm.payment_type = 'OTA_COLLECT'
      AND bm.booking_status != 'CANCELLED'
      AND (p_property_id IS NULL OR bm.ota_property_id = p_property_id)
      AND (p_source IS NULL OR bm.ota_source = p_source)
      AND (p_channex_property_id IS NULL OR bm.channex_property_id = p_channex_property_id)
  ),

  -- 3. CHECKED_OUT stays (one per booking, deduplicated)
  checked_out AS (
    SELECT DISTINCT ON (s.unified_booking_id)
      s.unified_booking_id,
      COALESCE(s.actual_check_out_at::date, ob.check_out_date) AS checkout_date
    FROM stays s
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = s.unified_booking_id
    WHERE s.stay_status = 'CHECKED_OUT'
    ORDER BY s.unified_booking_id, s.actual_check_out_at DESC NULLS LAST
  ),

  -- 4. Bookings already mapped to a payout
  with_payout AS (
    SELECT DISTINCT opd.unified_booking_id
    FROM ota_payout_details opd
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = opd.unified_booking_id
  ),

  -- 5. Bookings with active disputes
  with_dispute AS (
    SELECT DISTINCT od.unified_booking_id
    FROM ota_disputes od
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = od.unified_booking_id
    WHERE od.status IN ('OPEN', 'IN_REVIEW')
  ),

  -- 6. ELIGIBLE = checked_out + no payout + no active dispute
  eligible AS (
    SELECT
      ob.unified_booking_id,
      ob.ota_source,
      ob.channex_property_id,
      ob.ota_property_id,
      COALESCE(ob.total_amount_net, 0)::numeric AS amount,
      co.checkout_date,
      (CURRENT_DATE - co.checkout_date) AS days_since_checkout
    FROM ota_bookings ob
    INNER JOIN checked_out co ON co.unified_booking_id = ob.unified_booking_id
    LEFT JOIN with_payout wp ON wp.unified_booking_id = ob.unified_booking_id
    LEFT JOIN with_dispute wd ON wd.unified_booking_id = ob.unified_booking_id
    WHERE wp.unified_booking_id IS NULL
      AND wd.unified_booking_id IS NULL
  ),

  -- 7. Pending payouts — FIX: use net_payout_amount with fallback, filter is_voided=false
  pending_payouts AS (
    SELECT
      COALESCE(SUM(COALESCE(op.net_payout_amount, op.total_amount)), 0) AS pending_amount,
      COUNT(*) AS pending_count,
      COUNT(*) FILTER (WHERE op.payout_date < CURRENT_DATE) AS overdue_count,
      COALESCE(SUM(COALESCE(op.net_payout_amount, op.total_amount)) FILTER (WHERE op.payout_date < CURRENT_DATE), 0) AS overdue_amount
    FROM ota_payouts op
    WHERE op.status IN ('PENDING', 'PARTIAL')
      AND op.is_voided = false
      AND (p_property_id IS NULL OR EXISTS (
        SELECT 1 FROM ota_payout_details opd
        JOIN bookings_mirror bm ON bm.unified_booking_id = opd.unified_booking_id
        WHERE opd.payout_id = op.id
          AND bm.ota_property_id = p_property_id
      ))
      AND (p_source IS NULL OR EXISTS (
        SELECT 1 FROM ota_payout_details opd
        JOIN bookings_mirror bm ON bm.unified_booking_id = opd.unified_booking_id
        WHERE opd.payout_id = op.id
          AND bm.ota_source = p_source
      ))
      AND (p_channex_property_id IS NULL OR EXISTS (
        SELECT 1 FROM ota_payout_details opd
        JOIN bookings_mirror bm ON bm.unified_booking_id = opd.unified_booking_id
        WHERE opd.payout_id = op.id
          AND bm.channex_property_id = p_channex_property_id
      ))
  ),

  -- 8. Summary aggregation
  summary AS (
    SELECT
      COALESCE(SUM(amount), 0) AS eligible_amount,
      COUNT(*) AS eligible_count
    FROM eligible
  ),

  -- 9. Aging buckets
  aging AS (
    SELECT
      jsonb_build_array(
        jsonb_build_object('bucket', '0_7',
          'amount', COALESCE(SUM(amount) FILTER (WHERE days_since_checkout BETWEEN 0 AND 7), 0),
          'count', COUNT(*) FILTER (WHERE days_since_checkout BETWEEN 0 AND 7)
        ),
        jsonb_build_object('bucket', '8_14',
          'amount', COALESCE(SUM(amount) FILTER (WHERE days_since_checkout BETWEEN 8 AND 14), 0),
          'count', COUNT(*) FILTER (WHERE days_since_checkout BETWEEN 8 AND 14)
        ),
        jsonb_build_object('bucket', '15_30',
          'amount', COALESCE(SUM(amount) FILTER (WHERE days_since_checkout BETWEEN 15 AND 30), 0),
          'count', COUNT(*) FILTER (WHERE days_since_checkout BETWEEN 15 AND 30)
        ),
        jsonb_build_object('bucket', 'GT_30',
          'amount', COALESCE(SUM(amount) FILTER (WHERE days_since_checkout > 30), 0),
          'count', COUNT(*) FILTER (WHERE days_since_checkout > 30)
        )
      ) AS buckets
    FROM eligible
  ),

  -- 10. Breakdown by OTA source
  by_source AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'source', ota_source,
        'amount', src_amount,
        'count', src_count
      ) ORDER BY src_amount DESC
    ) AS items
    FROM (
      SELECT
        ota_source,
        SUM(amount) AS src_amount,
        COUNT(*) AS src_count
      FROM eligible
      GROUP BY ota_source
    ) src
  ),

  -- 11. Breakdown by ota_property_id + ota_source
  by_property AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'ota_property_id', ota_prop_id,
        'ota_source', prop_ota_source,
        'property_name', COALESCE(cup.property_name, LEFT(prop.channex_prop_id, 8) || '…'),
        'channex_property_id', prop.channex_prop_id,
        'amount', prop_amount,
        'count', prop_count
      ) ORDER BY prop_amount DESC
    ) AS items
    FROM (
      SELECT
        COALESCE(e.ota_property_id, 'unknown') AS ota_prop_id,
        e.ota_source AS prop_ota_source,
        (array_agg(e.channex_property_id))[1] AS channex_prop_id,
        SUM(e.amount) AS prop_amount,
        COUNT(*) AS prop_count
      FROM eligible e
      GROUP BY COALESCE(e.ota_property_id, 'unknown'), e.ota_source
    ) prop
    LEFT JOIN channex_user_properties cup
      ON cup.channex_property_id = prop.channex_prop_id
  )

  -- Final assembly
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'eligible_amount', s.eligible_amount,
      'eligible_count', s.eligible_count,
      'pending_amount', pp.pending_amount,
      'pending_count', pp.pending_count,
      'total_outstanding', s.eligible_amount + pp.pending_amount,
      'overdue_payout_count', pp.overdue_count,
      'overdue_payout_amount', pp.overdue_amount
    ),
    'aging', a.buckets,
    'by_source', COALESCE(bs.items, '[]'::jsonb),
    'by_property', COALESCE(bp.items, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s
  CROSS JOIN pending_payouts pp
  CROSS JOIN aging a
  CROSS JOIN by_source bs
  CROSS JOIN by_property bp;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Permissions unchanged (3-param signature already granted)
