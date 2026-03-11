
-- CONTROLLED REPAIR: Fix settlement ST1772878511908TNJO linkage corruption
-- Unlink 2 wrong supply segments, link 2 correct extra charges
-- With row-count assertions and full audit trail

DO $$
DECLARE
  v_settlement_id UUID := 'e0a35fe4-f297-4130-b71f-876191c9c19b';
  v_settlement_code TEXT := 'ST1772878511908TNJO';
  v_seg1 UUID := 'ed214b1b-31c8-413b-b9f1-6ff6150a7433';
  v_seg2 UUID := '93a4b292-7f86-4af5-b3f0-39887a12fecd';
  v_ec1  UUID := 'e15b0504-b607-4a6f-b971-391185c608bb';
  v_ec2  UUID := '57a10179-49ad-42e3-b884-e984be2cce7c';
  v_rows_affected INT;
  v_settlement_status TEXT;
  v_settlement_amount NUMERIC;
  v_seg_before JSONB;
  v_ec_before JSONB;
BEGIN
  -- ========== GATE ASSERTIONS ==========
  SELECT status, total_payable_amount
  INTO v_settlement_status, v_settlement_amount
  FROM host_settlements
  WHERE id = v_settlement_id;

  IF v_settlement_status != 'CLOSED' THEN
    RAISE EXCEPTION 'GATE FAIL: settlement status is %, expected CLOSED', v_settlement_status;
  END IF;

  IF v_settlement_amount != 700000 THEN
    RAISE EXCEPTION 'GATE FAIL: total_payable_amount is %, expected 700000', v_settlement_amount;
  END IF;

  -- Snapshot segments before
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'settlement_id', settlement_id, 'locked_at', locked_at, 'total_amount', total_amount
  ))
  INTO v_seg_before
  FROM host_supply_segments
  WHERE id IN (v_seg1, v_seg2);

  -- Snapshot extra charges before
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'settlement_id', settlement_id, 'locked_at', locked_at, 'amount', amount
  ))
  INTO v_ec_before
  FROM host_extra_charges
  WHERE id IN (v_ec1, v_ec2);

  -- ========== STEP 1: UNLINK WRONG SEGMENTS ==========
  UPDATE host_supply_segments
  SET settlement_id = NULL, locked_at = NULL, updated_at = NOW()
  WHERE id IN (v_seg1, v_seg2)
    AND settlement_id = v_settlement_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected != 2 THEN
    RAISE EXCEPTION 'ROW COUNT FAIL: unlink segments affected % rows, expected 2', v_rows_affected;
  END IF;

  -- ========== STEP 2: LINK CORRECT EXTRA CHARGES ==========
  UPDATE host_extra_charges
  SET settlement_id = v_settlement_id, locked_at = NOW()
  WHERE id IN (v_ec1, v_ec2)
    AND settlement_id IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected != 2 THEN
    RAISE EXCEPTION 'ROW COUNT FAIL: link extra charges affected % rows, expected 2', v_rows_affected;
  END IF;

  -- ========== STEP 3: AUDIT LOG - UNLINK ==========
  INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data, is_override, override_reason)
  VALUES (
    'REPAIR_UNLINK_WRONG_SEGMENTS',
    'host_settlements',
    v_settlement_id::TEXT,
    v_seg_before,
    jsonb_build_object(
      'settlement_code', v_settlement_code,
      'unlinked_segment_ids', jsonb_build_array(v_seg1, v_seg2),
      'reason', 'Historical linkage corruption: settlement linked room segments instead of extra charges'
    ),
    TRUE,
    'Controlled repair: settlement ' || v_settlement_code || ' had wrong item linkage. Repair approved after audit.'
  );

  -- ========== STEP 4: AUDIT LOG - LINK ==========
  INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data, is_override, override_reason)
  VALUES (
    'REPAIR_LINK_CORRECT_EXTRAS',
    'host_settlements',
    v_settlement_id::TEXT,
    v_ec_before,
    jsonb_build_object(
      'settlement_code', v_settlement_code,
      'linked_extra_charge_ids', jsonb_build_array(v_ec1, v_ec2),
      'total_linked_amount', 700000,
      'reason', 'Link correct extra charges (200000 OTHER + 500000 LATE_CHECKOUT) matching settlement total_payable_amount'
    ),
    TRUE,
    'Controlled repair: link correct extra charges to settlement ' || v_settlement_code
  );

END $$;
