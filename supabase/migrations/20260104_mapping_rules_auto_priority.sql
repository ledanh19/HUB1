-- ============================================
-- ACCOUNT MAPPING RULES - AUTO PRIORITY
-- Migration: 20260104_mapping_rules_auto_priority.sql
-- 
-- MỤC TIÊU:
-- - Priority được tự động tính ở DB
-- - Rule càng cụ thể → priority càng nhỏ (ưu tiên cao hơn)
-- - Catch-all (tất cả NULL) → priority = 9999
-- - Không cho 2 rule active trùng điều kiện
-- 
-- ADD-ONLY: Không sửa schema Phase II/III
-- ============================================

-- ============================================
-- PART A: FUNCTION - COMPUTE RULE PRIORITY
-- ============================================

/*
 * compute_rule_priority
 * 
 * Tính priority dựa trên độ cụ thể (specificity) của rule.
 * Rule càng cụ thể (nhiều field được set) → priority càng nhỏ → ưu tiên cao hơn.
 * 
 * WEIGHTS:
 * - direction: 8
 * - source_type: 10 (quan trọng nhất)
 * - payment_method: 6
 * - payment_type: 4
 * - counterparty_type: 3
 * 
 * FORMULA:
 * specificity_score = sum(weight của field nếu field != NULL)
 * priority = 1000 - (specificity_score * 50)
 * priority = GREATEST(priority, 10)  -- Floor at 10
 * 
 * EXAMPLES:
 * - Catch-all (all NULL): score=0 → priority=9999 (forced)
 * - direction + source_type: score=18 → priority=1000-900=100
 * - All fields set: score=31 → priority=1000-1550=-550 → 10 (floor)
 */
