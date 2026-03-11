-- ================================================================
-- PHASE III-B: CANONICAL PAYMENT METHOD & PROVIDER SEPARATION
-- ================================================================
-- 
-- PURPOSE:
-- Tách biệt 3 lớp thanh toán:
--   A) canonical_payment_method: CASH, BANK_TRANSFER, CARD, QR, EWALLET (ledger/logic)
--   B) payment_provider: SEPAY, ONEPAY, NINEPAY, MOMO... (trace/báo cáo)
--   C) cash_account_id: tài khoản thực (đã có - mandatory cho ledger)
--
-- RULES:
-- - canonical_payment_method: bắt buộc, dùng cho ledger
-- - payment_provider: optional, chỉ để trace
-- - CSKH không cần chọn cash_account, system auto-resolve
--
-- ADD-ONLY - không xóa/sửa existing columns
-- ================================================================

-- ================================================================
-- STEP 1: CREATE ENUM TYPES (if not exist)
-- ================================================================

-- Canonical Payment Method Enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canonical_payment_method') THEN
    CREATE TYPE canonical_payment_method AS ENUM (
      'CASH',           -- Tiền mặt
      'BANK_TRANSFER',  -- Chuyển khoản ngân hàng trực tiếp
      'CARD',           -- Thẻ (POS)
      'QR',             -- QR Code (VietQR, MoMo, ZaloPay)
      'EWALLET'         -- Ví điện tử (nếu khác QR)
    );
    COMMENT ON TYPE canonical_payment_method IS 
      'Canonical payment method - nguồn sự thật cho ledger. KHÔNG phụ thuộc provider.';
  END IF;
END $$;

-- Payment Provider Enum (for tracking only)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider') THEN
    CREATE TYPE payment_provider AS ENUM (
      'SEPAY',      -- SePay gateway
      'ONEPAY',     -- OnePay gateway
      'NINEPAY',    -- 9Pay gateway
      'MOMO',       -- MoMo wallet direct
      'VNPAY',      -- VNPay gateway
      'ZALOPAY',    -- ZaloPay
      'DIRECT',     -- Trực tiếp (không qua gateway)
      'OTHER'       -- Khác
    );
    COMMENT ON TYPE payment_provider IS 
      'Payment provider - CHỈ dùng để trace/báo cáo, KHÔNG quyết định ledger.';
  END IF;
END $$;

-- ================================================================
-- STEP 2: ADD COLUMNS TO hotel_collects (ADD-ONLY)
-- ================================================================

-- canonical_payment_method column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'hotel_collects' 
    AND column_name = 'canonical_payment_method'
  ) THEN
    -- Add column with default derived from existing payment_method
    ALTER TABLE public.hotel_collects 
    ADD COLUMN canonical_payment_method TEXT;
    
    -- Backfill from existing payment_method
    UPDATE public.hotel_collects SET canonical_payment_method = 
      CASE 
        WHEN payment_method IN ('CASH') THEN 'CASH'
        WHEN payment_method IN ('BANK_TRANSFER', 'TRANSFER', 'BANK') THEN 'BANK_TRANSFER'
        WHEN payment_method IN ('CARD', 'POS', 'CREDIT_CARD', 'DEBIT_CARD') THEN 'CARD'
        WHEN payment_method IN ('QR', 'VIETQR', 'MOMO', 'ZALOPAY', 'VNPAY') THEN 'QR'
        WHEN payment_method IN ('EWALLET', 'WALLET') THEN 'EWALLET'
        ELSE 'BANK_TRANSFER' -- Default fallback
      END
    WHERE canonical_payment_method IS NULL;
    
    -- Make NOT NULL after backfill
    ALTER TABLE public.hotel_collects 
    ALTER COLUMN canonical_payment_method SET NOT NULL;
    
    -- Set default for new rows
    ALTER TABLE public.hotel_collects 
    ALTER COLUMN canonical_payment_method SET DEFAULT 'BANK_TRANSFER';
    
    COMMENT ON COLUMN public.hotel_collects.canonical_payment_method IS 
      'Canonical payment method - nguồn sự thật cho ledger. Values: CASH, BANK_TRANSFER, CARD, QR, EWALLET';
  END IF;
END $$;

-- payment_provider column (optional)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'hotel_collects' 
    AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE public.hotel_collects 
    ADD COLUMN payment_provider TEXT NULL;
    
    COMMENT ON COLUMN public.hotel_collects.payment_provider IS 
      'Payment provider (optional) - CHỈ để trace. Values: SEPAY, ONEPAY, NINEPAY, MOMO, VNPAY, ZALOPAY, DIRECT, OTHER';
  END IF;
END $$;

-- ================================================================
-- STEP 3: ADD COLUMNS TO cash_outs (ADD-ONLY)
-- ================================================================

