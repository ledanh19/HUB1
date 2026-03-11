
-- Fix historical bank fee ledger entries: entry_date should be payout_date (when fee was incurred)
UPDATE ledger_entries le
SET entry_date = op.payout_date::date,
    posting_at = op.payout_date::timestamptz
FROM ota_payouts op
WHERE le.source_type = 'OTA_PAYOUT_BANK_FEE'
  AND le.source_id = op.id
  AND le.entry_date != op.payout_date::date;

-- Fix RPC to use payout_date instead of now() for entry_date
CREATE OR REPLACE FUNCTION post_ota_payout_bank_fee_to_ledger_atomic(p_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout record;
  v_recon_item record;
  v_ledger_id uuid;
  v_fee_amount numeric;
  v_entry_date date;
  v_existing_id uuid;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout % not found', p_payout_id;
  END IF;

  SELECT * INTO v_recon_item
  FROM ota_payout_reconciliation_items
  WHERE payout_id = p_payout_id AND item_type = 'BANK_TRANSFER_FEE'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No BANK_TRANSFER_FEE reconciliation item for payout %', p_payout_id;
  END IF;

  v_fee_amount := v_recon_item.amount;
  v_entry_date := COALESCE(v_payout.payout_date::date, CURRENT_DATE);

  SELECT org_id INTO v_org_id FROM ledger_entries LIMIT 1;
  IF v_org_id IS NULL THEN
    v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  SELECT id INTO v_existing_id
  FROM ledger_entries
  WHERE source_type = 'OTA_PAYOUT_BANK_FEE' AND source_id = p_payout_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE ota_payout_reconciliation_items
    SET ledger_entry_id = v_existing_id
    WHERE id = v_recon_item.id AND (ledger_entry_id IS NULL OR ledger_entry_id != v_existing_id);

    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'ledger_entry_id', v_existing_id,
      'posted_amount', v_fee_amount,
      'entry_date', v_entry_date,
      'status', 'already_posted'
    );
  END IF;

  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id,
    entry_type, direction, amount, currency,
    counterparty_type, counterparty_name,
    is_posted, is_reversed, note, created_by
  ) VALUES (
    v_org_id, v_entry_date, v_entry_date::timestamptz, 'OTA_PAYOUT_BANK_FEE', p_payout_id,
    'ORIGINAL', 'CREDIT', v_fee_amount, 'VND',
    'BANK', COALESCE(v_payout.ota_source, 'OTA'),
    true, false,
    format('Phí chuyển khoản NH - Payout %s (%s)', v_payout.provider_payout_id, v_payout.ota_source),
    auth.uid()
  )
  RETURNING id INTO v_ledger_id;

  UPDATE ota_payout_reconciliation_items
  SET ledger_entry_id = v_ledger_id
  WHERE id = v_recon_item.id;

  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'LEDGER_POST_BANK_FEE', 'ledger_entries', v_ledger_id::text,
    jsonb_build_object('payout_id', p_payout_id, 'amount', v_fee_amount, 'entry_date', v_entry_date),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'ledger_entry_id', v_ledger_id,
    'posted_amount', v_fee_amount,
    'entry_date', v_entry_date,
    'status', 'posted'
  );
END;
$$;
