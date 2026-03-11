-- ================================================================
-- PHASE 3.1: REFUND + VOID LEDGER INTEGRATION
-- ================================================================
-- This migration:
-- 1. Adds ledger_entry_id to hotel_collects for direct lookup
-- 2. Creates void_collection_atomic RPC that creates reversal entry
-- 3. Updates create_collection_ledger_atomic to return ledger_entry_id
-- ================================================================

-- ================================================================
-- STEP 1: Add ledger_entry_id to hotel_collects (ADD-ONLY)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'hotel_collects' 
    AND column_name = 'ledger_entry_id'
  ) THEN
    ALTER TABLE public.hotel_collects 
    ADD COLUMN ledger_entry_id UUID REFERENCES public.ledger_entries(id);
    
    CREATE INDEX idx_hotel_collects_ledger ON public.hotel_collects(ledger_entry_id) 
    WHERE ledger_entry_id IS NOT NULL;
    
    COMMENT ON COLUMN public.hotel_collects.ledger_entry_id IS 
      'Link to the ledger entry created by this collection. Used for void reversal.';
  END IF;
END $$;

-- ================================================================
-- STEP 2: Add voided_by to hotel_collects (ADD-ONLY)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'hotel_collects' 
    AND column_name = 'voided_by'
  ) THEN
    ALTER TABLE public.hotel_collects 
    ADD COLUMN voided_by UUID REFERENCES auth.users(id);
    
    COMMENT ON COLUMN public.hotel_collects.voided_by IS 
      'User who voided this collection. Only set when status=VOIDED.';
  END IF;
END $$;

-- ================================================================
-- STEP 3: Update create_collection_ledger_atomic to save ledger_entry_id
-- ================================================================
CREATE OR REPLACE FUNCTION public.create_collection_ledger_atomic(
  p_unified_booking_id TEXT,
  p_amount DECIMAL,
  p_payment_method TEXT,
  p_collection_type TEXT,
  p_related_type TEXT,
  p_payer_type TEXT,
  p_related_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_related_collection_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id UUID;
  v_user_id UUID;
  v_cash_account_id UUID;
  v_direction TEXT;
  v_ledger_entry_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_entry_date DATE := CURRENT_DATE;
BEGIN
  v_user_id := auth.uid();
  
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
  
  -- Insert hotel_collect
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    collection_type, related_type, related_id, payer_type,
    note, collected_by, payee_type, status,
    related_collection_id, reason_note
  )
  VALUES (
    p_unified_booking_id, 
    CASE WHEN p_collection_type = 'REFUND' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_method,
    p_collection_type, p_related_type, p_related_id, p_payer_type,
    p_note, v_user_id, 'ROOMRISE',
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTED' ELSE 'REFUNDED' END,
    p_related_collection_id, p_reason_note
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
  
  -- Resolve cash account via mapping rules
  v_direction := CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END;
  v_cash_account_id := resolve_account_mapping(
    CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
    'HOTEL_COLLECT',
    p_payment_method,
    p_payer_type
  );
  
  -- Create ledger entry using idempotent function
  -- Signature: (p_source_type, p_source_id, p_cash_account_id, p_direction, p_amount, p_entry_date, p_counterparty_type, p_counterparty_id, p_note, p_org_id)
  v_ledger_entry_id := post_ledger_entry_idempotent(
    'HOTEL_COLLECT',           -- p_source_type
    v_collection_id,           -- p_source_id
    v_cash_account_id,         -- p_cash_account_id
    v_direction,               -- p_direction
    p_amount,                  -- p_amount
    v_entry_date,              -- p_entry_date
    p_payer_type,              -- p_counterparty_type
    p_unified_booking_id,      -- p_counterparty_id
    p_note,                    -- p_note
    v_org_id                   -- p_org_id
  );
  
  -- *** UPDATE: Save ledger_entry_id back to hotel_collects ***
  UPDATE hotel_collects
  SET ledger_entry_id = v_ledger_entry_id
  WHERE id = v_collection_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTION_CREATED' ELSE 'REFUND_CREATED' END,
    'hotel_collects',
    v_collection_id,
    v_user_id,
    jsonb_build_object(
      'unified_booking_id', p_unified_booking_id,
      'amount', p_amount,
      'collection_type', p_collection_type,
      'payment_method', p_payment_method,
      'ledger_entry_id', v_ledger_entry_id
    )
  );
  
  RETURN v_collection_id;
