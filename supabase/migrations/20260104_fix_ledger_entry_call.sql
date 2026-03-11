-- ================================================================
-- FIX: create_collection_ledger_atomic calls post_ledger_entry_idempotent with wrong signature
-- Root cause: positional args in wrong order
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_collection_ledger_atomic(
  p_unified_booking_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,             -- This is now CANONICAL (CASH, BANK_TRANSFER, CARD, QR)
  p_collection_type TEXT DEFAULT 'COLLECT',
  p_related_type TEXT DEFAULT 'BOOKING',
  p_payer_type TEXT DEFAULT 'GUEST',
  p_related_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_provider TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_collection_id UUID;
  v_direction TEXT;
  v_cash_account_id UUID;
  v_entry_date DATE := CURRENT_DATE;
  v_ledger_entry_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be positive';
  END IF;
  
  -- Validate collection_type
  IF p_collection_type NOT IN ('COLLECT', 'REFUND') THEN
    RAISE EXCEPTION 'Invalid collection_type: %. Must be COLLECT or REFUND', p_collection_type;
  END IF;
  
  -- *** Check period lock ***
  IF is_period_locked(v_org_id, v_entry_date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo thu tiền cho ngày %', v_entry_date;
  END IF;
  
  -- Insert hotel_collect with canonical_payment_method and payment_provider
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    canonical_payment_method, payment_provider,
    collection_type, related_type, related_id, payer_type,
    note, collected_by, payee_type, status,
    related_collection_id, reason_note
  )
  VALUES (
    p_unified_booking_id, 
    CASE WHEN p_collection_type = 'REFUND' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_method,
    p_payment_method,
    p_payment_provider,
    p_collection_type, p_related_type, p_related_id, p_payer_type,
    p_note, v_user_id, 'ROOMRISE',
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTED' ELSE 'REFUNDED' END,
    NULL, NULL
  )
  RETURNING id INTO v_collection_id;
  
  -- Create cashflow entry
  INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
  VALUES (
    v_entry_date,
    p_amount,
    CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
    'HOTEL_COLLECT',
    v_collection_id,
    p_payer_type,
    CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tiền (atomic)' ELSE 'Hoàn tiền (atomic)' END,
    v_user_id
  );
  
  -- Resolve cash account (use override if provided, else auto-resolve)
  IF p_cash_account_id IS NOT NULL THEN
    v_cash_account_id := p_cash_account_id;
  ELSE
    v_direction := CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END;
    v_cash_account_id := resolve_account_mapping(
      CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
      'HOTEL_COLLECT',
      p_payment_method,
      p_payer_type
    );
  END IF;
  
  -- *** FIXED: Call post_ledger_entry_idempotent with correct signature ***
  -- Signature: (p_source_type, p_source_id, p_cash_account_id, p_direction, p_amount, p_entry_date, p_counterparty_type, p_counterparty_id, p_note, p_org_id)
  v_ledger_entry_id := post_ledger_entry_idempotent(
    'HOTEL_COLLECT',                                          -- p_source_type
    v_collection_id,                                          -- p_source_id
    v_cash_account_id,                                        -- p_cash_account_id
    CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END,  -- p_direction
    p_amount,                                                 -- p_amount
    v_entry_date,                                             -- p_entry_date
    p_payer_type,                                             -- p_counterparty_type
    p_unified_booking_id,                                     -- p_counterparty_id
    p_note,                                                   -- p_note
    v_org_id                                                  -- p_org_id
  );
  
  -- Save ledger_entry_id back to hotel_collects
  UPDATE hotel_collects
  SET ledger_entry_id = v_ledger_entry_id
  WHERE id = v_collection_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, new_value)
  VALUES (
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTION_CREATED' ELSE 'REFUND_CREATED' END,
    'hotel_collects',
    v_collection_id,
    v_user_id,
    jsonb_build_object(
      'unified_booking_id', p_unified_booking_id,
      'amount', p_amount,
      'collection_type', p_collection_type,
      'canonical_payment_method', p_payment_method,
      'payment_provider', p_payment_provider,
      'cash_account_id', v_cash_account_id,
      'ledger_entry_id', v_ledger_entry_id
    )
  );
  
  RETURN v_collection_id;
END;
$$;

COMMENT ON FUNCTION public.create_collection_ledger_atomic IS
  'Create collection with automatic ledger entry.
   FIXED: Correct call to post_ledger_entry_idempotent with proper signature.
   Uses canonical_payment_method for mapping.
   Cash account auto-resolved unless explicitly overridden.';

-- ================================================================
-- PART 2: BACKFILL LEDGER ENTRIES FOR EXISTING COLLECTIONS
-- Creates ledger entries for hotel_collects that don't have one
-- ================================================================

DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_default_account_id UUID;
  v_collection RECORD;
  v_entry_id UUID;
  v_account RECORD;
  v_backfill_count INT := 0;
