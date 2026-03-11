-- Make property_id nullable for INTERNAL_OPS work type
ALTER TABLE public.ota_projects 
ALTER COLUMN property_id DROP NOT NULL;