END;
$$;

-- ================================================================
-- STEP 4: Create void_collection_atomic RPC
-- This creates a REVERSAL ledger entry and marks collection as VOIDED
-- ================================================================
CREATE OR REPLACE FUNCTION public.void_collection_atomic(
  p_collection_id UUID,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection RECORD;
  v_reversal_id UUID;
  v_void_record_id UUID;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_related_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  -- Check permission (admin, ke_toan, cskh can void)
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'cskh')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: only admin, ke_toan, or cskh can void collections';
  END IF;
  
  -- Get original collection
  SELECT * INTO v_collection FROM hotel_collects WHERE id = p_collection_id;
  
  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Collection not found: %', p_collection_id;
  END IF;
  
  -- Only COLLECT type can be voided
  IF v_collection.collection_type != 'COLLECT' THEN
    RAISE EXCEPTION 'Only COLLECT type can be voided. Current type: %', v_collection.collection_type;
  END IF;
  
  -- Check if already voided
  SELECT EXISTS (
    SELECT 1 FROM hotel_collects 
    WHERE related_collection_id = p_collection_id AND collection_type = 'VOID'
  ) INTO v_related_exists;
  
  IF v_related_exists THEN
    RAISE EXCEPTION 'Collection already voided';
  END IF;
  
  -- Check if has any refunds (cannot void if partially refunded)
  SELECT EXISTS (
    SELECT 1 FROM hotel_collects 
    WHERE related_collection_id = p_collection_id AND collection_type = 'REFUND'
  ) INTO v_related_exists;
  
  IF v_related_exists THEN
    RAISE EXCEPTION 'Cannot void collection that has refunds. Use refund for remaining amount instead.';
  END IF;
  
  -- Check if ledger entry is reconciled
  IF v_collection.ledger_entry_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ledger_reconciliations 
      WHERE ledger_entry_id = v_collection.ledger_entry_id
    ) THEN
      RAISE EXCEPTION 'Cannot void: ledger entry has been reconciled. Unreconcile first.';
    END IF;
  END IF;
  
  -- *** Check period lock ***
  IF is_period_locked(v_org_id, v_collection.collected_at::date) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể hủy thu tiền cho ngày %', v_collection.collected_at::date;
  END IF;
  
  -- Create reversal ledger entry if original had one
  IF v_collection.ledger_entry_id IS NOT NULL THEN
    v_reversal_id := reverse_ledger_entry(v_collection.ledger_entry_id, 'VOID: ' || p_reason);
  END IF;
  
  -- Update original collection status
  UPDATE hotel_collects
  SET 
    status = 'VOIDED',
    voided_at = now(),
    voided_by = v_user_id
  WHERE id = p_collection_id;
  
  -- Create VOID record in hotel_collects
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    collection_type, related_collection_id, reason_note,
    voided_at, collected_by, voided_by,
    payee_type, payer_type, status,
    related_type
  )
  VALUES (
    v_collection.unified_booking_id,
    0, -- Zero amount for void marker
    'VOID',
    'VOID',
    p_collection_id,
    p_reason,
    now(),
    v_user_id,
    v_user_id,
    'ROOMRISE',
    'GUEST',
    'VOIDED',
    v_collection.related_type
  )
  RETURNING id INTO v_void_record_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'COLLECTION_VOIDED',
    'hotel_collects',
    p_collection_id,
    v_user_id,
    jsonb_build_object(
      'status', v_collection.status,
      'amount', v_collection.amount_collected
    ),
    jsonb_build_object(
      'status', 'VOIDED',
      'reason', p_reason,
      'void_record_id', v_void_record_id,
      'reversal_ledger_id', v_reversal_id
    )
  );
  
  RETURN v_void_record_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.void_collection_atomic TO authenticated;

