-- Fix v1: recalculate_ota_payout_status - add ::payout_status cast
CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status(p_payout_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_total_received NUMERIC;
  v_expected_amount NUMERIC;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF v_payout IS NULL THEN RETURN; END IF;
  
  WITH voided_ids AS (
    SELECT related_collection_id FROM hotel_collects 
    WHERE source_payout_id = p_payout_id AND collection_type = 'VOID' AND related_collection_id IS NOT NULL
  )
  SELECT COALESCE(SUM(hc.amount_collected), 0) INTO v_total_received
  FROM hotel_collects hc
  WHERE hc.source_payout_id = p_payout_id AND hc.related_type = 'OTA_PAYOUT' AND hc.collection_type = 'COLLECT'
    AND hc.id NOT IN (SELECT related_collection_id FROM voided_ids WHERE related_collection_id IS NOT NULL);
  
  v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
  
  IF v_total_received <= 0 THEN v_new_status := 'PENDING';
  ELSIF v_total_received >= v_expected_amount THEN v_new_status := 'RECEIVED';
  ELSE v_new_status := 'PARTIAL'; END IF;
  
  UPDATE ota_payouts SET status = v_new_status::payout_status,
    reconciled_at = CASE WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now()) ELSE NULL END
  WHERE id = p_payout_id;
END;
$$