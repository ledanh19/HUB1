-- Move extensions to a dedicated schema for better security
-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Note: Moving existing extensions requires superuser privileges
-- which are not available in hosted Supabase environments.
-- Instead, we'll document this as a security recommendation.

-- Add a comment to document this security consideration
COMMENT ON SCHEMA public IS 'Standard public schema. Note: Some extensions are installed here due to Supabase managed environment constraints. This is a known limitation.';