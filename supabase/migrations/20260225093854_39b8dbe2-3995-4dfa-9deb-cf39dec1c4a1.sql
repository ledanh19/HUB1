-- Add DELETE policy for ota_payouts (authenticated users)
CREATE POLICY "OTA payouts deletable by authenticated"
  ON public.ota_payouts
  FOR DELETE
  TO authenticated
  USING (true);
