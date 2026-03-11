-- ============================================================
-- TEST SCRIPT: Permission v2.1 RPC Deny Test
-- Purpose: Verify can_use permission check works correctly
-- Date: 2026-01-06
-- ============================================================
-- This is a READ-ONLY test script. Run in a test database.
-- Instructions:
--   1. Create test user with can_use = FALSE
--   2. Run each SELECT (simulating RPC call)
--   3. Expected: All must return 'Không có quyền...' error

-- ============================================================
-- SETUP TEST DATA (run once)
-- ============================================================
/*
-- Create test user
INSERT INTO auth.users (id, email) VALUES 
  ('00000000-aaaa-bbbb-cccc-000000000001', 'test-viewonly@example.com')
ON CONFLICT (id) DO NOTHING;

-- Grant view-only permission (can_use = FALSE)
INSERT INTO user_page_permissions (user_id, page_path, can_use)
VALUES 
  ('00000000-aaaa-bbbb-cccc-000000000001', '/payments/requests', FALSE),
  ('00000000-aaaa-bbbb-cccc-000000000001', '/payments/cashout', FALSE),
  ('00000000-aaaa-bbbb-cccc-000000000001', '/host-payables/settlement', FALSE)
ON CONFLICT (user_id, page_path) DO UPDATE SET can_use = FALSE;

-- Create test payment request
INSERT INTO payment_requests (id, request_code, status, proposed_amount, payment_type, created_by)
VALUES 
  ('00000000-1111-2222-3333-000000000001', 'TEST-PR-001', 'PENDING', 1000000, 'INTERNAL_EXPENSE', auth.uid())
ON CONFLICT (id) DO NOTHING;

-- Create test settlement
INSERT INTO host_settlements (id, host_id, status, period_start, period_end)
VALUES 
  ('00000000-5555-6666-7777-000000000001', '00000000-0000-0000-0000-000000000001', 'DRAFT', '2026-01-01', '2026-01-31')
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================================
-- TEST 1: approve_payment_request_secure with VIEW-ONLY user
-- Expected: RAISE EXCEPTION 'Không có quyền phê duyệt đề xuất thanh toán'
-- ============================================================
-- Simulate login as test user then call:
-- SELECT approve_payment_request_secure('00000000-1111-2222-3333-000000000001');

-- To test manually with Supabase SQL Editor:
DO $$
DECLARE
  v_result UUID;
BEGIN
  -- This simulates calling the RPC as the test user
  -- In real test, use supabase client with test user JWT
  v_result := approve_payment_request_secure('00000000-1111-2222-3333-000000000001');
  RAISE NOTICE 'FAIL: Should have raised exception but got %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Không có quyền phê duyệt%' THEN
      RAISE NOTICE 'PASS: approve_payment_request_secure denied correctly';
    ELSIF SQLERRM LIKE '%Chưa đăng nhập%' THEN
      RAISE NOTICE 'SKIP: Test requires authenticated session';
    ELSE
      RAISE NOTICE 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END;
$$;

-- ============================================================
-- TEST 2: reject_payment_request_secure with VIEW-ONLY user
-- Expected: RAISE EXCEPTION 'Không có quyền từ chối đề xuất thanh toán'
-- ============================================================
DO $$
DECLARE
  v_result UUID;
BEGIN
  v_result := reject_payment_request_secure('00000000-1111-2222-3333-000000000001', 'Test rejection');
  RAISE NOTICE 'FAIL: Should have raised exception but got %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Không có quyền từ chối%' THEN
      RAISE NOTICE 'PASS: reject_payment_request_secure denied correctly';
    ELSIF SQLERRM LIKE '%Chưa đăng nhập%' THEN
      RAISE NOTICE 'SKIP: Test requires authenticated session';
    ELSE
      RAISE NOTICE 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END;
$$;

-- ============================================================
-- TEST 3: finalize_settlement_secure with VIEW-ONLY user
-- Expected: RAISE EXCEPTION 'Không có quyền quyết toán Settlement'
-- ============================================================
DO $$
DECLARE
  v_result UUID;
BEGIN
  v_result := finalize_settlement_secure('00000000-5555-6666-7777-000000000001');
  RAISE NOTICE 'FAIL: Should have raised exception but got %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Không có quyền quyết toán%' THEN
      RAISE NOTICE 'PASS: finalize_settlement_secure denied correctly';
    ELSIF SQLERRM LIKE '%Chưa đăng nhập%' THEN
      RAISE NOTICE 'SKIP: Test requires authenticated session';
    ELSE
      RAISE NOTICE 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END;
$$;

-- ============================================================
-- TEST 4: close_settlement_secure with VIEW-ONLY user
-- Expected: RAISE EXCEPTION 'Không có quyền đóng kỳ Settlement'
-- ============================================================
DO $$
DECLARE
  v_result UUID;
BEGIN
  v_result := close_settlement_secure('00000000-5555-6666-7777-000000000001');
  RAISE NOTICE 'FAIL: Should have raised exception but got %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Không có quyền đóng kỳ%' THEN
      RAISE NOTICE 'PASS: close_settlement_secure denied correctly';
    ELSIF SQLERRM LIKE '%Chưa đăng nhập%' THEN
      RAISE NOTICE 'SKIP: Test requires authenticated session';
    ELSE
      RAISE NOTICE 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END;
$$;

-- ============================================================
-- TEST 5: create_cash_out_atomic with VIEW-ONLY user
-- Expected: RAISE EXCEPTION 'Không có quyền ghi nhận chi tiền'
-- ============================================================
DO $$
DECLARE
  v_result UUID;
BEGIN
  v_result := create_cash_out_atomic(
    '00000000-1111-2222-3333-000000000001', -- request_id
    100000, -- amount
    'CASH', -- method
    NOW()   -- paid_at
  );
  RAISE NOTICE 'FAIL: Should have raised exception but got %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Không có quyền ghi nhận chi tiền%' THEN
      RAISE NOTICE 'PASS: create_cash_out_atomic denied correctly';
    ELSIF SQLERRM LIKE '%Chưa đăng nhập%' THEN
      RAISE NOTICE 'SKIP: Test requires authenticated session';
    ELSE
      RAISE NOTICE 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END;
$$;

-- ============================================================
-- TEST 6: has_page_use_access helper function
-- ============================================================
DO $$
DECLARE
  v_result BOOLEAN;
BEGIN
  -- Test 1-param version (uses auth.uid())
  v_result := has_page_use_access('/payments/requests');
  RAISE NOTICE 'has_page_use_access(/payments/requests) = %', v_result;
  
  -- Test 2-param version (legacy, explicit user_id)
  v_result := has_page_use_access('00000000-aaaa-bbbb-cccc-000000000001', '/payments/requests');
  RAISE NOTICE 'has_page_use_access(test_user, /payments/requests) = %', v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'ERROR in has_page_use_access test: %', SQLERRM;
END;
$$;

-- ============================================================
-- CLEANUP (optional)
-- ============================================================
/*
DELETE FROM user_page_permissions WHERE user_id = '00000000-aaaa-bbbb-cccc-000000000001';
DELETE FROM payment_requests WHERE id = '00000000-1111-2222-3333-000000000001';
DELETE FROM host_settlements WHERE id = '00000000-5555-6666-7777-000000000001';
-- Note: Don't delete auth.users - requires superuser
*/

-- ============================================================
-- POSITIVE TEST: User WITH can_use = TRUE
-- ============================================================
/*
-- Update test user to have can_use = TRUE
UPDATE user_page_permissions 
SET can_use = TRUE 
WHERE user_id = '00000000-aaaa-bbbb-cccc-000000000001' 
  AND page_path = '/payments/requests';

-- Now run approve_payment_request_secure again
-- Expected: Should proceed (may fail on business logic but not permission)
*/
