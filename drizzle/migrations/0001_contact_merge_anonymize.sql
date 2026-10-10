
create or replace function public.merge_contacts(_keep uuid, _merge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _ws uuid; _ws2 uuid;
begin
  select workspace_id into _ws from contacts where id = _keep;
  select workspace_id into _ws2 from contacts where id = _merge;
  if _ws is null or _ws2 is null or _ws <> _ws2 then raise exception 'Contacts not found in the same workspace'; end if;
  if _keep = _merge then raise exception 'Cannot merge a contact into itself'; end if;
  if not public.has_ws_role(_ws, array['admin','manager']::public.app_role[]) then raise exception 'Only admins and managers can merge contacts'; end if;
  update conversations set contact_id = _keep where contact_id = _merge;
  update leads set contact_id = _keep where contact_id = _merge;
  update bookings set contact_id = _keep where contact_id = _merge;
  update tasks set contact_id = _keep where contact_id = _merge;
  update external_identities set contact_id = _keep where contact_id = _merge;
  update contact_consents set contact_id = _keep where contact_id = _merge;
  insert into contact_tags(contact_id, tag_id, workspace_id) select _keep, tag_id, workspace_id from contact_tags where contact_id = _merge on conflict do nothing;
  delete from contact_tags where contact_id = _merge;
  update contacts k set
    email = coalesce(k.email, m.email), phone = coalesce(k.phone, m.phone),
    preferred_language = coalesce(k.preferred_language, m.preferred_language), country = coalesce(k.country, m.country),
    notes = nullif(concat_ws(E'\n', k.notes, m.notes), '')
  from contacts m where k.id = _keep and m.id = _merge;
  update contacts set merged_into = _keep where id = _merge;
  insert into audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), 'merge', 'contacts', _keep, jsonb_build_object('merged', _merge));
end $$;

create or replace function public.anonymize_contact(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _ws uuid;
begin
  select workspace_id into _ws from contacts where id = _id;
  if _ws is null then raise exception 'Contact not found'; end if;
  if not public.has_ws_role(_ws, array['admin','manager']::public.app_role[]) then raise exception 'Only admins and managers can anonymize contacts'; end if;
  update contacts set full_name = 'Anonymized contact', preferred_name = null, email = null, phone = null, notes = null, country = null, anonymized_at = now() where id = _id;
  update external_identities set display_name = null where contact_id = _id;
  insert into audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), 'anonymize', 'contacts', _id, '{}'::jsonb);
end $$;
revoke execute on function public.merge_contacts(uuid, uuid), public.anonymize_contact(uuid) from anon, public;
grant execute on function public.merge_contacts(uuid, uuid), public.anonymize_contact(uuid) to authenticated;
