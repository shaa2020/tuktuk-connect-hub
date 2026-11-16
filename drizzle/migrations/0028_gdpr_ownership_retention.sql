-- 0028 Workspace ownership transfer, deletion with 30-day grace, message retention. Idempotent.
-- Deletion and retention only ever run because the business itself asked for them.

alter table public.workspaces add column if not exists deletion_requested_at timestamptz;
alter table public.workspaces add column if not exists deletion_scheduled_for timestamptz;
alter table public.workspaces add column if not exists deletion_requested_by uuid;
alter table public.workspaces add column if not exists message_retention_days int check (message_retention_days is null or message_retention_days between 30 and 3650);
grant update (message_retention_days) on public.workspaces to authenticated;

-- Platform-level record that survives the cascade delete (no FK on purpose).
create table if not exists public.workspace_deletion_log (
  workspace_id uuid primary key,
  name text not null,
  owner_email text,
  requested_at timestamptz,
  deleted_at timestamptz not null default now()
);
revoke all on public.workspace_deletion_log from anon, authenticated;
grant all on public.workspace_deletion_log to service_role;
alter table public.workspace_deletion_log enable row level security;

create or replace function public.is_workspace_owner(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces where id = _ws and owner_id = auth.uid()) and public.has_ws_role(_ws, array['admin']::public.app_role[])
$$;

create or replace function public.transfer_workspace_ownership(_ws uuid, _new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _old uuid;
begin
  select owner_id into _old from public.workspaces where id = _ws;
  if not (public.is_workspace_owner(_ws) or public.is_platform_admin()) then raise exception 'Only the workspace owner can transfer ownership'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = _ws and user_id = _new_owner and active) then raise exception 'The new owner must be an active team member'; end if;
  update public.workspace_members set role = 'admin' where workspace_id = _ws and user_id = _new_owner and role <> 'admin';
  update public.workspaces set owner_id = _new_owner where id = _ws;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), 'ownership_transfer', 'workspaces', _ws, jsonb_build_object('from', _old, 'to', _new_owner));
  insert into public.notifications(workspace_id, user_id, kind, title, link) values (_ws, _new_owner, 'ownership', 'You are now the owner of this workspace', '/settings');
end $$;
revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;

create or replace function public.request_workspace_deletion(_ws uuid, _confirm_name text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare _name text; _when timestamptz := now() + interval '30 days';
begin
  if not public.is_workspace_owner(_ws) then raise exception 'Only the workspace owner can delete the workspace'; end if;
  select name into _name from public.workspaces where id = _ws;
  if btrim(coalesce(_confirm_name, '')) <> _name then raise exception 'Type the workspace name exactly to confirm'; end if;
  update public.workspaces set deletion_requested_at = now(), deletion_scheduled_for = _when, deletion_requested_by = auth.uid() where id = _ws;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), 'deletion_requested', 'workspaces', _ws, jsonb_build_object('scheduled_for', _when));
  insert into public.notifications(workspace_id, user_id, kind, title, body, link)
    select _ws, m.user_id, 'deletion', 'Workspace scheduled for deletion', 'All data will be permanently deleted on ' || to_char(_when, 'YYYY-MM-DD') || ' unless the owner cancels.', '/settings'
    from public.workspace_members m where m.workspace_id = _ws and m.active and m.role = 'admin';
  return _when;
end $$;
create or replace function public.cancel_workspace_deletion(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_workspace_owner(_ws) or public.is_platform_admin()) then raise exception 'Only the workspace owner can cancel deletion'; end if;
  update public.workspaces set deletion_requested_at = null, deletion_scheduled_for = null, deletion_requested_by = null where id = _ws;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id) values (_ws, auth.uid(), 'deletion_cancelled', 'workspaces', _ws);
end $$;
revoke all on function public.request_workspace_deletion(uuid, text), public.cancel_workspace_deletion(uuid) from public, anon;
grant execute on function public.request_workspace_deletion(uuid, text), public.cancel_workspace_deletion(uuid) to authenticated;

-- Background job (service role): permanently delete workspaces past their grace period, and apply
-- per-workspace message retention. Never touches the operator's workspace.
create or replace function public.purge_due_workspaces()
returns int language plpgsql security definer set search_path = public as $$
declare w record; _n int := 0;
begin
  for w in select ws.id, ws.name, ws.deletion_requested_at, (select email from public.profiles p where p.id = ws.owner_id) as owner_email
           from public.workspaces ws where ws.deletion_scheduled_for is not null and ws.deletion_scheduled_for <= now() and not ws.platform_connectors loop
    insert into public.workspace_deletion_log(workspace_id, name, owner_email, requested_at) values (w.id, w.name, w.owner_email, w.deletion_requested_at)
      on conflict (workspace_id) do nothing;
    delete from public.workspace_secrets where workspace_id = w.id;
    delete from public.workspaces where id = w.id;
    _n := _n + 1;
  end loop;
  return _n;
end $$;
create or replace function public.apply_message_retention()
returns int language plpgsql security definer set search_path = public as $$
declare w record; _n int := 0; _d int;
begin
  for w in select id, message_retention_days from public.workspaces where message_retention_days is not null and suspended_at is null loop
    delete from public.messages where workspace_id = w.id and created_at < now() - make_interval(days => w.message_retention_days);
    get diagnostics _d = row_count; _n := _n + _d;
    delete from public.internal_notes where workspace_id = w.id and created_at < now() - make_interval(days => w.message_retention_days);
  end loop;
  return _n;
end $$;
revoke all on function public.purge_due_workspaces(), public.apply_message_retention() from public, anon, authenticated;
grant execute on function public.purge_due_workspaces(), public.apply_message_retention() to service_role;

-- Cascade-safe triggers: when a whole workspace is being deleted, child-row triggers must not try
-- to write audit rows / tombstones for a workspace that no longer exists.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _row jsonb; _old jsonb; _diff jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'DELETE' then _row := to_jsonb(old); else _row := to_jsonb(new); end if;
  if (_row->>'workspace_id') is not null and not exists (select 1 from public.workspaces where id = (_row->>'workspace_id')::uuid) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    _old := to_jsonb(old);
    for k in select jsonb_object_keys(_row) loop
      if k not in ('updated_at','last_interaction_at') and (_row->k) is distinct from (_old->k) then
        _diff := _diff || jsonb_build_object(k, jsonb_build_object('from', _old->k, 'to', _row->k));
      end if;
    end loop;
    if _diff = '{}'::jsonb then return new; end if;
  elsif tg_op = 'DELETE' then
    _diff := jsonb_build_object('deleted', jsonb_build_object('name', coalesce(_row->>'full_name', _row->>'title', _row->>'reference', _row->>'tour_name')));
  else
    _diff := jsonb_build_object('name', coalesce(_row->>'full_name', _row->>'title', _row->>'reference', _row->>'role'));
  end if;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
  values ((_row->>'workspace_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (_row->>'id')::uuid, _diff);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.remember_deleted_website_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.source_system = 'website' and old.external_reference is not null
     and exists (select 1 from public.workspaces where id = old.workspace_id) then
    insert into public.website_booking_ignores(workspace_id, external_reference)
    values (old.workspace_id, old.external_reference) on conflict do nothing;
  end if;
  return old;
end $$;
