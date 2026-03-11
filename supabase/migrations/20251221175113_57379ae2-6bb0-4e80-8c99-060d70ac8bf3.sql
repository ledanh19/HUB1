-- Record booking changes for notifications/live feed when bookings_mirror is inserted/updated

CREATE OR REPLACE FUNCTION public.record_booking_mirror_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_fields jsonb := '[]'::jsonb;
  v_change_type text;
  v_before jsonb;
  v_after jsonb;
  v_key text;
BEGIN
  v_before := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_after  := to_jsonb(NEW);

  -- Determine change_type
  IF TG_OP = 'INSERT' THEN
    v_change_type := 'INSERT';
  ELSE
    v_change_type := 'UPDATE';

    -- STATUS_CHANGE
    IF (OLD.booking_status IS DISTINCT FROM NEW.booking_status) THEN
      v_change_type := 'STATUS_CHANGE';
    -- AMOUNT_CHANGE
    ELSIF (OLD.total_amount_net IS DISTINCT FROM NEW.total_amount_net) OR (OLD.total_amount_gross IS DISTINCT FROM NEW.total_amount_gross) THEN
      v_change_type := 'AMOUNT_CHANGE';
    END IF;

    -- Compute changed fields (exclude noisy sync-only fields)
    FOR v_key IN
      SELECT key
      FROM jsonb_each(v_after)
    LOOP
      IF v_key IN (
        'updated_at',
        'synced_at',
        'source_updated_at',
        'channex_revision_id',
        'channex_status'
      ) THEN
        CONTINUE;
      END IF;

      IF (v_before -> v_key) IS DISTINCT FROM (v_after -> v_key) THEN
        v_changed_fields := v_changed_fields || to_jsonb(v_key);
      END IF;
    END LOOP;
  END IF;

  -- Insert into booking_changes (used by Live Feed + Notification bell)
  INSERT INTO public.booking_changes (
    change_type,
    change_source,
    unified_booking_id,
    before_data,
    after_data,
    changed_fields,
    created_at
  ) VALUES (
    v_change_type,
    'bookings_mirror_trigger',
    NEW.unified_booking_id,
    v_before,
    v_after,
    v_changed_fields,
    now()
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger safely
DROP TRIGGER IF EXISTS trg_record_booking_mirror_change ON public.bookings_mirror;

CREATE TRIGGER trg_record_booking_mirror_change
AFTER INSERT OR UPDATE ON public.bookings_mirror
FOR EACH ROW
EXECUTE FUNCTION public.record_booking_mirror_change();