-- canonical_payment_method column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cash_outs' 
    AND column_name = 'canonical_payment_method'
  ) THEN
    ALTER TABLE public.cash_outs 
    ADD COLUMN canonical_payment_method TEXT;
    
    -- Backfill from existing payment_method
    UPDATE public.cash_outs SET canonical_payment_method = 
      CASE 
        WHEN payment_method IN ('CASH') THEN 'CASH'
        WHEN payment_method IN ('BANK_TRANSFER', 'TRANSFER', 'BANK') THEN 'BANK_TRANSFER'
        ELSE 'BANK_TRANSFER' -- Cash outs usually bank transfer
      END
    WHERE canonical_payment_method IS NULL;
    
    ALTER TABLE public.cash_outs 
    ALTER COLUMN canonical_payment_method SET NOT NULL;
    
    ALTER TABLE public.cash_outs 
    ALTER COLUMN canonical_payment_method SET DEFAULT 'BANK_TRANSFER';
    
    COMMENT ON COLUMN public.cash_outs.canonical_payment_method IS 
      'Canonical payment method - nguồn sự thật cho ledger. Values: CASH, BANK_TRANSFER';
  END IF;
END $$;

-- payment_provider column (optional)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cash_outs' 
    AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE public.cash_outs 
    ADD COLUMN payment_provider TEXT NULL;
    
    COMMENT ON COLUMN public.cash_outs.payment_provider IS 
      'Payment provider (optional) - CHỈ để trace. Values: SEPAY, ONEPAY, DIRECT, OTHER';
  END IF;
END $$;

-- ================================================================
-- STEP 4: UPDATE resolve_account_mapping TO USE CANONICAL
-- Now maps by canonical_payment_method instead of payment_method
-- ================================================================

