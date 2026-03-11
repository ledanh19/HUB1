-- ============================================================
-- SPRINT 3.1 — Formalize bank fee RPC fix (cash_account_id)
-- Date: 2026-03-04
-- NON-BREAKING, ADDITIVE ONLY
-- 
-- Context: Hotfix applied directly to fix NOT NULL violation
-- on ledger_entries.cash_account_id when posting bank fees.
-- This migration formalizes the fix into version control.
-- ============================================================

CREATE OR REPLACE FUNCTION public.post_ota_payout_bank_fee_to_ledger_atomic(p_payout_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payout record;
  v_recon_item record;
  v_ledger_id uuid;
  v_fee_amount numeric;
  v_entry_date date;
  v_existing_id uuid;
  v_org_id uuid;
  v_cash_account_id uuid;
  v_account_snapshot jsonb;
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
    v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  -- Look up default cash account (same pattern as adjustment RPC)
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

  -- Idempotency: check existing ledger entry
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
    cash_account_id, account_snapshot,
    counterparty_type, counterparty_name,
    is_posted, is_reversed, note, created_by
  ) VALUES (
    v_org_id, v_entry_date, v_entry_date::timestamptz, 'OTA_PAYOUT_BANK_FEE', p_payout_id,
    'ORIGINAL', 'CREDIT', v_fee_amount, 'VND',
    v_cash_account_id, v_account_snapshot,
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
$function$;

-- ─── Verification block ─────────────────────────────────────
DO $$
DECLARE
  v_fn_exists boolean;
  v_has_cash_account boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'post_ota_payout_bank_fee_to_ledger_atomic'
  ) INTO v_fn_exists;

  SELECT pg_get_functiondef(oid) ILIKE '%cash_account_id%'
  INTO v_has_cash_account
  FROM pg_proc
  WHERE proname = 'post_ota_payout_bank_fee_to_ledger_atomic'
    AND pronamespace = 'public'::regnamespace;

  IF v_fn_exists AND v_has_cash_account THEN
    RAISE NOTICE 'Sprint 3.1 PASS: bank fee RPC exists with cash_account_id';
  ELSE
    RAISE WARNING 'Sprint 3.1 FAIL: fn_exists=%, has_cash_account=%', v_fn_exists, v_has_cash_account;
  END IF;
END;
$$;