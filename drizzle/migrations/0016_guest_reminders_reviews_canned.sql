ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS guest_reminder_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_request_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS tripadvisor_review_url text;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_sent_at timestamptz;

CREATE TABLE public.canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canned_replies TO authenticated;
GRANT ALL ON public.canned_replies TO service_role;
ALTER TABLE public.canned_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read canned" ON public.canned_replies FOR SELECT TO authenticated USING (public.is_member(workspace_id));
CREATE POLICY "staff insert canned" ON public.canned_replies FOR INSERT TO authenticated WITH CHECK (public.has_ws_role(workspace_id, ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "staff update canned" ON public.canned_replies FOR UPDATE TO authenticated USING (public.has_ws_role(workspace_id, ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "staff delete canned" ON public.canned_replies FOR DELETE TO authenticated USING (public.has_ws_role(workspace_id, ARRAY['admin','manager']::public.app_role[]));

INSERT INTO public.canned_replies (workspace_id, title, body, sort)
SELECT w.id, v.title, v.body, v.sort FROM public.workspaces w CROSS JOIN (VALUES
 ('Meeting points', E'Our tours include free pickup from one of 3 meeting points:\n\n1. Fado Museum, Alfama: https://maps.google.com/?q=Largo+do+Chafariz+de+Dentro+1,+1100-139+Lisboa\n2. Hard Rock Cafe, Avenida da Liberdade: https://maps.google.com/?q=Av.+da+Liberdade+2,+1250-144+Lisboa\n3. Manteigaria, Time Out Market: https://maps.google.com/?q=Av.+24+de+Julho+50,+1200-109+Lisboa\n\nHotel pickup in central Lisbon is also possible for an extra 20 euros. Which would you prefer?', 1),
 ('Tour hours', E'Tours can start any time between 9 AM and 7 PM, every day. Tell us your preferred time and a team member will confirm the slot is free.', 2),
 ('Rain & weather', E'Our tuk tuks have roll-down covers, so tours go ahead in light rain. If the weather is very bad, our team will contact you to reschedule.', 3),
 ('Kids & luggage', E'Children are welcome. Please tell us their ages so we can prepare. Large suitcases do not fit in the tuk tuk, so please leave them at your hotel.', 4)
) AS v(title, body, sort);