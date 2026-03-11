-- ================================================================
-- BACKFILL: Create ledger entries for hotel_collects without one
-- ================================================================

CREATE OR REPLACE FUNCTION public.backfill_missing_ledger_entries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_default_account_id UUID;
  v_collection RECORD;
  v_entry_id UUID;
  v_account RECORD;
  v_backfill_count INT := 0;
BEGIN
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = v_org_id AND is_default = true AND is_archived = false
  LIMIT 1;
  
  IF v_default_account_id IS NULL THEN
    SELECT id INTO v_default_account_id
    FROM cash_accounts
    WHERE is_archived = false
    LIMIT 1;
  END IF;
  
  IF v_default_account_id IS NULL THEN
    RAISE EXCEPTION 'No cash account found. Please create at least one cash account first.';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;
  
  FOR v_collection IN 
    SELECT hc.*
    FROM hotel_collects hc
    LEFT JOIN ledger_entries le ON le.source_type = 'HOTEL_COLLECT' AND le.source_id = hc.id
    WHERE le.id IS NULL
      AND hc.status IN ('COLLECTED', 'REFUNDED')
    ORDER BY hc.collected_at ASC
  LOOP
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, created_by, note
    )
    VALUES (
      v_org_id,
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
        'backfilled', true,
        'backfill_date', now()::TEXT
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
    
    UPDATE hotel_collects 
    SET ledger_entry_id = v_entry_id
    WHERE id = v_collection.id;
    
    v_backfill_count := v_backfill_count + 1;
  END LOOP;
  
  RETURN v_backfill_count;
END;
$$;

COMMENT ON FUNCTION public.backfill_missing_ledger_entries IS
  'Backfill ledger entries for hotel_collects that do not have one. Safe to run multiple times.';

GRANT EXECUTE ON FUNCTION public.backfill_missing_ledger_entries TO authenticated;

-- Run backfill now
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT backfill_missing_ledger_entries() INTO v_count;
  RAISE NOTICE 'Backfilled % ledger entries', v_count;
END;
$$;