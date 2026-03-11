-- ============================================
-- FIX: OTA Payout "Ngày nhận" showing today instead of user-entered date
-- Root cause: recalculate_ota_payout_status_v2 sets reconciled_at = now()
--             but never sets received_at = user-entered date
-- Fix: Add p_received_at param, set received_at when status → RECEIVED
-- 100% ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================

-- A1. Ensure received_at column exists (idempotent)
ALTER TABLE public.ota_payouts ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT NULL;

-- A2. Replace function: recalculate_ota_payout_status_v2
-- Added p_received_at parameter (default now()) to set received_at = user-entered date
CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status_v2(
    p_payout_id UUID,
    p_received_at TIMESTAMPTZ DEFAULT now()
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payout RECORD;
    v_total_received NUMERIC;
    v_expected_amount NUMERIC;
    v_bank_fee NUMERIC;
    v_adj_total NUMERIC;
    v_new_status TEXT;
    v_is_settled BOOLEAN;
BEGIN
    SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
    IF v_payout IS NULL THEN RETURN; END IF;

    WITH voided_originals AS (
        SELECT hc.related_collection_id
        FROM hotel_collects hc
        WHERE hc.collection_type = 'VOID'
          AND hc.related_collection_id IS NOT NULL
          AND hc.related_collection_id IN (
              SELECT cpa.collection_id FROM collection_payout_allocations cpa WHERE cpa.payout_id = p_payout_id
          )
    )
    SELECT COALESCE(SUM(cpa.allocated_amount), 0)
    INTO v_total_received
    FROM collection_payout_allocations cpa
    INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
    WHERE cpa.payout_id = p_payout_id
      AND hc.collection_type = 'COLLECT'
      AND hc.id NOT IN (SELECT related_collection_id FROM voided_originals);

    SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT', 'OTHER', 'DISPUTE') THEN amount ELSE 0 END), 0)
    INTO v_bank_fee, v_adj_total
    FROM ota_payout_reconciliation_items WHERE payout_id = p_payout_id;

    v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
    v_is_settled := (v_total_received + v_bank_fee + v_adj_total) >= (v_expected_amount - 1);

    IF v_total_received <= 0 THEN
        v_new_status := 'PENDING';
    ELSIF v_is_settled THEN
        v_new_status := 'RECEIVED';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;

    UPDATE ota_payouts SET
        bank_fee_total = v_bank_fee,
        adjustment_total = v_adj_total,
        is_reconciled = v_is_settled,
        status = v_new_status::payout_status,
        -- received_at = ngày nghiệp vụ (user-entered date), chỉ set lần đầu
        received_at = CASE WHEN v_new_status = 'RECEIVED' THEN COALESCE(received_at, p_received_at) ELSE received_at END,
        -- reconciled_at = system timestamp (audit trail), giữ nguyên logic cũ
        reconciled_at = CASE WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now()) ELSE reconciled_at END,
        updated_at = now()
    WHERE id = p_payout_id;
END;
$$;

-- A3. Replace RPC: create_multi_payout_cashin_atomic
-- Pass p_received_at to recalculate_ota_payout_status_v2
CREATE OR REPLACE FUNCTION public.create_multi_payout_cashin_atomic(
  p_payout_ids UUID[],
  p_amounts NUMERIC[],
  p_cash_account_id UUID,
  p_received_at TEXT,
  p_payment_method TEXT,
  p_payment_channel TEXT DEFAULT NULL,
  p_bank_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID,
  p_total_amount NUMERIC DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    
    -- FIX: Pass p_received_at to recalculate so received_at = user-entered date
    PERFORM recalculate_ota_payout_status_v2(v_payout_id, p_received_at::TIMESTAMPTZ);
    
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES ('OTA_PAYOUT_CASHIN_ATOMIC', 'hotel_collects', v_collection_id::TEXT, v_user_id,
      jsonb_build_object('payout_id', v_payout_id, 'collection_id', v_collection_id,
        'ledger_entry_id', v_ledger_entry_id, 'amount', v_amount, 'cash_account_id', p_cash_account_id));
    
    v_collection_ids := v_collection_ids || v_collection_id;
  END LOOP;
  
  RETURN v_collection_ids;
END;
$$;

-- A4. Backfill: For RECEIVED payouts with NULL received_at, set from cashflow/ledger trace
-- This ensures existing data shows correct dates in the table
DO $$
DECLARE
    v_rec RECORD;
    v_backfilled INT := 0;
BEGIN
    FOR v_rec IN
        SELECT p.id as payout_id,
               -- Try to find the actual received date from ledger or cashflow entries
               COALESCE(
                   (SELECT le.entry_date::timestamptz 
                    FROM ledger_entries le 
                    INNER JOIN collection_payout_allocations cpa ON cpa.collection_id = le.source_id::uuid
                    WHERE cpa.payout_id = p.id AND le.source_type = 'OTA_PAYOUT'
                    ORDER BY le.entry_date DESC LIMIT 1),
                   (SELECT ce.cash_date::timestamptz 
                    FROM cashflow_entries ce 
                    WHERE ce.source_type IN ('OTA_PAYOUT', 'OTA_PAYOUT_CASH_IN')
                      AND ce.source_id IN (
                          SELECT cpa.collection_id::text FROM collection_payout_allocations cpa WHERE cpa.payout_id = p.id
                      )
                    ORDER BY ce.cash_date DESC LIMIT 1),
                   p.reconciled_at,
                   p.updated_at
               ) as traced_date
        FROM ota_payouts p
        WHERE p.status = 'RECEIVED'
          AND p.received_at IS NULL
    LOOP
        UPDATE ota_payouts 
        SET received_at = v_rec.traced_date
        WHERE id = v_rec.payout_id;
        
        v_backfilled := v_backfilled + 1;
    END LOOP;
    
    RAISE NOTICE 'Backfilled received_at for % RECEIVED payouts', v_backfilled;
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.recalculate_ota_payout_status_v2(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_multi_payout_cashin_atomic TO authenticated;
