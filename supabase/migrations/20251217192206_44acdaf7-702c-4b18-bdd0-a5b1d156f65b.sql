-- ============================================
-- OTA GUEST MESSAGING MODULE
-- ============================================

-- 1. OTA Conversations Mirror
-- Mỗi dòng = 1 thread hội thoại từ Channex
CREATE TABLE public.ota_conversations_mirror (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'channex',
  channex_conversation_id TEXT NOT NULL UNIQUE,
  channex_property_id TEXT NOT NULL,
  ota_source TEXT,
  unified_booking_id TEXT,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER DEFAULT 0,
  is_messaging_supported BOOLEAN DEFAULT true,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_ota_conversations_property ON public.ota_conversations_mirror(channex_property_id);
CREATE INDEX idx_ota_conversations_booking ON public.ota_conversations_mirror(unified_booking_id);
CREATE INDEX idx_ota_conversations_last_message ON public.ota_conversations_mirror(last_message_at DESC);

-- Enable RLS
ALTER TABLE public.ota_conversations_mirror ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "OTA conversations viewable by authenticated"
ON public.ota_conversations_mirror
FOR SELECT
USING (true);

CREATE POLICY "OTA conversations insertable by admin"
ON public.ota_conversations_mirror
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "OTA conversations updatable by admin"
ON public.ota_conversations_mirror
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. OTA Messages Mirror
-- Mỗi dòng = 1 message từ Channex
CREATE TABLE public.ota_messages_mirror (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channex_message_id TEXT NOT NULL UNIQUE,
  channex_conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('GUEST', 'AGENT', 'SYSTEM')),
  body TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT fk_conversation FOREIGN KEY (channex_conversation_id) 
    REFERENCES public.ota_conversations_mirror(channex_conversation_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_ota_messages_conversation ON public.ota_messages_mirror(channex_conversation_id);
CREATE INDEX idx_ota_messages_sent_at ON public.ota_messages_mirror(sent_at DESC);

-- Enable RLS
ALTER TABLE public.ota_messages_mirror ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "OTA messages viewable by authenticated"
ON public.ota_messages_mirror
FOR SELECT
USING (true);

CREATE POLICY "OTA messages insertable by admin"
ON public.ota_messages_mirror
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. OTA Outbound Messages Queue
-- Hàng đợi gửi đi từ Roomrise
CREATE TABLE public.ota_outbound_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_message_id TEXT NOT NULL UNIQUE,
  channex_conversation_id TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
  error TEXT,
  channex_message_id TEXT,
  retry_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT fk_outbound_conversation FOREIGN KEY (channex_conversation_id) 
    REFERENCES public.ota_conversations_mirror(channex_conversation_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_ota_outbound_status ON public.ota_outbound_messages(status);
CREATE INDEX idx_ota_outbound_conversation ON public.ota_outbound_messages(channex_conversation_id);

-- Enable RLS
ALTER TABLE public.ota_outbound_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Outbound messages viewable by authenticated"
ON public.ota_outbound_messages
FOR SELECT
USING (true);

CREATE POLICY "Outbound messages insertable by authenticated"
ON public.ota_outbound_messages
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Outbound messages updatable by admin"
ON public.ota_outbound_messages
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ota_conversations_mirror;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ota_messages_mirror;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ota_outbound_messages;