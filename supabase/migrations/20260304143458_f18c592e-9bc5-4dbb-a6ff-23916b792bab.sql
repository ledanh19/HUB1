ALTER TABLE public.ota_disputes
ADD COLUMN IF NOT EXISTS booking_cancellation_expected BOOLEAN DEFAULT false;

ALTER TABLE public.ota_disputes
ADD COLUMN IF NOT EXISTS booking_cancellation_status TEXT DEFAULT NULL;

NOTIFY pgrst, 'reload schema';