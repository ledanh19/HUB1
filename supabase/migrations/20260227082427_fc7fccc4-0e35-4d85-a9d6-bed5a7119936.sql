
-- Fix: ota_payouts has no org_id, use default org_id from ledger_entries
CREATE OR REPLACE FUNCTION public.post_ota_payout_bank_fee_to_ledger_atomic(
  p_payout_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_recon_item RECORD;
  v_ledger_id uuid;
  v_existing_ledger_id uuid;
  v_user_id uuid;
  v_entry_date date;
  v_cash_account_id uuid;
  v_account_snapshot jsonb;
  v_org_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout % không tồn tại', p_payout_id;
  END IF;

  SELECT * INTO v_recon_item
  FROM ota_payout_reconciliation_items
  WHERE payout_id = p_payout_id AND item_type = 'BANK_TRANSFER_FEE';

  IF v_recon_item IS NULL THEN
    RAISE EXCEPTION 'Payout % không có mục BANK_TRANSFER_FEE', p_payout_id;
  END IF;

  -- Already posted via recon item link
  IF v_recon_item.ledger_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'ledger_entry_id', v_recon_item.ledger_entry_id,
      'posted_amount', v_recon_item.amount,
      'already_posted', true
    );
  END IF;

  -- Check via ledger idempotent index
  SELECT id INTO v_existing_ledger_id
  FROM ledger_entries
  WHERE source_type = 'OTA_PAYOUT_BANK_FEE'
    AND source_id = p_payout_id
    AND entry_type = 'ORIGINAL'
    AND org_id = v_org_id
  LIMIT 1;

  IF v_existing_ledger_id IS NOT NULL THEN
    UPDATE ota_payout_reconciliation_items
    SET ledger_entry_id = v_existing_ledger_id
    WHERE id = v_recon_item.id;

    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'ledger_entry_id', v_existing_ledger_id,
      'posted_amount', v_recon_item.amount,
      'already_posted', true,
      'linked_existing', true
    );
  END IF;

  -- entry_date: reconciled_at > payout_period_to > created_at
  v_entry_date := COALESCE(
    v_payout.reconciled_at::date,
    v_payout.payout_period_to::date,
    v_recon_item.created_at::date
  );

  -- Default cash account
  SELECT id INTO v_cash_account_id
  FROM cash_accounts
  WHERE is_default = true AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản tiền mặc định';
  END IF;

  SELECT jsonb_build_object(
    'account_name', account_name,
    'account_code', account_code,
    'account_type', account_type
  ) INTO v_account_snapshot
  FROM cash_accounts WHERE id = v_cash_account_id;

  -- Insert ledger entry (CREDIT = expense)
  INSERT INTO ledger_entries (
    org_id, entry_date, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount,
    counterparty_type, counterparty_name,
    is_posted, note, created_by
  ) VALUES (
    v_org_id,
    v_entry_date,
    'OTA_PAYOUT_BANK_FEE',
    p_payout_id,
    'ORIGINAL',
    v_cash_account_id,
    v_account_snapshot,
    'CREDIT',
    v_recon_item.amount,
    'OTA',
    v_payout.ota_source,
    true,
    format('Phí chuyển khoản NH - Payout %s (%s)',
      COALESCE(v_payout.provider_payout_id, LEFT(p_payout_id::text, 8)),
      v_payout.ota_source
    ),
    v_user_id
  )
  RETURNING id INTO v_ledger_id;

  -- Link back
  UPDATE ota_payout_reconciliation_items
  SET ledger_entry_id = v_ledger_id
  WHERE id = v_recon_item.id;

  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'LEDGER_POST_BANK_FEE',
    'ledger_entries',
    v_ledger_id::text,
    v_user_id,
    jsonb_build_object('payout_id', p_payout_id, 'recon_item_id', v_recon_item.id),
    jsonb_build_object(
      'ledger_entry_id', v_ledger_id,
      'amount', v_recon_item.amount,
      'direction', 'CREDIT',
      'entry_date', v_entry_date,
      'source_type', 'OTA_PAYOUT_BANK_FEE',
      'ota_source', v_payout.ota_source
    )
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'ledger_entry_id', v_ledger_id,
    'posted_amount', v_recon_item.amount,
    'entry_date', v_entry_date,
    'already_posted', false
  );
END;
$$;
