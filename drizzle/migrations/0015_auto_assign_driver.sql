ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS auto_assign_driver boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS default_driver_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS driver_notify_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.booking_auto_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _on boolean; _drv uuid;
BEGIN
  IF NEW.status <> 'confirmed' OR NEW.driver_id IS NOT NULL OR NEW.is_demo THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  SELECT auto_assign_driver, default_driver_id INTO _on, _drv FROM workspaces WHERE id = NEW.workspace_id;
  IF NOT coalesce(_on,false) OR _drv IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = NEW.workspace_id AND user_id = _drv AND active) THEN RETURN NEW; END IF;
  NEW.driver_id := _drv;
  NEW.driver_notify_pending := true;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_auto_assign ON public.bookings;
CREATE TRIGGER trg_booking_auto_assign BEFORE INSERT OR UPDATE OF status, driver_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.booking_auto_assign();