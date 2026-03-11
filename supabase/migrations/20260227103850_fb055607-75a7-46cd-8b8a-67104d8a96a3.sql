-- ============================================================================
-- rpc_get_ota_ar_dashboard_v2
-- Single aggregate RPC for OTA AR Dashboard tab.
-- Replaces 7 sequential client-side Supabase calls with 1 DB round-trip.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_ota_ar_dashboard_v2(
  p_property_id TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
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
  tenant_props AS (
    SELECT channex_property_id
    FROM channex_property_groups
    WHERE channex_group_id = v_group_id
  ),
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
      AND (p_property_id IS NULL OR bm.channex_property_id = p_property_id)
      AND (p_source IS NULL OR bm.ota_source = p_source)
  ),
  checked_out AS (
    SELECT DISTINCT ON (s.unified_booking_id)
      s.unified_booking_id,
      COALESCE(s.actual_check_out_at::date, ob.check_out_date) AS checkout_date
    FROM stays s
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = s.unified_booking_id
    WHERE s.stay_status = 'CHECKED_OUT'
    ORDER BY s.unified_booking_id, s.actual_check_out_at DESC NULLS LAST
  ),
  with_payout AS (
    SELECT DISTINCT opd.unified_booking_id
    FROM ota_payout_details opd
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = opd.unified_booking_id
  ),
  with_dispute AS (
    SELECT DISTINCT od.unified_booking_id
    FROM ota_disputes od
    INNER JOIN ota_bookings ob ON ob.unified_booking_id = od.unified_booking_id
    WHERE od.status IN ('OPEN', 'IN_REVIEW')
  ),
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
  pending_payouts AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS pending_amount,
      COUNT(*) AS pending_count,
      COUNT(*) FILTER (WHERE payout_date < CURRENT_DATE) AS overdue_count,
      COALESCE(SUM(total_amount) FILTER (WHERE payout_date < CURRENT_DATE), 0) AS overdue_amount
    FROM ota_payouts
    WHERE status IN ('PENDING', 'PARTIAL')
  ),
  summary AS (
    SELECT
      COALESCE(SUM(amount), 0) AS eligible_amount,
      COUNT(*) AS eligible_count
    FROM eligible
  ),
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
  by_property AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'property_id', prop_id,
        'property_name', COALESCE(cup.property_name, LEFT(prop_id, 8) || '…'),
        'ota_property_id', ota_prop_id,
        'amount', prop_amount,
        'count', prop_count
      ) ORDER BY prop_amount DESC
    ) AS items
    FROM (
      SELECT
        e.channex_property_id AS prop_id,
        (array_agg(e.ota_property_id ORDER BY e.ota_property_id) FILTER (WHERE e.ota_property_id IS NOT NULL))[1] AS ota_prop_id,
        SUM(e.amount) AS prop_amount,
        COUNT(*) AS prop_count
      FROM eligible e
      GROUP BY e.channex_property_id
    ) prop
    LEFT JOIN channex_user_properties cup
      ON cup.channex_property_id = prop.prop_id
  )
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

GRANT EXECUTE ON FUNCTION public.rpc_get_ota_ar_dashboard_v2(TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.rpc_get_ota_ar_dashboard_v2 IS
  'Single aggregate RPC for OTA AR Dashboard tab. Returns summary, aging, by_source, by_property in one call. Respects RLS via SECURITY INVOKER.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_ota_ar
  ON public.bookings_mirror (payment_type, channex_property_id, ota_source)
  WHERE booking_status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_stays_checkout_lookup
  ON public.stays (unified_booking_id, stay_status)
  WHERE stay_status = 'CHECKED_OUT';

CREATE INDEX IF NOT EXISTS idx_ota_payout_details_booking
  ON public.ota_payout_details (unified_booking_id);

CREATE INDEX IF NOT EXISTS idx_ota_disputes_active
  ON public.ota_disputes (unified_booking_id)
  WHERE status IN ('OPEN', 'IN_REVIEW');

COMMENT ON INDEX idx_bookings_mirror_ota_ar IS 'Supports rpc_get_ota_ar_dashboard_v2 eligible query';
COMMENT ON INDEX idx_stays_checkout_lookup IS 'Supports rpc_get_ota_ar_dashboard_v2 checkout join';
COMMENT ON INDEX idx_ota_payout_details_booking IS 'Supports rpc_get_ota_ar_dashboard_v2 payout exclusion';
COMMENT ON INDEX idx_ota_disputes_active IS 'Supports rpc_get_ota_ar_dashboard_v2 dispute exclusion';

-- no_show_financial_snapshots table
CREATE TABLE IF NOT EXISTS public.no_show_financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  unified_booking_id TEXT NOT NULL,
  collector_type TEXT NOT NULL CHECK (collector_type IN ('HOTEL', 'OTA')),
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  collected_amount NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  charge_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (charge_status IN ('PENDING', 'COLLECTED', 'WAIVED', 'REFUNDED')),
  snapshot_date DATE NOT NULL,
  revenue_posted BOOLEAN NOT NULL DEFAULT false,
  ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  refund_ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  removed_at TIMESTAMPTZ,
  prev_booking_status TEXT,
  prev_stay_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT uq_no_show_snapshot UNIQUE (org_id, unified_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_status
  ON no_show_financial_snapshots(charge_status)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_snapshot_booking
  ON no_show_financial_snapshots(unified_booking_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_date
  ON no_show_financial_snapshots(snapshot_date);

ALTER TABLE public.no_show_financial_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_show_snapshots_select"
  ON public.no_show_financial_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "no_show_snapshots_insert"
  ON public.no_show_financial_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "no_show_snapshots_update"
  ON public.no_show_financial_snapshots
  FOR UPDATE TO authenticated USING (true);

ALTER TABLE public.host_supply_segments
  ADD COLUMN IF NOT EXISTS is_voided_by_no_show BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_hss_noshow_voided
  ON host_supply_segments(unified_booking_id)
  WHERE is_voided_by_no_show = true;