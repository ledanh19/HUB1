-- Add sender_id column to messages table for tracking who sent outbound messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.profiles(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- Backfill sender_id from outbound_messages for existing messages
UPDATE public.messages m
SET sender_id = om.created_by
FROM public.outbound_messages om
WHERE m.direction = 'OUTBOUND' 
  AND m.external_message_id IS NOT NULL 
  AND m.external_message_id = om.external_message_id
  AND om.created_by IS NOT NULL
  AND m.sender_id IS NULL;