-- ================================================================
-- EMERGENCY BACKFILL: Run this in Supabase SQL Editor to populate ledger_entries
-- This is a one-time script to fix missing ledger data
-- ================================================================

-- Step 1: Ensure default cash account exists
INSERT INTO cash_accounts (
  org_id, account_code, account_name, account_type, is_default, is_active
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'DEFAULT',
  'Tài khoản mặc định',
  'BANK',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM cash_accounts 
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid 
    AND is_default = true 
    AND is_archived = false
);

-- Step 2: Ensure default mapping rule exists
INSERT INTO account_mapping_rules (
  org_id, rule_name, priority, cash_account_id, effective_from
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Rule (Catch All)',
  9999,
  (SELECT id FROM cash_accounts WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_default = true LIMIT 1),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM account_mapping_rules 
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid 
    AND rule_name = 'Default Rule (Catch All)'
);

-- Step 3: Backfill ledger entries for hotel_collects
DO $$
DECLARE
  v_default_account_id UUID;
  v_account RECORD;
  v_collection RECORD;
  v_entry_id UUID;
  v_count INT := 0;
BEGIN
  -- Get default account
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid 
    AND is_default = true 
    AND is_archived = false
  LIMIT 1;

  IF v_default_account_id IS NULL THEN
    RAISE NOTICE 'No default account found, skipping backfill';
    RETURN;
  END IF;

  -- Get account details
  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;

  -- Loop through collections without ledger entries
  FOR v_collection IN 
    SELECT hc.*
    FROM hotel_collects hc
    LEFT JOIN ledger_entries le ON le.source_type = 'HOTEL_COLLECT' AND le.source_id = hc.id AND le.entry_type = 'ORIGINAL'
    WHERE le.id IS NULL
      AND hc.status IN ('COLLECTED', 'REFUNDED')
  LOOP
    -- Insert ledger entry
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, created_by, note
    )
    VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      COALESCE(v_collection.collected_at::DATE, CURRENT_DATE),
      COALESCE(v_collection.collected_at, now()),
      'HOTEL_COLLECT',
      v_collection.id,
      'ORIGINAL',
      v_default_account_id,
      jsonb_build_object(
        'code', v_account.account_code,
        'name', v_account.account_name,
        'bank_name', v_account.bank_name,
        'account_number', v_account.account_number,
        'backfilled', true
      ),
      CASE WHEN v_collection.collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END,
      ABS(v_collection.amount_collected),
      'VND',
      v_collection.payer_type,
      v_collection.unified_booking_id,
      v_collection.collected_by,
      'Backfill: ' || COALESCE(v_collection.note, v_collection.collection_type)
    )
    RETURNING id INTO v_entry_id;

    -- Update hotel_collects
    UPDATE hotel_collects SET ledger_entry_id = v_entry_id WHERE id = v_collection.id;
    
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % ledger entries for hotel_collects', v_count;
END;
$$;

-- Step 4: Backfill for cash_outs
DO $$
DECLARE
  v_default_account_id UUID;
  v_account RECORD;
  v_cashout RECORD;
  v_count INT := 0;
BEGIN
  -- Get default account
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid 
    AND is_default = true 
    AND is_archived = false
  LIMIT 1;

  IF v_default_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;

  FOR v_cashout IN 
    SELECT co.*, pr.request_code
    FROM cash_outs co
    JOIN payment_requests pr ON co.payment_request_id = pr.id
    LEFT JOIN ledger_entries le ON le.source_type = 'CASH_OUT' AND le.source_id = co.id AND le.entry_type = 'ORIGINAL'
    WHERE le.id IS NULL
  LOOP
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, created_by, note
    )
    VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      COALESCE(v_cashout.paid_at::DATE, CURRENT_DATE),
      COALESCE(v_cashout.paid_at, now()),
      'CASH_OUT',
      v_cashout.id,
      'ORIGINAL',
      v_default_account_id,
      jsonb_build_object(
        'code', v_account.account_code,
        'name', v_account.account_name,
        'backfilled', true
      ),
      'CREDIT',
      v_cashout.amount,
      'VND',
      'PAYMENT_REQUEST',
      v_cashout.payment_request_id::TEXT,
      v_cashout.paid_by,
      'Backfill: ' || COALESCE(v_cashout.note, v_cashout.request_code)
    );
    
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % ledger entries for cash_outs', v_count;
END;
$$;

-- Step 5: Verify results
SELECT 
  'ledger_entries' as table_name, 
  count(*) as total,
  count(*) FILTER (WHERE source_type = 'HOTEL_COLLECT') as hotel_collect,
  count(*) FILTER (WHERE source_type = 'CASH_OUT') as cash_out,
  count(*) FILTER (WHERE source_type = 'OTA_PAYOUT') as ota_payout
FROM ledger_entries;

SELECT 
  'hotel_collects' as table_name,
  count(*) as total,
  count(*) FILTER (WHERE ledger_entry_id IS NOT NULL) as has_ledger
FROM hotel_collects;
