CREATE TEMP TABLE _personal ON COMMIT DROP AS
SELECT c.id FROM public.contacts c
WHERE c.created_at >= '2026-10-11 10:00:00+00' AND c.created_by IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.conversations x WHERE x.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.bookings x WHERE x.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.leads x WHERE x.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.tasks x WHERE x.contact_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.contacts x WHERE x.merged_into = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.external_identities ei JOIN public.conversation_participants cp ON cp.external_identity_id = ei.id WHERE ei.contact_id = c.id);
DELETE FROM public.contact_tags WHERE contact_id IN (SELECT id FROM _personal);
DELETE FROM public.contact_consents WHERE contact_id IN (SELECT id FROM _personal);
DELETE FROM public.external_identities WHERE contact_id IN (SELECT id FROM _personal);
DELETE FROM public.contacts WHERE id IN (SELECT id FROM _personal);