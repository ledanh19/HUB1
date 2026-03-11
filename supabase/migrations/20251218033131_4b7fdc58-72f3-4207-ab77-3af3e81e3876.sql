-- Create messages table for storing Channex messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_message_id TEXT UNIQUE,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'INBOUND',
  sender_type TEXT NOT NULL DEFAULT 'GUEST',
  body TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  sent_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON public.messages(sent_at DESC);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read messages
CREATE POLICY "Authenticated users can read messages"
ON public.messages FOR SELECT
TO authenticated
USING (true);

-- Allow service role to manage messages (for edge functions)
CREATE POLICY "Service role can manage messages"
ON public.messages FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;