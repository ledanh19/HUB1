-- Add sent_to_host fields to guest_documents
ALTER TABLE public.guest_documents
ADD COLUMN IF NOT EXISTS sent_to_host_status text NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN IF NOT EXISTS sent_to_host_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS guest_name text NULL,
ADD COLUMN IF NOT EXISTS nationality text NULL;

-- Create storage bucket for guest documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-documents', 'guest-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for guest-documents bucket
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload guest documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'guest-documents');

-- Allow authenticated users (except ke_toan) to view
CREATE POLICY "Non-ketoan users can view guest documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'guest-documents' 
  AND NOT has_role(auth.uid(), 'ke_toan')
);

-- Allow admin to delete
CREATE POLICY "Admin can delete guest documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'guest-documents'
  AND has_role(auth.uid(), 'admin')
);