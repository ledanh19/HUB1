
-- Add payment_link_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'hotel_collects'
    AND column_name = 'payment_link_url'
  ) THEN
    ALTER TABLE public.hotel_collects
    ADD COLUMN payment_link_url TEXT DEFAULT NULL;

    COMMENT ON COLUMN public.hotel_collects.payment_link_url IS 
      'URL link thanh toán. Chỉ có giá trị khi payment_method = PAYMENT_LINK. Dùng để truy vết giao dịch và đối soát.';
  END IF;
END $$;

-- Add payment_provider column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'hotel_collects'
    AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE public.hotel_collects
    ADD COLUMN payment_provider TEXT DEFAULT NULL;

    COMMENT ON COLUMN public.hotel_collects.payment_provider IS 
      'Đơn vị cung cấp link thanh toán (ONEPAY, NINEPAY, VNPAY, MOMO, ZALOPAY, OTHER). Chỉ có giá trị khi payment_method = PAYMENT_LINK.';
  END IF;
END $$;
