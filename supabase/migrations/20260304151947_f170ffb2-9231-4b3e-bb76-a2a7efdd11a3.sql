DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_orders'
      AND policyname = 'Service orders deletable by authenticated'
  ) THEN
    CREATE POLICY "Service orders deletable by authenticated"
    ON public.service_orders
    FOR DELETE
    TO authenticated
    USING (true);
  END IF;
END
$$;