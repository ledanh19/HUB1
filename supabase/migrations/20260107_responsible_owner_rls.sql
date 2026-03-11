-- =====================================================
-- PHASE 1: Responsible Owner RLS Enforcement
-- Date: 2026-01-07
-- =====================================================
-- 
-- PURPOSE:
-- Enforce permissions for manual owner assignment:
-- - Admin: can assign/transfer/unassign anyone
-- - Non-admin: can ONLY self-assign (user_id == auth.uid())
-- - Non-admin: CANNOT unassign
-- 
-- DOES NOT AFFECT:
-- - Auto-assign on check-in/out (user_id is always auth.uid())
-- - Realtime/polling
-- - Audit trail (all inserts still logged)
-- =====================================================

-- 1. Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id
    AND role IN ('admin', 'super_admin')
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin(UUID) TO authenticated;

-- 2. Create function to validate owner assignment in audit_logs
-- This checks if the INSERT is allowed based on:
-- - Is it a manual assignment action?
-- - If yes, is target user_id == auth.uid() OR is current user admin?
CREATE OR REPLACE FUNCTION public.validate_owner_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_manual_assignment BOOLEAN;
  is_unassign BOOLEAN;
  target_user_id UUID;
  current_user_id UUID;
  user_is_admin BOOLEAN;
BEGIN
  current_user_id := auth.uid();
  
  -- Check if this is a manual owner assignment
  -- Identified by after_data->>'source' = 'responsible_owner_assignment'
  is_manual_assignment := (
    NEW.after_data IS NOT NULL AND 
    NEW.after_data->>'source' = 'responsible_owner_assignment'
  );
  
  -- Check if this is an unassign action
  is_unassign := (
    NEW.action ILIKE '%unassign%' OR 
    NEW.action ILIKE '%gỡ phụ trách%' OR
    NEW.action ILIKE '%remove owner%'
  );
  
  -- If not a manual assignment, allow (auto-assign from check-in/out)
  IF NOT is_manual_assignment THEN
    RETURN NEW;
  END IF;
  
  -- Get target user from the record
  target_user_id := NEW.user_id;
  
  -- Check if current user is admin
  user_is_admin := public.is_admin_or_super_admin(current_user_id);
  
  -- RULE 1: Admin can do anything
  IF user_is_admin THEN
    RETURN NEW;
  END IF;
  
  -- RULE 2: Non-admin cannot UNASSIGN
  IF is_unassign THEN
    RAISE EXCEPTION 'Permission denied: Only admin can unassign owner'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;
  
  -- RULE 3: Non-admin can ONLY self-assign
  IF target_user_id IS NOT NULL AND target_user_id != current_user_id THEN
    RAISE EXCEPTION 'Permission denied: You can only assign yourself as owner'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;
  
  -- All checks passed
  RETURN NEW;
END;
$$;

-- 3. Create trigger on audit_logs for INSERT
DROP TRIGGER IF EXISTS trg_validate_owner_assignment ON public.audit_logs;
CREATE TRIGGER trg_validate_owner_assignment
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_owner_assignment();

-- 4. Add comment for documentation
COMMENT ON FUNCTION public.validate_owner_assignment() IS 
'Validates owner assignment permissions:
- Admin: can assign/transfer/unassign anyone
- Non-admin: can ONLY self-assign
- Non-admin: cannot unassign
Applied via trigger on audit_logs INSERT';

COMMENT ON FUNCTION public.is_admin_or_super_admin(UUID) IS 
'Check if user has admin or super_admin role';

-- =====================================================
-- VERIFICATION QUERIES (run manually in Supabase)
-- =====================================================
-- 
-- Test 1: Check function exists
-- SELECT public.is_admin_or_super_admin();
--
-- Test 2: Verify trigger exists
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass;
--
-- Test 3: Test non-admin trying to assign someone else (should fail)
-- As non-admin user:
-- INSERT INTO audit_logs (entity, entity_id, action, user_id, after_data)
-- VALUES ('booking', 'test-123', 'Gán thủ công', 'OTHER_USER_UUID', 
--         '{"source": "responsible_owner_assignment"}'::jsonb);
-- Expected: ERROR 42501 "Permission denied: You can only assign yourself as owner"
--
-- Test 4: Test non-admin self-assign (should succeed)
-- INSERT INTO audit_logs (entity, entity_id, action, user_id, after_data)
-- VALUES ('booking', 'test-123', 'Gán thủ công', auth.uid(), 
--         '{"source": "responsible_owner_assignment"}'::jsonb);
-- Expected: SUCCESS
--
-- Test 5: Test auto-assign from check-in (should succeed for all)
-- INSERT INTO audit_logs (entity, entity_id, action, user_id)
-- VALUES ('booking', 'test-123', 'Check-in', auth.uid());
-- Expected: SUCCESS (no after_data.source check)
-- =====================================================
