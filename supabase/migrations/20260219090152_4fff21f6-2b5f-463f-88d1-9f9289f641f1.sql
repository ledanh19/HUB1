
-- ============================================================
-- Add WhatsApp-specific columns to conversations, messages, outbound_messages
-- These are required by the whatsapp-webhook edge function
-- All columns are NULLABLE and ADDITIVE — no existing data is affected
-- ============================================================

-- CONVERSATIONS: Add WhatsApp fields
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS wa_customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id
  ON public.conversations(tenant_id);

-- Index for WhatsApp phone lookup
CREATE INDEX IF NOT EXISTS idx_conversations_wa_phone
  ON public.conversations(wa_customer_phone)
  WHERE wa_customer_phone IS NOT NULL;

-- MESSAGES: Add WhatsApp fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel_type TEXT,
  ADD COLUMN IF NOT EXISTS wamid TEXT,
  ADD COLUMN IF NOT EXISTS wa_status TEXT,
  ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Index for wamid lookups (status updates)
CREATE INDEX IF NOT EXISTS idx_messages_wamid
  ON public.messages(wamid)
  WHERE wamid IS NOT NULL;

-- OUTBOUND_MESSAGES: Add WhatsApp fields
ALTER TABLE public.outbound_messages
  ADD COLUMN IF NOT EXISTS channel_type TEXT,
  ADD COLUMN IF NOT EXISTS wamid TEXT,
  ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Index for wamid lookups on outbound (status webhook)
CREATE INDEX IF NOT EXISTS idx_outbound_messages_wamid
  ON public.outbound_messages(wamid)
  WHERE wamid IS NOT NULL;
