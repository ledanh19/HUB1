-- ============================================
-- FIX: recalculate_ota_payout_status_v2
-- BUG: Payout shows "Về một phần" (PARTIAL) even when full amount is received
-- ROOT CAUSE: Numeric precision mismatch between net_payout_amount and allocated amounts
-- FIX: Add 1 VND tolerance for RECEIVED comparison
-- ============================================

CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status_v2(
  p_payout_id UUID
) RETURNS VOID
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
  
  IF v_payout IS NULL THEN
    RETURN;
  END IF;
  
  -- Get voided collection IDs (collections that were reversed)
  -- A VOID record references the original collection via related_collection_id
  WITH voided_originals AS (
    SELECT hc.related_collection_id 
    FROM hotel_collects hc
    WHERE hc.collection_type = 'VOID'
      AND hc.related_collection_id IS NOT NULL
      AND hc.related_collection_id IN (
        SELECT cpa.collection_id 
        FROM collection_payout_allocations cpa 
        WHERE cpa.payout_id = p_payout_id
      )
  )
  -- Sum allocated amounts from junction table (excluding voided)
  SELECT COALESCE(SUM(cpa.allocated_amount), 0)
  INTO v_total_received
  FROM collection_payout_allocations cpa
  INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
  WHERE cpa.payout_id = p_payout_id
    AND hc.collection_type = 'COLLECT'
    AND hc.id NOT IN (SELECT related_collection_id FROM voided_originals);
  
  v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
  
  -- Use 1 VND tolerance for comparison to handle rounding differences
  IF v_total_received <= 0 THEN
    v_new_status := 'PENDING';
  ELSIF v_total_received >= (v_expected_amount - 1) THEN
    -- Within 1 VND = fully received
    v_new_status := 'RECEIVED';
  ELSE
    v_new_status := 'PARTIAL';
  END IF;
  
  UPDATE ota_payouts 
  SET 
    status = v_new_status,
    reconciled_at = CASE 
      WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now())
      ELSE reconciled_at  -- Keep existing reconciled_at instead of NULLing
    END
  WHERE id = p_payout_id;
END;
$$;

-- Also fix existing PARTIAL payouts that should be RECEIVED
-- Run recalculation for all PARTIAL payouts
DO $$
DECLARE
  v_payout_id UUID;
BEGIN
  FOR v_payout_id IN 
    SELECT id FROM ota_payouts WHERE status = 'PARTIAL'
  LOOP
    PERFORM recalculate_ota_payout_status_v2(v_payout_id);
  END LOOP;
END $$;