-- ================================================================
-- STEP 5: Helper function to check if collection can be voided
-- ================================================================
CREATE OR REPLACE FUNCTION public.can_void_collection(p_collection_id UUID)
RETURNS TABLE (
  can_void BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_collection RECORD;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT * INTO v_collection FROM hotel_collects WHERE id = p_collection_id;
  
  IF v_collection IS NULL THEN
    RETURN QUERY SELECT false, 'Collection not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_collection.collection_type != 'COLLECT' THEN
    RETURN QUERY SELECT false, 'Only COLLECT type can be voided'::TEXT;
    RETURN;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM hotel_collects 
    WHERE related_collection_id = p_collection_id AND collection_type = 'VOID'
  ) THEN
    RETURN QUERY SELECT false, 'Already voided'::TEXT;
    RETURN;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM hotel_collects 
    WHERE related_collection_id = p_collection_id AND collection_type = 'REFUND'
  ) THEN
    RETURN QUERY SELECT false, 'Has refunds - use refund for remaining'::TEXT;
    RETURN;
  END IF;
  
  IF v_collection.ledger_entry_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ledger_reconciliations 
      WHERE ledger_entry_id = v_collection.ledger_entry_id
    ) THEN
      RETURN QUERY SELECT false, 'Ledger entry is reconciled'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  IF is_period_locked(v_org_id, v_collection.collected_at::date) THEN
    RETURN QUERY SELECT false, ('Period locked: ' || v_collection.collected_at::date)::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, ''::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_void_collection TO authenticated;

-- ================================================================
-- STEP 6: Helper function to check if collection can be refunded
-- ================================================================
CREATE OR REPLACE FUNCTION public.can_refund_collection(p_collection_id UUID)
RETURNS TABLE (
  can_refund BOOLEAN,
  max_refund_amount DECIMAL,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_collection RECORD;
  v_net_amount DECIMAL;
  v_refund_total DECIMAL;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT * INTO v_collection FROM hotel_collects WHERE id = p_collection_id;
  
  IF v_collection IS NULL THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Collection not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_collection.collection_type != 'COLLECT' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Only COLLECT type can be refunded'::TEXT;
    RETURN;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM hotel_collects 
    WHERE related_collection_id = p_collection_id AND collection_type = 'VOID'
  ) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Collection was voided'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate remaining refundable amount
  SELECT COALESCE(SUM(ABS(amount_collected)), 0)
  INTO v_refund_total
  FROM hotel_collects
  WHERE related_collection_id = p_collection_id AND collection_type = 'REFUND';
  
  v_net_amount := v_collection.amount_collected - v_refund_total;
  
  IF v_net_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Already fully refunded'::TEXT;
    RETURN;
  END IF;
  
  IF is_period_locked(v_org_id, CURRENT_DATE) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Current period is locked'::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, v_net_amount, ''::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_refund_collection TO authenticated;

-- ================================================================
-- STEP 7: Backfill ledger_entry_id for existing collections
-- Match by source_type='HOTEL_COLLECT' and source_id=hotel_collects.id
-- ================================================================
UPDATE hotel_collects hc
SET ledger_entry_id = le.id
FROM ledger_entries le
WHERE le.source_type = 'HOTEL_COLLECT'
  AND le.source_id = hc.id
  AND hc.ledger_entry_id IS NULL;

-- ================================================================
-- DONE
-- ================================================================
COMMENT ON FUNCTION public.void_collection_atomic IS 
  'Atomically void a collection: creates REVERSAL ledger entry, marks original as VOIDED, creates VOID marker record. Enforces period lock.';

COMMENT ON FUNCTION public.can_void_collection IS 
  'Check if a collection can be voided. Returns can_void boolean and reason text.';

COMMENT ON FUNCTION public.can_refund_collection IS 
  'Check if a collection can be refunded. Returns can_refund boolean, max_refund_amount, and reason text.';