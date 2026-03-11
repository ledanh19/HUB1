-- Allow updating guest_documents for non-ke_toan users (required to mark as SENT)
ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='guest_documents' AND policyname='Guest documents updatable by non-ketoan'
  ) THEN
    CREATE POLICY "Guest documents updatable by non-ketoan"
    ON public.guest_documents
    FOR UPDATE
    TO authenticated
    USING (NOT public.has_role(auth.uid(), 'ke_toan'::app_role))
    WITH CHECK (NOT public.has_role(auth.uid(), 'ke_toan'::app_role));
  END IF;
END $$;