CREATE OR REPLACE FUNCTION public.resolve_account_mapping(
  p_direction TEXT,           -- 'IN' or 'OUT'
  p_source_type TEXT,         -- 'HOTEL_COLLECT', 'CASH_OUT', etc
  p_canonical_payment TEXT,   -- 'CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'EWALLET' (renamed from p_payment_method)
  p_counterparty_type TEXT    -- 'GUEST', 'OTA', 'HOST', etc
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- ==================================================
  -- MAPPING PRIORITY (lower priority number = higher match)
  -- 
  -- 1. Exact match: direction + source_type + canonical_payment
  -- 2. Partial match: direction + source_type (any payment)
  -- 3. Partial match: direction + canonical_payment (any source)
  -- 4. Fallback: direction only
  -- 5. Ultimate fallback: default account
  -- ==================================================
  
  -- Try exact match first
  SELECT cash_account_id INTO v_account_id
  FROM account_mapping_rules
  WHERE is_archived = false
    AND (direction = p_direction OR direction IS NULL)
    AND (source_type = p_source_type OR source_type IS NULL)
    AND (payment_method = p_canonical_payment OR payment_method IS NULL)
  ORDER BY priority ASC
  LIMIT 1;
  
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;
  
  -- Fallback to default account
  SELECT id INTO v_account_id
  FROM cash_accounts
  WHERE is_default = true 
    AND is_archived = false 
    AND is_active = true
  LIMIT 1;
  
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;
  
  -- Ultimate fallback: any active account
  SELECT id INTO v_account_id
  FROM cash_accounts
  WHERE is_archived = false AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;
  
  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_account_mapping IS
  'Resolve cash account based on canonical payment method (NOT provider). 
   Priority: exact match > partial match > default account > any active account.';

-- ================================================================
-- STEP 5: UPDATE account_mapping_rules.priority TO AUTO-CALCULATE
-- Hide from user, system calculates based on rule specificity
-- ================================================================

-- Create function to auto-calculate priority
CREATE OR REPLACE FUNCTION calculate_mapping_rule_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- Priority based on specificity (more specific = lower number = higher priority)
  -- Base: 1000
  -- -100 for each specified condition
  NEW.priority := 1000 
    - CASE WHEN NEW.direction IS NOT NULL THEN 100 ELSE 0 END
    - CASE WHEN NEW.source_type IS NOT NULL THEN 100 ELSE 0 END
    - CASE WHEN NEW.payment_method IS NOT NULL THEN 100 ELSE 0 END
    - CASE WHEN NEW.counterparty_type IS NOT NULL THEN 100 ELSE 0 END;
  
  -- Ensure minimum priority 10
  IF NEW.priority < 10 THEN
    NEW.priority := 10;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-priority (DROP IF EXISTS first)
DROP TRIGGER IF EXISTS trg_auto_priority_mapping_rule ON account_mapping_rules;
CREATE TRIGGER trg_auto_priority_mapping_rule
  BEFORE INSERT OR UPDATE ON account_mapping_rules
  FOR EACH ROW
  EXECUTE FUNCTION calculate_mapping_rule_priority();

COMMENT ON FUNCTION calculate_mapping_rule_priority IS
  'Auto-calculate priority based on rule specificity. More specific rules get lower priority number (higher priority).';

-- ================================================================
-- STEP 6: CREATE VIEW FOR HUMAN-READABLE MAPPING RULES
-- ================================================================

CREATE OR REPLACE VIEW v_mapping_rules_readable AS
SELECT 
  r.id,
  r.rule_name,
  r.direction,
  r.source_type,
  r.payment_method AS canonical_payment_method,
  r.counterparty_type,
  r.cash_account_id,
  a.account_code,
  a.account_name,
  r.priority,
  CASE 
    WHEN r.priority <= 700 THEN 'Cao'
    WHEN r.priority <= 900 THEN 'Trung bình'
    ELSE 'Thấp'
  END AS priority_label,
  -- Human readable rule
  CONCAT_WS(' • ',
    CASE r.direction 
      WHEN 'IN' THEN 'Thu tiền'
      WHEN 'OUT' THEN 'Chi tiền'
      ELSE 'Tất cả'
    END,
    CASE r.payment_method 
      WHEN 'CASH' THEN 'Tiền mặt'
      WHEN 'BANK_TRANSFER' THEN 'Chuyển khoản'
      WHEN 'CARD' THEN 'Thẻ'
      WHEN 'QR' THEN 'QR Code'
      WHEN 'EWALLET' THEN 'Ví điện tử'
      ELSE NULL
    END,
    CASE r.source_type
      WHEN 'HOTEL_COLLECT' THEN 'Thu tiền khách'
      WHEN 'CASH_OUT' THEN 'Chi tiền'
      WHEN 'OTA_PAYOUT' THEN 'OTA Payout'
      WHEN 'HOST_SETTLEMENT' THEN 'Thanh toán Host'
      ELSE NULL
    END
  ) AS rule_description,
  CONCAT('→ ', a.account_code, ' (', a.account_name, ')') AS target_account,
  r.is_archived,
  r.created_at
FROM account_mapping_rules r
LEFT JOIN cash_accounts a ON r.cash_account_id = a.id
ORDER BY r.priority ASC, r.created_at DESC;

COMMENT ON VIEW v_mapping_rules_readable IS
  'Human-readable view of mapping rules with Vietnamese labels and priority description.';

-- Grant access
GRANT SELECT ON v_mapping_rules_readable TO authenticated;

-- ================================================================
-- STEP 7: CREATE DEFAULT CASH_ACCOUNT RESOLUTION HELPER
-- Used by UI to show which account will be auto-selected
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_default_cash_account_for_collection(
  p_canonical_payment TEXT DEFAULT 'BANK_TRANSFER'
) RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  bank_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.id,
    ca.account_code,
    ca.account_name,
    ca.account_type,
    ca.bank_name
  FROM cash_accounts ca
  WHERE ca.is_default = true 
    AND ca.is_archived = false 
    AND ca.is_active = true
  LIMIT 1;
  
  -- If no default, return any active account
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      ca.id,
      ca.account_code,
      ca.account_name,
      ca.account_type,
      ca.bank_name
    FROM cash_accounts ca
    WHERE ca.is_archived = false 
      AND ca.is_active = true
    ORDER BY ca.created_at ASC
    LIMIT 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_default_cash_account_for_collection IS
  'Get the default cash account that will be used for collections. UI displays this as readonly.';

GRANT EXECUTE ON FUNCTION public.get_default_cash_account_for_collection TO authenticated;

-- ================================================================
-- STEP 8: UPDATE create_collection_ledger_atomic TO USE CANONICAL
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
  -- NEW: Optional parameters for provider and account override
  p_payment_provider TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL  -- Override, NULL = auto-resolve
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
    canonical_payment_method, payment_provider,  -- NEW columns
    collection_type, related_type, related_id, payer_type,
    note, collected_by, payee_type, status,
    related_collection_id, reason_note
  )
  VALUES (
    p_unified_booking_id, 
    CASE WHEN p_collection_type = 'REFUND' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_method,  -- Keep legacy column populated
    p_payment_method,  -- canonical = same as payment_method now
    p_payment_provider,  -- Optional provider
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
      p_payment_method,  -- Now uses canonical payment method
      p_payer_type
    );
  END IF;
  
  -- Create ledger entry using idempotent function
  -- Signature: post_ledger_entry_idempotent(p_source_type, p_source_id, p_cash_account_id, p_direction, p_amount, p_entry_date, p_counterparty_type, p_counterparty_id, p_note, p_org_id)
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
   Uses canonical_payment_method for mapping.
   Cash account auto-resolved unless explicitly overridden.
   CSKH không cần chọn tài khoản.';

-- ================================================================
-- STEP 9: GRANT PERMISSIONS
-- ================================================================
GRANT EXECUTE ON FUNCTION public.resolve_account_mapping TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collection_ledger_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_default_cash_account_for_collection TO authenticated;

-- ================================================================
-- DONE
-- ================================================================
