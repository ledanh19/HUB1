-- Drop the old 4-arg version of ota_get_kpi that still calls is_ota_role(uuid)
DROP FUNCTION IF EXISTS public.ota_get_kpi(date, date, uuid[], text);