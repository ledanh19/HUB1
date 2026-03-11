-- Add unique constraint for external_conversation_id on conversations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_external_conversation_id_key') THEN
    ALTER TABLE public.conversations 
    ADD CONSTRAINT conversations_external_conversation_id_key 
    UNIQUE (external_conversation_id);
  END IF;
END $$;