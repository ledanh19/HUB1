-- Add OTA roles to enum FIRST
DO $$
BEGIN
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_staff';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_lead';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END$$;