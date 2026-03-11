-- Create storage bucket for OTA evidence files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ota-evidence', 'ota-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for ota-evidence bucket

-- Policy: OTA users can view evidence files
CREATE POLICY "OTA users can view evidence"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ota-evidence'
  AND is_ota_role()
);

-- Policy: OTA users can upload evidence files
CREATE POLICY "OTA users can upload evidence"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ota-evidence'
  AND is_ota_role()
);

-- Policy: OTA users can update their own evidence files
CREATE POLICY "OTA users can update own evidence"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ota-evidence'
  AND is_ota_role()
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: OTA Lead/Admin can delete evidence files
CREATE POLICY "OTA Lead Admin can delete evidence"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ota-evidence'
  AND is_ota_lead_or_admin()
);