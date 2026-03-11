-- Add missing external_url column to ota_task_evidence
ALTER TABLE public.ota_task_evidence 
ADD COLUMN IF NOT EXISTS external_url TEXT;