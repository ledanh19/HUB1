-- Fix RLS policies for user_roles table
-- This migration adds proper policies to allow authenticated users to manage user_roles

-- First, drop existing policies if any
DROP POLICY IF EXISTS "user_roles_select_policy" ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert_policy" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update_policy" ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete_policy" ON user_roles;

-- Enable RLS if not already enabled
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT
CREATE POLICY "user_roles_select_policy" 
ON user_roles FOR SELECT 
TO authenticated 
USING (true);

-- Allow all authenticated users to INSERT
CREATE POLICY "user_roles_insert_policy" 
ON user_roles FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow all authenticated users to UPDATE
CREATE POLICY "user_roles_update_policy" 
ON user_roles FOR UPDATE 
TO authenticated 
USING (true);

-- Allow all authenticated users to DELETE
CREATE POLICY "user_roles_delete_policy" 
ON user_roles FOR DELETE 
TO authenticated 
USING (true);
