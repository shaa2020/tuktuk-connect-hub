CREATE OR REPLACE FUNCTION public.booking_conflict_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _s int; _e int; _clash record; _def uuid;
BEGIN
  IF NEW.status <> 'confirmed' OR NEW.is_demo OR NEW.tour_date IS NULL OR NEW.start_time IS NULL THEN RETURN NEW; END IF;
  IF NEW.vehicle_id IS NULL AND NEW.driver_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.tour_date IS NOT DISTINCT FROM NEW.tour_date
     AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time AND OLD.duration_minutes IS NOT DISTINCT FROM NEW.duration_minutes
     AND OLD.vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN RETURN NEW; END IF;
  -- serialise concurrent writers for this workspace/day
  PERFORM pg_advisory_xact_lock(hashtext(NEW.workspace_id::text || NEW.tour_date::text));
  _s := extract(epoch from NEW.start_time)::int / 60;
  _e := _s + coalesce(NEW.duration_minutes, 60);
  IF NEW.driver_id IS NOT NULL THEN
    SELECT reference INTO _clash FROM bookings b WHERE b.workspace_id = NEW.workspace_id AND b.id <> NEW.id AND b.status = 'confirmed'
      AND NOT b.is_demo AND b.tour_date = NEW.tour_date AND b.start_time IS NOT NULL AND b.driver_id = NEW.driver_id
      AND extract(epoch from b.start_time)::int/60 < _e AND extract(epoch from b.start_time)::int/60 + coalesce(b.duration_minutes,60) > _s LIMIT 1;
    IF FOUND THEN
      SELECT default_driver_id INTO _def FROM workspaces WHERE id = NEW.workspace_id;
      IF NEW.driver_id = _def AND (TG_OP = 'INSERT' OR OLD.driver_id IS NULL) AND NEW.driver_notify_pending THEN
        NEW.driver_id := NULL; NEW.driver_notify_pending := false; -- auto-assign skipped: guide busy
      ELSE
        RAISE EXCEPTION 'This guide already has tour % at that time.', _clash.reference USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  IF NEW.vehicle_id IS NOT NULL THEN
    SELECT reference INTO _clash FROM bookings b WHERE b.workspace_id = NEW.workspace_id AND b.id <> NEW.id AND b.status = 'confirmed'
      AND NOT b.is_demo AND b.tour_date = NEW.tour_date AND b.start_time IS NOT NULL AND b.vehicle_id = NEW.vehicle_id
      AND extract(epoch from b.start_time)::int/60 < _e AND extract(epoch from b.start_time)::int/60 + coalesce(b.duration_minutes,60) > _s LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'This tuk tuk is already booked for tour % at that time.', _clash.reference USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_booking_conflict_guard BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.booking_conflict_guard();

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz, ADD COLUMN IF NOT EXISTS checked_in_by uuid;

CREATE OR REPLACE FUNCTION public.check_in_ticket(_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b record;
BEGIN
  SELECT id, workspace_id, status, reference, checked_in_at INTO b FROM bookings WHERE ticket_token = _token FOR UPDATE;
  IF NOT FOUND OR NOT is_member(b.workspace_id) THEN RETURN jsonb_build_object('result','not_allowed'); END IF;
  IF b.status NOT IN ('confirmed','completed') THEN RETURN jsonb_build_object('result','not_confirmed','reference',b.reference); END IF;
  IF b.checked_in_at IS NOT NULL THEN RETURN jsonb_build_object('result','already','at',b.checked_in_at,'reference',b.reference); END IF;
  UPDATE bookings SET checked_in_at = now(), checked_in_by = auth.uid() WHERE id = b.id;
  RETURN jsonb_build_object('result','ok','reference',b.reference);
END $$;
REVOKE ALL ON FUNCTION public.check_in_ticket(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid) TO authenticated;