
-- Add attachments_json column to store attachment metadata from Gmail
ALTER TABLE public.email_messages_mirror
ADD COLUMN IF NOT EXISTS attachments_json jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.email_messages_mirror.attachments_json IS 'Array of {attachmentId, filename, mimeType, size} from Gmail API';
