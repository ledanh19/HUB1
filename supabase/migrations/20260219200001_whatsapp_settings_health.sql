-- ============================================================================
-- WhatsApp Settings — Health Fields Addition
-- Created: 2026-02-19
-- Approach: ADD-ONLY — nullable columns for webhook health tracking
-- ============================================================================

-- last_webhook_received_at — timestamp of most recent webhook delivery
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_integrations' AND column_name = 'last_webhook_received_at'
  ) THEN
    ALTER TABLE whatsapp_integrations ADD COLUMN last_webhook_received_at TIMESTAMPTZ;
  END IF;
END $$;

-- last_error — most recent error message for debugging
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_integrations' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE whatsapp_integrations ADD COLUMN last_error TEXT;
  END IF;
END $$;

-- last_health_check_at — timestamp of last health ping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_integrations' AND column_name = 'last_health_check_at'
  ) THEN
    ALTER TABLE whatsapp_integrations ADD COLUMN last_health_check_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- RLS policy for tenant isolation on INSERT/UPDATE
-- (existing migration only has SELECT for authenticated + ALL for service_role)
-- Add tenant-scoped INSERT/UPDATE for authenticated users
-- ============================================================================

-- Allow authenticated users to insert their own integrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can insert own whatsapp integrations'
      AND tablename = 'whatsapp_integrations'
  ) THEN
    CREATE POLICY "Users can insert own whatsapp integrations"
      ON whatsapp_integrations FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = auth.uid());
  END IF;
END $$;

-- Allow authenticated users to update their own integrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can update own whatsapp integrations'
      AND tablename = 'whatsapp_integrations'
  ) THEN
    CREATE POLICY "Users can update own whatsapp integrations"
      ON whatsapp_integrations FOR UPDATE
      TO authenticated
      USING (tenant_id = auth.uid())
      WITH CHECK (tenant_id = auth.uid());
  END IF;
END $$;
