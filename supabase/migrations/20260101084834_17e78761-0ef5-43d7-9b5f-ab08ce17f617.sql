-- Fix security warnings: Set search_path for functions

-- Fix check_property_delete_reference function
CREATE OR REPLACE FUNCTION public.check_property_delete_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.host_supply_segments 
    WHERE host_property_name = OLD.host_property_name
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot delete property "%" - it is referenced in booking segments. Please deactivate instead.', OLD.host_property_name;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix audit_catalog_change function
CREATE OR REPLACE FUNCTION public.audit_catalog_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      action,
      entity,
      entity_id,
      before_data,
      after_data
    ) VALUES (
      'UPDATE_CATALOG',
      TG_TABLE_NAME,
      NEW.id::text,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      action,
      entity,
      entity_id,
      after_data
    ) VALUES (
      'CREATE_CATALOG',
      TG_TABLE_NAME,
      NEW.id::text,
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;