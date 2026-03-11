-- ============================================================================
-- WhatsApp Business Integration — Database Migration
-- Created: 2026-02-19
-- Approach: ADD-ONLY — zero changes to existing tables/constraints
-- ============================================================================

-- ============================================================================
-- PART 1: whatsapp_integrations — Tenant phone number configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id   TEXT NOT NULL,           -- Meta Business phone number ID
  waba_id           TEXT NOT NULL,           -- WhatsApp Business Account ID
  display_phone     TEXT,                    -- Human-readable phone (+84 xxx)
  verify_token      TEXT NOT NULL,           -- Webhook hub.verify_token
  app_secret_ref    TEXT NOT NULL,           -- Vault key reference (NEVER plain text)
  access_token_ref  TEXT NOT NULL,           -- Vault key reference (NEVER plain text)
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive')),
  webhook_url       TEXT,                    -- Auto-populated on first verify
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, phone_number_id)
);

-- Fast lookup by phone_number_id (webhook → tenant resolution)
CREATE INDEX IF NOT EXISTS idx_wa_integrations_phone
  ON whatsapp_integrations(phone_number_id)
  WHERE status = 'active';

-- RLS
ALTER TABLE whatsapp_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp integrations"
  ON whatsapp_integrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access on whatsapp_integrations"
  ON whatsapp_integrations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 2: webhook_events_log — Raw webhook payload audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID,
  channel             TEXT NOT NULL DEFAULT 'whatsapp',
  phone_number_id     TEXT,
  payload_json        JSONB NOT NULL,
  signature_valid     BOOLEAN NOT NULL DEFAULT false,
  processing_status   TEXT DEFAULT 'received'
                        CHECK (processing_status IN ('received', 'processed', 'failed', 'duplicate')),
  error_message       TEXT,
  received_at         TIMESTAMPTZ DEFAULT now()
);

-- Partition-friendly index on received_at for cleanup
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events_log(received_at DESC);

-- Lookup by phone for debugging
CREATE INDEX IF NOT EXISTS idx_webhook_events_phone
  ON webhook_events_log(phone_number_id, received_at DESC)
  WHERE phone_number_id IS NOT NULL;

-- RLS
ALTER TABLE webhook_events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_events_log"
  ON webhook_events_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read logs (for admin UI)
CREATE POLICY "Authenticated users can view webhook logs"
  ON webhook_events_log FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- PART 3: Extend messages table — ADD nullable WhatsApp-specific columns
-- ============================================================================

-- channel_type on messages (nullable, existing rows = NULL → treated as OTA)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'channel_type'
  ) THEN
    ALTER TABLE messages ADD COLUMN channel_type TEXT;
  END IF;
END $$;

-- wamid — WhatsApp Message ID for direct lookup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'wamid'
  ) THEN
    ALTER TABLE messages ADD COLUMN wamid TEXT;
  END IF;
END $$;

-- wa_phone_number_id — which WhatsApp number received/sent this message
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'wa_phone_number_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN wa_phone_number_id TEXT;
  END IF;
END $$;

-- wa_status — WhatsApp delivery status (sent/delivered/read/failed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'wa_status'
  ) THEN
    ALTER TABLE messages ADD COLUMN wa_status TEXT;
  END IF;
END $$;

-- Idempotent unique index on wamid (WhatsApp messages only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid
  ON messages(wamid)
  WHERE wamid IS NOT NULL;

-- Fast lookup by channel_type
CREATE INDEX IF NOT EXISTS idx_messages_channel_type
  ON messages(channel_type)
  WHERE channel_type IS NOT NULL;

-- ============================================================================
-- PART 4: Extend conversations — ADD nullable WhatsApp metadata columns
-- ============================================================================

-- wa_customer_phone — customer's WhatsApp phone number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'wa_customer_phone'
  ) THEN
    ALTER TABLE conversations ADD COLUMN wa_customer_phone TEXT;
  END IF;
END $$;

-- wa_phone_number_id — which business phone handles this conversation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'wa_phone_number_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN wa_phone_number_id TEXT;
  END IF;
END $$;

-- Index for WhatsApp conversation lookup by customer phone
CREATE INDEX IF NOT EXISTS idx_conversations_wa_customer
  ON conversations(wa_phone_number_id, wa_customer_phone)
  WHERE channel_type = 'WHATSAPP';

-- ============================================================================
-- PART 5: GRANTs
-- ============================================================================

GRANT SELECT ON whatsapp_integrations TO authenticated;
GRANT ALL ON whatsapp_integrations TO service_role;
GRANT SELECT ON webhook_events_log TO authenticated;
GRANT ALL ON webhook_events_log TO service_role;

-- ============================================================================
-- PART 6: Add to realtime (webhook_events_log not needed in realtime)
-- whatsapp_integrations config changes should be realtime for admin UI
-- ============================================================================

-- No realtime needed — messages and conversations already published
-- WhatsApp data flows through the same tables

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('whatsapp_integrations', 'webhook_events_log', 'messages', 'conversations')
-- AND column_name IN ('channel_type', 'wamid', 'wa_phone_number_id', 'wa_status', 'wa_customer_phone',
--                      'phone_number_id', 'waba_id', 'verify_token', 'app_secret_ref', 'access_token_ref')
-- ORDER BY table_name, ordinal_position;
