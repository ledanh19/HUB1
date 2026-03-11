-- ============================================================================
-- PATCH: Add ota_source to by_property breakdown in rpc_get_ota_ar_dashboard_v2
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
      AND (p_property_id IS NULL OR bm.ota_property_id = p_property_id)
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
  'Single aggregate RPC for OTA AR Dashboard tab. Returns summary, aging, by_source, by_property (with ota_source) in one call. Respects RLS via SECURITY INVOKER.';

-- Drop and recreate to fix parameter defaults issue
DROP FUNCTION IF EXISTS public.create_multi_payout_cashin_atomic(uuid[],numeric[],uuid,text,text,text,text,text,uuid,numeric);

CREATE FUNCTION public.create_multi_payout_cashin_atomic(
  p_payout_ids UUID[],
  p_amounts NUMERIC[],
  p_cash_account_id UUID,
  p_received_at TEXT,
  p_payment_method TEXT,
  p_payment_channel TEXT,
  p_bank_reference TEXT,
  p_note TEXT,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  p_total_amount NUMERIC DEFAULT NULL
) RETURNS UUID[]
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  v_collection_ids UUID[] := '{}';
  v_collection_id UUID;
  v_ledger_entry_id UUID;
  v_payout RECORD;
  v_account RECORD;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_i INT;
  v_amount NUMERIC;
  v_payout_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  IF array_length(p_payout_ids, 1) != array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'payout_ids and amounts arrays must have same length';
  END IF;
  
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'cash_account_id là bắt buộc';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động: %', p_cash_account_id;
  END IF;
  
  IF is_period_locked(p_org_id, p_received_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', p_received_at;
  END IF;
  
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    v_payout_id := p_payout_ids[v_i];
    v_amount := p_amounts[v_i];
    
    IF v_amount <= 0 THEN CONTINUE; END IF;
    
    SELECT * INTO v_payout FROM ota_payouts WHERE id = v_payout_id;
    IF v_payout IS NULL THEN
      RAISE EXCEPTION 'OTA Payout không tồn tại: %', v_payout_id;
    END IF;
    
    INSERT INTO hotel_collects (
      unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
      related_type, collected_at, collected_by, collection_type,
      receipt, note, status
    ) VALUES (
      'OTA-PAYOUT-' || LEFT(v_payout_id::TEXT, 8), v_amount, p_payment_method, 'ROOMRISE', 'OTA',
      'OTA_PAYOUT', p_received_at::TIMESTAMPTZ, v_user_id, 'COLLECT',
      p_bank_reference, COALESCE(p_note, 'Tiền OTA ' || v_payout.ota_source || ' về'), 'COLLECTED'
    ) RETURNING id INTO v_collection_id;
    
    INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
    VALUES (v_collection_id, v_payout_id, v_amount);
    
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, counterparty_name, created_by, note
    ) VALUES (
      p_org_id, p_received_at::DATE, now(), 'OTA_PAYOUT', v_collection_id, 'ORIGINAL',
      p_cash_account_id,
      jsonb_build_object('code', v_account.account_code, 'name', v_account.account_name,
        'type', v_account.account_type, 'bank_name', v_account.bank_name,
        'account_number', v_account.account_number, 'selected_at', now()::TEXT,
        'selected_by', v_user_id::TEXT),
      'DEBIT', v_amount, 'VND', 'OTA', v_payout.ota_source,
      v_payout.ota_source || ' Payout', v_user_id,
      'OTA Payout Cash-In: ' || COALESCE(p_note, v_payout.ota_source)
    ) RETURNING id INTO v_ledger_entry_id;
    
    INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
    VALUES (p_received_at::DATE, v_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
      'OTA ' || v_payout.ota_source || ' payout - ' || COALESCE(p_bank_reference, ''), v_user_id);
    
    PERFORM recalculate_ota_payout_status_v2(v_payout_id, p_received_at::TIMESTAMPTZ);
    
    UPDATE ota_payouts
    SET received_at = COALESCE(received_at, p_received_at::TIMESTAMPTZ)
    WHERE id = v_payout_id AND received_at IS NULL;
    
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES ('OTA_PAYOUT_CASHIN_ATOMIC', 'hotel_collects', v_collection_id::TEXT, v_user_id,
      jsonb_build_object('payout_id', v_payout_id, 'collection_id', v_collection_id,
        'ledger_entry_id', v_ledger_entry_id, 'amount', v_amount, 'cash_account_id', p_cash_account_id));
    
    v_collection_ids := v_collection_ids || v_collection_id;
  END LOOP;
  
  RETURN v_collection_ids;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_multi_payout_cashin_atomic TO authenticated;

-- Backfill: set received_at from hotel_collects.collected_at for RECEIVED payouts with NULL received_at
UPDATE ota_payouts p
SET received_at = t.collected_at
FROM (
  SELECT cpa.payout_id, MAX(hc.collected_at) AS collected_at
  FROM collection_payout_allocations cpa
  JOIN hotel_collects hc ON hc.id = cpa.collection_id AND hc.collection_type = 'COLLECT'
  WHERE cpa.payout_id IN (
    SELECT id FROM ota_payouts WHERE status = 'RECEIVED' AND received_at IS NULL
  )
  GROUP BY cpa.payout_id
) t
WHERE p.id = t.payout_id AND p.received_at IS NULL