BEGIN
  -- Get default account
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = v_org_id AND is_default = true AND is_archived = false
  LIMIT 1;
  
  IF v_default_account_id IS NULL THEN
    RAISE NOTICE 'No default account found, skipping backfill';
    RETURN;
  END IF;
  
  -- Get account details for snapshot
  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;
  
  -- Loop through collections without ledger entries
  FOR v_collection IN 
    SELECT hc.*
    FROM hotel_collects hc
    LEFT JOIN ledger_entries le ON le.source_type = 'HOTEL_COLLECT' AND le.source_id = hc.id
    WHERE le.id IS NULL
      AND hc.status IN ('COLLECTED', 'REFUNDED')
    ORDER BY hc.collected_at ASC
  LOOP
    -- Insert ledger entry
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
    
    -- Update hotel_collects with ledger_entry_id
    UPDATE hotel_collects 
    SET ledger_entry_id = v_entry_id
    WHERE id = v_collection.id;
    
    v_backfill_count := v_backfill_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfilled % ledger entries for hotel_collects', v_backfill_count;
END;
$$;

-- ================================================================
-- PART 3: BACKFILL LEDGER ENTRIES FOR CASH_OUTS
-- Creates ledger entries for cash_outs that don't have one
-- ================================================================

DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_default_account_id UUID;
  v_cashout RECORD;
  v_entry_id UUID;
  v_account RECORD;
  v_backfill_count INT := 0;
BEGIN
  -- Get default account
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = v_org_id AND is_default = true AND is_archived = false
  LIMIT 1;
  
  IF v_default_account_id IS NULL THEN
    RAISE NOTICE 'No default account found, skipping cash_outs backfill';
    RETURN;
  END IF;
  
  -- Get account details for snapshot
  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;
  
  -- Loop through cash_outs without ledger entries
  FOR v_cashout IN 
    SELECT co.*, pr.request_code, pr.payment_type
    FROM cash_outs co
    JOIN payment_requests pr ON co.payment_request_id = pr.id
    LEFT JOIN ledger_entries le ON le.source_type = 'CASH_OUT' AND le.source_id = co.id
    WHERE le.id IS NULL
    ORDER BY co.paid_at ASC
  LOOP
    -- Insert ledger entry
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, created_by, note
    )
    VALUES (
      v_org_id,
      COALESCE(v_cashout.paid_at::DATE, CURRENT_DATE),
      COALESCE(v_cashout.paid_at, now()),
      'CASH_OUT',
      v_cashout.id,
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
      'CREDIT',  -- Cash out = tiền ra = CREDIT
      v_cashout.amount,
      'VND',
      'PAYMENT_REQUEST',
      v_cashout.payment_request_id::TEXT,
      v_cashout.paid_by,
      'Backfill: ' || COALESCE(v_cashout.note, v_cashout.request_code)
    )
    RETURNING id INTO v_entry_id;
    
    v_backfill_count := v_backfill_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfilled % ledger entries for cash_outs', v_backfill_count;
END;
$$;

-- ================================================================
-- PART 4: BACKFILL LEDGER ENTRIES FOR OTA_PAYOUT CASH-INS
-- Creates ledger entries for OTA payout receipts that don't have one
-- ================================================================

DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_default_account_id UUID;
  v_collection RECORD;
  v_entry_id UUID;
  v_account RECORD;
  v_backfill_count INT := 0;
BEGIN
  -- Get default account
  SELECT id INTO v_default_account_id
  FROM cash_accounts
  WHERE org_id = v_org_id AND is_default = true AND is_archived = false
  LIMIT 1;
  
  IF v_default_account_id IS NULL THEN
    RAISE NOTICE 'No default account found, skipping OTA payout backfill';
    RETURN;
  END IF;
  
  -- Get account details for snapshot
  SELECT * INTO v_account FROM cash_accounts WHERE id = v_default_account_id;
  
  -- Loop through OTA payout collections without ledger entries
  FOR v_collection IN 
    SELECT hc.*, op.ota_source
    FROM hotel_collects hc
    LEFT JOIN ota_payouts op ON hc.source_payout_id = op.id
    LEFT JOIN ledger_entries le ON le.source_type = 'OTA_PAYOUT' AND le.source_id = hc.id
    WHERE hc.related_type = 'OTA_PAYOUT'
      AND le.id IS NULL
      AND hc.status = 'COLLECTED'
    ORDER BY hc.collected_at ASC
  LOOP
    -- Insert ledger entry
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, counterparty_name, created_by, note
    )
    VALUES (
      v_org_id,
      COALESCE(v_collection.collected_at::DATE, CURRENT_DATE),
      COALESCE(v_collection.collected_at, now()),
      'OTA_PAYOUT',
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
      'DEBIT',  -- OTA payout = tiền vào = DEBIT
      ABS(v_collection.amount_collected),
      'VND',
      'OTA',
      v_collection.ota_source,
      COALESCE(v_collection.ota_source, 'OTA') || ' Payout',
      v_collection.collected_by,
      'Backfill OTA Payout: ' || COALESCE(v_collection.note, '')
    )
    RETURNING id INTO v_entry_id;
    
    -- Update hotel_collects with ledger_entry_id
    UPDATE hotel_collects 
    SET ledger_entry_id = v_entry_id
    WHERE id = v_collection.id;
    
    v_backfill_count := v_backfill_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfilled % ledger entries for OTA payout cash-ins', v_backfill_count;
END;
$$;

-- ================================================================
-- DONE: Migration complete
-- Summary:
-- 1. Fixed create_collection_ledger_atomic function signature
-- 2. Backfilled ledger entries for hotel_collects
-- 3. Backfilled ledger entries for cash_outs  
-- 4. Backfilled ledger entries for OTA payout cash-ins
-- ================================================================
