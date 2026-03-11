-- Add missing columns for unreplied conversation tracking
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for efficient sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_inbound_at ON public.conversations(last_inbound_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_outbound_at ON public.conversations(last_outbound_at DESC);

-- Fix type mismatch: change messages.conversation_id from TEXT to UUID
-- First, add a new column with correct type
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id_new UUID;

-- Copy data with cast (this will work for valid UUID strings)
UPDATE public.messages 
SET conversation_id_new = conversation_id::uuid 
WHERE conversation_id IS NOT NULL 
  AND conversation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Drop old column and rename new one
ALTER TABLE public.messages DROP COLUMN conversation_id;
ALTER TABLE public.messages RENAME COLUMN conversation_id_new TO conversation_id;

-- Add foreign key constraint
ALTER TABLE public.messages 
ADD CONSTRAINT fk_messages_conversation 
FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Create index for efficient joins
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- Backfill last_inbound_at and last_outbound_at from existing messages
UPDATE public.conversations c
SET 
  last_inbound_at = (
    SELECT MAX(m.sent_at) 
    FROM public.messages m 
    WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'
  ),
  last_outbound_at = (
    SELECT MAX(m.sent_at) 
    FROM public.messages m 
    WHERE m.conversation_id = c.id AND m.direction = 'OUTBOUND'
  );