CREATE OR REPLACE FUNCTION public.compute_rule_priority(
  p_direction TEXT,
  p_source_type TEXT,
  p_payment_method TEXT,
  p_payment_type TEXT,
  p_counterparty_type TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_score INTEGER := 0;
  v_priority INTEGER;
BEGIN
  -- Calculate specificity score based on weights
  -- direction: 8
  IF p_direction IS NOT NULL THEN
    v_score := v_score + 8;
  END IF;
  
  -- source_type: 10 (most important for routing)
  IF p_source_type IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;
  
  -- payment_method: 6
  IF p_payment_method IS NOT NULL THEN
    v_score := v_score + 6;
  END IF;
  
  -- payment_type: 4
  IF p_payment_type IS NOT NULL THEN
    v_score := v_score + 4;
  END IF;
  
  -- counterparty_type: 3
  IF p_counterparty_type IS NOT NULL THEN
    v_score := v_score + 3;
  END IF;
  
  -- Catch-all check: all conditions are NULL
  IF v_score = 0 THEN
    RETURN 9999;  -- Forced fallback priority
  END IF;
  
  -- Calculate priority: more specific = lower number = higher priority
  v_priority := 1000 - (v_score * 50);
  
  -- Floor at 10 (reserve 1-9 for future manual overrides if needed)
  v_priority := GREATEST(v_priority, 10);
  
  RETURN v_priority;
END;
$$;

COMMENT ON FUNCTION public.compute_rule_priority IS
'Tính priority tự động cho account_mapping_rules dựa trên độ cụ thể.
Rule càng cụ thể → priority càng nhỏ → ưu tiên cao hơn khi resolve.
Catch-all (all NULL) → priority = 9999.
UI KHÔNG hiển thị priority - đây là cơ chế nội bộ DB.';


-- ============================================
-- PART B: TRIGGER - AUTO SET PRIORITY
-- ============================================

/*
 * trg_fn_set_rule_priority
 * 
 * Trigger function để tự động set priority khi INSERT hoặc UPDATE.
 * Chỉ tính lại priority khi các condition fields thay đổi.
 */
CREATE OR REPLACE FUNCTION public.trg_fn_set_rule_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_priority INTEGER;
BEGIN
  -- Only recalculate if condition fields changed (or on INSERT)
  IF TG_OP = 'INSERT' OR
     OLD.direction IS DISTINCT FROM NEW.direction OR
     OLD.source_type IS DISTINCT FROM NEW.source_type OR
     OLD.payment_method IS DISTINCT FROM NEW.payment_method OR
     OLD.payment_type IS DISTINCT FROM NEW.payment_type OR
     OLD.counterparty_type IS DISTINCT FROM NEW.counterparty_type
  THEN
    -- Compute new priority
    v_new_priority := compute_rule_priority(
      NEW.direction,
      NEW.source_type,
      NEW.payment_method,
      NEW.payment_type,
      NEW.counterparty_type
    );
    
    NEW.priority := v_new_priority;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_set_rule_priority ON public.account_mapping_rules;

-- Create trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trg_set_rule_priority
  BEFORE INSERT OR UPDATE ON public.account_mapping_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_set_rule_priority();

COMMENT ON TRIGGER trg_set_rule_priority ON public.account_mapping_rules IS
'Tự động set priority dựa trên độ cụ thể của rule.
UI KHÔNG gửi priority - DB tự tính.
Chạy khi INSERT hoặc khi condition fields thay đổi.';


-- ============================================
-- PART C: UNIQUE INDEX - CHỐNG TRÙNG RULE ACTIVE
-- ============================================

/*
 * idx_mapping_rules_unique_active
 * 
 * Không cho tồn tại 2 rule active có cùng:
 * - org_id
 * - direction (hoặc NULL)
 * - source_type (hoặc NULL)
 * - payment_method (hoặc NULL)
 * - payment_type (hoặc NULL)
 * - counterparty_type (hoặc NULL)
 * - effective_to IS NULL (còn hiệu lực)
 * - is_archived = false
 * 
 * Dùng COALESCE để NULL tham gia uniqueness check.
 * '__NULL__' là sentinel value thay cho NULL.
 */
DROP INDEX IF EXISTS idx_mapping_rules_unique_active;

CREATE UNIQUE INDEX idx_mapping_rules_unique_active
ON public.account_mapping_rules (
  org_id,
  COALESCE(direction, '__NULL__'),
  COALESCE(source_type, '__NULL__'),
  COALESCE(payment_method, '__NULL__'),
  COALESCE(payment_type, '__NULL__'),
  COALESCE(counterparty_type, '__NULL__')
)
WHERE effective_to IS NULL AND is_archived = false;

COMMENT ON INDEX idx_mapping_rules_unique_active IS
'Chống trùng rule active. Không cho 2 rule có cùng conditions tồn tại cùng lúc.
Dùng COALESCE với sentinel value để NULL tham gia uniqueness.
Chỉ áp dụng cho rule còn hiệu lực (effective_to IS NULL) và chưa archive.';


-- ============================================
-- PART D: UPDATE EXISTING RULES (ONE-TIME)
-- ============================================

/*
 * Cập nhật priority cho tất cả rules hiện có.
 * Chạy một lần khi deploy migration.
 */
UPDATE public.account_mapping_rules
SET priority = compute_rule_priority(
  direction,
  source_type,
  payment_method,
  payment_type,
  counterparty_type
)
WHERE true;


-- ============================================
-- PART E: ENSURE DEFAULT CATCH-ALL EXISTS
-- ============================================

/*
 * Seed rule fallback (catch-all) nếu chưa có.
 * Rule này có:
 * - Tất cả conditions = NULL
 * - priority = 9999
 * - rule_name bắt đầu bằng 'DEFAULT'
 */
INSERT INTO public.account_mapping_rules (
  org_id,
  rule_name,
  priority,
  direction,
  source_type,
  payment_type,
  payment_method,
  counterparty_type,
  cash_account_id,
  effective_from,
  is_archived
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'DEFAULT – Catch all (Auto-generated)',
  9999,
  NULL,  -- Match any direction
  NULL,  -- Match any source_type
  NULL,  -- Match any payment_type
  NULL,  -- Match any payment_method
  NULL,  -- Match any counterparty_type
  (SELECT id FROM cash_accounts WHERE is_default = true AND is_archived = false LIMIT 1),
  now(),
  false
WHERE NOT EXISTS (
  SELECT 1 FROM account_mapping_rules 
  WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND direction IS NULL
    AND source_type IS NULL
    AND payment_type IS NULL
    AND payment_method IS NULL
    AND counterparty_type IS NULL
    AND is_archived = false
);


-- ============================================
-- PART F: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.compute_rule_priority TO authenticated;


-- ============================================
-- PART G: VERIFICATION QUERY (FOR TESTING)
-- ============================================

/*
 * Query để verify priority đã được tính đúng:
 * 
 * SELECT 
 *   rule_name,
 *   direction,
 *   source_type,
 *   payment_method,
 *   payment_type,
 *   counterparty_type,
 *   priority,
 *   compute_rule_priority(direction, source_type, payment_method, payment_type, counterparty_type) as computed_priority
 * FROM account_mapping_rules
 * WHERE is_archived = false
 * ORDER BY priority ASC;
 * 
 * Expected:
 * - Rule có nhiều conditions → priority thấp (10-500)
 * - Rule có ít conditions → priority cao (500-900)
 * - Catch-all → priority = 9999
 */
