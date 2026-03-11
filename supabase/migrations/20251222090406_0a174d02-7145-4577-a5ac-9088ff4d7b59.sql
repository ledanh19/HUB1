-- Add receipt image and status columns to hotel_collects (Thu tiền)
ALTER TABLE public.hotel_collects
ADD COLUMN IF NOT EXISTS receipt_image TEXT,
ADD COLUMN IF NOT EXISTS receipt_status TEXT DEFAULT 'PENDING';

-- Add receipt image and status columns to cash_outs (Chi tiền)
ALTER TABLE public.cash_outs
ADD COLUMN IF NOT EXISTS receipt_image TEXT,
ADD COLUMN IF NOT EXISTS receipt_status TEXT DEFAULT 'PENDING';

-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for payment-receipts bucket
CREATE POLICY "Authenticated users can upload payment receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can view payment receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can update payment receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can delete payment receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Add comments for documentation
COMMENT ON COLUMN public.hotel_collects.receipt_image IS 'Path to receipt image in storage bucket payment-receipts';
COMMENT ON COLUMN public.hotel_collects.receipt_status IS 'Receipt status: PENDING (chưa có), UPLOADED (đã tải), VERIFIED (đã xác minh)';
COMMENT ON COLUMN public.cash_outs.receipt_image IS 'Path to receipt image in storage bucket payment-receipts';
COMMENT ON COLUMN public.cash_outs.receipt_status IS 'Receipt status: PENDING (chưa có), UPLOADED (đã tải), VERIFIED (đã xác minh)';