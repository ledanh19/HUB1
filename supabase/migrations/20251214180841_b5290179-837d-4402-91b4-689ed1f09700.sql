-- Create test_runs table for audit logging
CREATE TABLE public.test_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_by uuid REFERENCES auth.users(id),
  run_at timestamptz NOT NULL DEFAULT now(),
  environment text NOT NULL CHECK (environment IN ('development', 'staging')),
  scale text NOT NULL DEFAULT 'small',
  include_bad_data boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  duration_ms integer,
  pass_count integer DEFAULT 0,
  fail_count integer DEFAULT 0,
  test_results jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create app_config table for environment and rate limit settings
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Insert default config
INSERT INTO public.app_config (key, value) VALUES 
  ('environment', '"development"'),
  ('test_runner_rate_limit_minutes', '30')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- RLS for test_runs - only super_admin can access
CREATE POLICY "Super admins can manage test runs"
ON public.test_runs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS for app_config - only super_admin can write, authenticated can read
CREATE POLICY "Authenticated users can read app config"
ON public.app_config
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super admins can update app config"
ON public.app_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Grant one super_admin role for testing (first user)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;