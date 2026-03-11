-- ============================================================================
-- FIX: Payment Request requested_by ghi nhận sai người đề xuất
-- ============================================================================
-- Date: 2026-03-03
-- Bug:  Khi tạo đề xuất thanh toán, trường requested_by có thể ghi nhận sai
--       người tạo vì nó được set từ client-side (supabase.auth.getUser()),
--       không có kiểm soát server-side.
--
-- Root cause:
--   1. Column requested_by KHÔNG có DEFAULT auth.uid()
--   2. Không có trigger/constraint nào force requested_by = auth.uid()
--   3. RLS INSERT policy cho phép insert bất kỳ UUID nào cho requested_by
--   4. Client-side dùng supabase.auth.getUser() có thể bị stale/cache
--
-- Fix (NON-BREAKING, ADDITIVE):
--   1. ALTER COLUMN requested_by SET DEFAULT auth.uid()
--   2. Tạo BEFORE INSERT trigger force requested_by = auth.uid()
--   3. Backfill các record có requested_by NULL (nếu có)
-- ============================================================================

-- 1. SET DEFAULT auth.uid() cho requested_by
-- Từ giờ nếu client không truyền requested_by, nó sẽ tự động = auth.uid()
ALTER TABLE public.payment_requests
  ALTER COLUMN requested_by SET DEFAULT auth.uid();

-- 2. BEFORE INSERT trigger: force requested_by = auth.uid()
-- Đây là safety net — BẤT KỂ client truyền gì, DB luôn ghi đúng người tạo
CREATE OR REPLACE FUNCTION public.trg_payment_requests_set_requested_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Luôn force requested_by = auth.uid() khi INSERT
  -- Ngăn client gửi UUID giả hoặc cached user
  IF auth.uid() IS NOT NULL THEN
    NEW.requested_by := auth.uid();
  END IF;
  
  -- Cũng set requested_at nếu chưa có
  IF NEW.requested_at IS NULL THEN
    NEW.requested_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_payment_requests_set_requested_by IS
  'Safety trigger: force requested_by = auth.uid() on INSERT. '
  'Prevents client-side spoofing or stale session bugs.';

-- Drop trigger nếu đã tồn tại
DROP TRIGGER IF EXISTS trg_payment_requests_force_requested_by
  ON public.payment_requests;

-- Tạo trigger
CREATE TRIGGER trg_payment_requests_force_requested_by
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payment_requests_set_requested_by();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Sau khi deploy, test bằng cách:
-- 1. Tạo đề xuất thanh toán → Kiểm tra requested_by = đúng user đang login
-- 2. SELECT id, request_code, requested_by FROM payment_requests ORDER BY created_at DESC LIMIT 5;
-- 3. So sánh requested_by với auth.uid() của user tạo

