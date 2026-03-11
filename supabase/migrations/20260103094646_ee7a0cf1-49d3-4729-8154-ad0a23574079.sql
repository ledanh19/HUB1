-- ============================================
-- CASH ACCOUNTS - NOTE FIELD + AUTO-CODE RPC
-- ============================================

-- PART A: ADD NOTE COLUMN
ALTER TABLE public.cash_accounts 
ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN public.cash_accounts.note IS 'Ghi chú cho tài khoản tiền';

-- PART B: SEQUENCE FOR CASH ACCOUNT CODE
CREATE SEQUENCE IF NOT EXISTS cash_account_code_seq START 1;

-- PART C: HELPER - GENERATE BANK SHORT NAME
CREATE OR REPLACE FUNCTION public.get_bank_short_name(p_bank_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_bank_name IS NULL OR TRIM(p_bank_name) = '' THEN
    RETURN 'BANK';
  END IF;
  
  RETURN CASE UPPER(TRIM(p_bank_name))
    WHEN 'VIETCOMBANK' THEN 'VCB'
    WHEN 'VIETINBANK' THEN 'CTG'
    WHEN 'BIDV' THEN 'BIDV'
    WHEN 'TECHCOMBANK' THEN 'TCB'
    WHEN 'MB BANK' THEN 'MB'
    WHEN 'MBBANK' THEN 'MB'
    WHEN 'VPBANK' THEN 'VPB'
    WHEN 'TPBANK' THEN 'TPB'
    WHEN 'ACB' THEN 'ACB'
    WHEN 'SACOMBANK' THEN 'STB'
    WHEN 'HDBANK' THEN 'HDB'
    WHEN 'VIB' THEN 'VIB'
    WHEN 'SHB' THEN 'SHB'
    WHEN 'OCB' THEN 'OCB'
    WHEN 'EXIMBANK' THEN 'EIB'
    WHEN 'MSB' THEN 'MSB'
    WHEN 'MARITIME BANK' THEN 'MSB'
    WHEN 'SEABANK' THEN 'SEA'
    WHEN 'AGRIBANK' THEN 'AGR'
    WHEN 'DONG A BANK' THEN 'DAB'
    WHEN 'LIENVIETPOSTBANK' THEN 'LPB'
    ELSE UPPER(LEFT(REGEXP_REPLACE(TRIM(p_bank_name), '[^A-Za-z0-9]', '', 'g'), 4))
  END;
END;
$$;

-- PART D: RPC - CREATE CASH ACCOUNT ATOMIC
CREATE OR REPLACE FUNCTION public.create_cash_account_atomic(
  p_account_name TEXT,
  p_account_type TEXT,
  p_bank_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_is_default BOOLEAN DEFAULT false,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_account_id UUID;
  v_account_code TEXT;
  v_last4 TEXT;
  v_bank_short TEXT;
  v_base_code TEXT;
  v_suffix INT := 1;
  v_existing_count INT;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: Chỉ Admin hoặc Kế toán mới được tạo tài khoản tiền';
  END IF;
  
  IF p_account_name IS NULL OR TRIM(p_account_name) = '' THEN
    RAISE EXCEPTION 'Tên tài khoản là bắt buộc';
  END IF;
  
  IF p_account_type NOT IN ('BANK', 'CASH', 'DIGITAL_WALLET') THEN
    RAISE EXCEPTION 'Loại tài khoản không hợp lệ: %', p_account_type;
  END IF;
  
  IF p_account_number IS NOT NULL AND LENGTH(TRIM(p_account_number)) >= 4 THEN
    v_last4 := RIGHT(REGEXP_REPLACE(TRIM(p_account_number), '[^0-9]', '', 'g'), 4);
  ELSE
    v_last4 := LPAD(nextval('cash_account_code_seq')::TEXT, 4, '0');
  END IF;
  
  CASE p_account_type
    WHEN 'BANK' THEN
      v_bank_short := get_bank_short_name(p_bank_name);
      v_base_code := 'BANK_' || v_bank_short || '_' || v_last4;
    WHEN 'CASH' THEN
      v_base_code := 'CASH_' || LPAD(nextval('cash_account_code_seq')::TEXT, 3, '0');
    WHEN 'DIGITAL_WALLET' THEN
      v_bank_short := COALESCE(
        UPPER(LEFT(REGEXP_REPLACE(TRIM(COALESCE(p_bank_name, 'WALLET')), '[^A-Za-z0-9]', '', 'g'), 6)),
        'WALLET'
      );
      v_base_code := 'WALLET_' || v_bank_short || '_' || v_last4;
  END CASE;
  
  v_account_code := v_base_code;
  
  LOOP
    SELECT COUNT(*) INTO v_existing_count
    FROM cash_accounts
    WHERE org_id = p_org_id AND account_code = v_account_code;
    
    EXIT WHEN v_existing_count = 0;
    
    v_suffix := v_suffix + 1;
    v_account_code := v_base_code || '_' || LPAD(v_suffix::TEXT, 2, '0');
    
    IF v_suffix > 99 THEN
      RAISE EXCEPTION 'Không thể tạo mã tài khoản duy nhất';
    END IF;
  END LOOP;
  
  IF p_is_default THEN
    UPDATE cash_accounts
    SET is_default = false
    WHERE org_id = p_org_id AND is_default = true;
  END IF;
  
  INSERT INTO cash_accounts (
    org_id, account_code, account_name, account_type, bank_name,
    account_number, note, is_default, is_active, is_archived, created_by
  )
  VALUES (
    p_org_id, v_account_code, TRIM(p_account_name), p_account_type,
    NULLIF(TRIM(p_bank_name), ''), NULLIF(TRIM(p_account_number), ''),
    NULLIF(TRIM(p_note), ''), p_is_default, true, false, v_user_id
  )
  RETURNING id INTO v_account_id;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'CREATE_CASH_ACCOUNT', 'cash_accounts', v_account_id::TEXT, v_user_id,
    jsonb_build_object(
      'account_code', v_account_code, 'account_name', p_account_name,
      'account_type', p_account_type, 'bank_name', p_bank_name,
      'account_number', CASE WHEN p_account_number IS NOT NULL THEN '****' || v_last4 ELSE NULL END,
      'note', p_note, 'is_default', p_is_default
    )
  );
  
  RETURN v_account_id;
END;
$$;

-- PART E: RPC - UPDATE CASH ACCOUNT ATOMIC
CREATE OR REPLACE FUNCTION public.update_cash_account_atomic(
  p_account_id UUID,
  p_account_name TEXT,
  p_account_type TEXT,
  p_bank_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_old_record RECORD;
  v_last4 TEXT;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: Chỉ Admin hoặc Kế toán mới được sửa tài khoản tiền';
  END IF;
  
  SELECT * INTO v_old_record FROM cash_accounts WHERE id = p_account_id AND org_id = p_org_id;
  
  IF v_old_record IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không tồn tại';
  END IF;
  
  IF v_old_record.is_archived THEN
    RAISE EXCEPTION 'Không thể sửa tài khoản đã lưu trữ';
  END IF;
  
  UPDATE cash_accounts
  SET 
    account_name = TRIM(p_account_name),
    account_type = p_account_type,
    bank_name = NULLIF(TRIM(p_bank_name), ''),
    account_number = NULLIF(TRIM(p_account_number), ''),
    note = NULLIF(TRIM(p_note), ''),
    updated_at = now()
  WHERE id = p_account_id;
  
  v_last4 := CASE WHEN p_account_number IS NOT NULL AND LENGTH(p_account_number) >= 4 
    THEN '****' || RIGHT(p_account_number, 4) ELSE NULL END;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'UPDATE_CASH_ACCOUNT', 'cash_accounts', p_account_id::TEXT, v_user_id,
    jsonb_build_object('account_name', v_old_record.account_name, 'account_type', v_old_record.account_type, 
      'bank_name', v_old_record.bank_name, 'note', v_old_record.note),
    jsonb_build_object('account_name', p_account_name, 'account_type', p_account_type, 
      'bank_name', p_bank_name, 'note', p_note)
  );
  
  RETURN true;
END;
$$;

-- PART F: RPC - ARCHIVE/RESTORE + SET DEFAULT
CREATE OR REPLACE FUNCTION public.archive_cash_account(
  p_account_id UUID,
  p_archive BOOLEAN,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_account RECORD;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts WHERE id = p_account_id AND org_id = p_org_id;
  
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không tồn tại';
  END IF;
  
  IF p_archive AND v_account.is_default THEN
    RAISE EXCEPTION 'Không thể lưu trữ tài khoản mặc định';
  END IF;
  
  UPDATE cash_accounts
  SET is_archived = p_archive, archived_at = CASE WHEN p_archive THEN now() ELSE NULL END
  WHERE id = p_account_id;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    CASE WHEN p_archive THEN 'ARCHIVE_CASH_ACCOUNT' ELSE 'RESTORE_CASH_ACCOUNT' END,
    'cash_accounts', p_account_id::TEXT, v_user_id,
    jsonb_build_object('account_code', v_account.account_code, 'is_archived', p_archive)
  );
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_cash_account(
  p_account_id UUID,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_account RECORD;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts WHERE id = p_account_id AND org_id = p_org_id;
  
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không tồn tại';
  END IF;
  
  IF v_account.is_archived THEN
    RAISE EXCEPTION 'Không thể đặt mặc định cho tài khoản đã lưu trữ';
  END IF;
  
  UPDATE cash_accounts SET is_default = false WHERE org_id = p_org_id;
  UPDATE cash_accounts SET is_default = true WHERE id = p_account_id;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('SET_DEFAULT_CASH_ACCOUNT', 'cash_accounts', p_account_id::TEXT, v_user_id,
    jsonb_build_object('account_code', v_account.account_code));
  
  RETURN true;
END;
$$;

-- PART G: DEFAULT ACCOUNT RPC
CREATE OR REPLACE FUNCTION public.get_default_cash_account_for_collection(
  p_canonical_payment TEXT,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS TABLE (
  id UUID, account_code TEXT, account_name TEXT, account_type TEXT, bank_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ca.id, ca.account_code, ca.account_name, ca.account_type, ca.bank_name
  FROM cash_accounts ca
  WHERE ca.org_id = p_org_id AND ca.is_active = true AND ca.is_archived = false AND ca.is_default = true
  LIMIT 1;
END;
$$;

-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.get_bank_short_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_account_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cash_account_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_cash_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_cash_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_default_cash_account_for_collection TO authenticated;