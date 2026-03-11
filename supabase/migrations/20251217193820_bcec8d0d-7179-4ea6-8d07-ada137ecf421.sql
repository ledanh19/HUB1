-- Drop existing OTA-specific tables and create unified messaging tables
DROP TABLE IF EXISTS public.ota_outbound_messages CASCADE;
DROP TABLE IF EXISTS public.ota_messages_mirror CASCADE;
DROP TABLE IF EXISTS public.ota_conversations_mirror CASCADE;

-- 1. Unified Conversations table (channel-agnostic)
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_type TEXT NOT NULL DEFAULT 'OTA', -- OTA, EMAIL, WHATSAPP, WEB_CHAT
  channel_provider TEXT NOT NULL DEFAULT 'channex', -- channex, gmail, meta, etc.
  external_conversation_id TEXT NOT NULL, -- e.g., channex_conversation_id
  property_id TEXT NOT NULL, -- tenant boundary (channex_property_id for OTA)
  unified_booking_id TEXT, -- nullable, link to booking if applicable
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED
  is_messaging_supported BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}', -- flexible storage for channel-specific data
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_external_conversation UNIQUE (channel_provider, external_conversation_id)
);

-- 2. Unified Messages Mirror table
CREATE TABLE public.messages_mirror (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL, -- unique per provider
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('GUEST', 'AGENT', 'SYSTEM')),
  body TEXT,
  attachments JSONB DEFAULT '[]',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_external_message UNIQUE (conversation_id, external_message_id)
);

-- 3. Unified Outbound Messages Queue
CREATE TABLE public.outbound_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_message_id TEXT NOT NULL UNIQUE, -- for idempotency
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_provider TEXT NOT NULL DEFAULT 'channex',
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
  error TEXT,
  external_message_id TEXT, -- filled when sent successfully
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_conversations_property ON public.conversations(property_id);
CREATE INDEX idx_conversations_channel ON public.conversations(channel_type, channel_provider);
CREATE INDEX idx_conversations_booking ON public.conversations(unified_booking_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX idx_conversations_status ON public.conversations(status);

CREATE INDEX idx_messages_conversation ON public.messages_mirror(conversation_id);
CREATE INDEX idx_messages_sent_at ON public.messages_mirror(sent_at);

CREATE INDEX idx_outbound_conversation ON public.outbound_messages(conversation_id);
CREATE INDEX idx_outbound_status ON public.outbound_messages(status);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Conversations viewable by authenticated"
  ON public.conversations FOR SELECT
  USING (true);

CREATE POLICY "Conversations insertable by authenticated"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Conversations updatable by authenticated"
  ON public.conversations FOR UPDATE
  USING (true);

-- RLS Policies for messages_mirror (read-only for inbound)
CREATE POLICY "Messages viewable by authenticated"
  ON public.messages_mirror FOR SELECT
  USING (true);

CREATE POLICY "Messages insertable by authenticated"
  ON public.messages_mirror FOR INSERT
  WITH CHECK (true);

-- RLS Policies for outbound_messages
CREATE POLICY "Outbound viewable by authenticated"
  ON public.outbound_messages FOR SELECT
  USING (true);

CREATE POLICY "Outbound insertable by authenticated"
  ON public.outbound_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Outbound updatable by authenticated"
  ON public.outbound_messages FOR UPDATE
  USING (true);

-- Enable realtime for all messaging tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_mirror;
ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_messages;