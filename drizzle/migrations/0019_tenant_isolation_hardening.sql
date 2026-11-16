-- 0019 Tenant isolation hardening (Phase 1). Non-destructive: adds columns/functions/triggers,
-- narrows privileges. Safe to re-run (idempotent guards everywhere).
-- See docs/SECURITY_AUDIT.md findings F-01..F-06 for the reasoning behind each block.

-- ---------------------------------------------------------------------------
-- 1. Schema drift reconciliation (F-06). These columns exist in production but were
--    created outside the migration files, so a fresh database could not run the app.
-- ---------------------------------------------------------------------------
alter table public.bookings add column if not exists ticket_token uuid not null default gen_random_uuid();
alter table public.bookings add column if not exists ticket_sent_at timestamptz;
create unique index if not exists bookings_ticket_token_uq on public.bookings(ticket_token);
alter table public.workspace_members add column if not exists whatsapp_phone text;
alter table public.workspace_members add column if not exists schedule_sent_on text;
alter table public.workspaces add column if not exists driver_auto boolean not null default false;
alter table public.workspaces add column if not exists ticket_auto text not null default 'off';

-- ---------------------------------------------------------------------------
-- 2. Tenant metadata: owner, suspension, platform-owned connectors (F-01, F-03).
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.workspaces add column if not exists suspended_at timestamptz;
alter table public.workspaces add column if not exists suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 500);
-- platform_connectors = may use integrations whose credentials belong to the platform
-- operator (Lovable Gmail/WhatsApp connectors, tuktuk24lisbon.com website API).
-- Only the operator's own workspace may ever have this. New workspaces default to false.
alter table public.workspaces add column if not exists platform_connectors boolean not null default false;

-- Every workspace that exists before SaaS self-signup is the operator's own (Tuk Tuk 24 Lisbon),
-- so keep its current integrations working exactly as before.
-- Runs only the first time (while no workspace is flagged yet): at that moment self-signup does not
-- exist, so every existing workspace is the operator's. Re-running never flags later tenants.
update public.workspaces set platform_connectors = true
  where not exists (select 1 from public.workspaces w2 where w2.platform_connectors);
update public.workspaces w set owner_id = (
  select m.user_id from public.workspace_members m
  where m.workspace_id = w.id and m.role = 'admin' and m.active order by m.created_at limit 1)
where w.owner_id is null;

-- Browsers may only change ordinary settings. Plan, limits, owner, suspension and the
-- platform-connector flag are changed exclusively by server code / platform admins (F-02).
revoke update on public.workspaces from authenticated;
grant update (name, timezone, agents_see_unassigned) on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Access helpers respect suspension (F-03). A suspended workspace is locked at the
--    database level for every member; server jobs skip it too.
-- ---------------------------------------------------------------------------
create or replace function public.is_member(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _ws and m.user_id = auth.uid() and m.active and w.suspended_at is null)
$$;

create or replace function public.has_ws_role(_ws uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _ws and m.user_id = auth.uid() and m.active and m.role = any(_roles) and w.suspended_at is null)
$$;

create or replace function public.can_view_conversation(_ws uuid, _assigned uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _ws and m.user_id = auth.uid() and m.active and w.suspended_at is null
      and (m.role in ('admin','manager') or _assigned = auth.uid()
           or (_assigned is null and w.agents_see_unassigned)))
$$;

-- Members of a suspended workspace can still read its name/status (to show a clear message).
create or replace function public.has_membership(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = _ws and user_id = auth.uid() and active)
$$;
drop policy if exists "workspace read members" on public.workspaces;
create policy "workspace read members" on public.workspaces for select to authenticated
  using (public.has_membership(id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Cross-workspace reference guard (F-04). A row may only point at parent rows of the
--    SAME workspace. Enforced for browsers and server code alike. Unchanged references on
--    UPDATE are not re-checked, so legacy rows never block unrelated edits.
--    Trigger args: pairs of (column, parent_table).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_same_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i int := 0; _col text; _tbl text; _id text; _ws uuid;
  _new jsonb := to_jsonb(new); _old jsonb;
begin
  if tg_op = 'UPDATE' then _old := to_jsonb(old); end if;
  while i < tg_nargs loop
    _col := tg_argv[i]; _tbl := tg_argv[i + 1]; i := i + 2;
    _id := _new ->> _col;
    continue when _id is null;
    continue when tg_op = 'UPDATE' and (_old ->> _col) is not distinct from _id
      and (_old ->> 'workspace_id') is not distinct from (_new ->> 'workspace_id');
    execute format('select workspace_id from public.%I where id = $1::uuid', _tbl) into _ws using _id;
    if _ws is null or _ws::text <> (_new ->> 'workspace_id') then
      raise exception 'Cross-workspace reference rejected: %.% must belong to the same workspace', tg_table_name, _col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- People referenced by a row (assignee, owner, driver) must be members of that workspace.
create or replace function public.enforce_member_ref()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int := 0; _col text; _id text; _new jsonb := to_jsonb(new); _old jsonb;
begin
  if tg_op = 'UPDATE' then _old := to_jsonb(old); end if;
  while i < tg_nargs loop
    _col := tg_argv[i]; i := i + 1;
    _id := _new ->> _col;
    continue when _id is null;
    continue when tg_op = 'UPDATE' and (_old ->> _col) is not distinct from _id;
    if not exists (select 1 from public.workspace_members
                   where workspace_id = (_new ->> 'workspace_id')::uuid and user_id = _id::uuid) then
      raise exception 'Cross-workspace reference rejected: %.% must be a member of this workspace', tg_table_name, _col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('contact_consents', 'contact_id,contacts'),
    ('external_identities', 'contact_id,contacts'),
    ('contact_tags', 'contact_id,contacts,tag_id,tags'),
    ('leads', 'contact_id,contacts'),
    ('lead_activities', 'lead_id,leads'),
    ('bookings', 'contact_id,contacts,lead_id,leads,vehicle_id,vehicles'),
    ('conversations', 'contact_id,contacts,lead_id,leads,booking_id,bookings,connection_id,channel_connections'),
    ('conversation_assignments', 'conversation_id,conversations'),
    ('conversation_tags', 'conversation_id,conversations,tag_id,tags'),
    ('conversation_participants', 'conversation_id,conversations,external_identity_id,external_identities'),
    ('messages', 'conversation_id,conversations'),
    ('message_attachments', 'message_id,messages'),
    ('message_delivery_events', 'message_id,messages'),
    ('internal_notes', 'conversation_id,conversations'),
    ('tasks', 'contact_id,contacts,conversation_id,conversations,lead_id,leads,booking_id,bookings'),
    ('knowledge_chunks', 'document_id,knowledge_documents'),
    ('automation_runs', 'rule_id,automation_rules'),
    ('ai_operator_marks', 'conversation_id,conversations'),
    ('ai_operator_log', 'conversation_id,conversations'),
    ('paypal_transactions', 'booking_id,bookings')
  ) as t(tbl, args) loop
    execute format('drop trigger if exists trg_same_workspace on public.%I', r.tbl);
    execute format('create trigger trg_same_workspace before insert or update on public.%I for each row execute function public.enforce_same_workspace(%s)',
      r.tbl, (select string_agg(quote_literal(a), ',') from unnest(string_to_array(r.args, ',')) a));
  end loop;
  for r in select * from (values
    ('contacts', 'assigned_to'), ('leads', 'owner_id'), ('tasks', 'assigned_to'), ('bookings', 'driver_id')
  ) as t(tbl, args) loop
    execute format('drop trigger if exists trg_member_ref on public.%I', r.tbl);
    execute format('create trigger trg_member_ref before insert or update on public.%I for each row execute function public.enforce_member_ref(%s)',
      r.tbl, (select string_agg(quote_literal(a), ',') from unnest(string_to_array(r.args, ',')) a));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Portable background-job URL (F-05). The app address now lives in a config table instead
--    of being hard-coded in SQL; the default keeps today's production behaviour unchanged.
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key check (char_length(key) <= 100),
  value text not null check (char_length(value) <= 2000),
  updated_at timestamptz not null default now()
);
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
insert into public.app_config(key, value)
  values ('app_base_url', 'https://project--133f9183-9d83-4d21-85ed-38bd33238705.lovable.app')
  on conflict (key) do nothing;

create or replace function public.trigger_background_sync(_body jsonb)
returns void language plpgsql security definer set search_path = public, net as $$
declare _url text := (select value from public.app_config where key = 'app_base_url');
begin
  if _url is null then return; end if;
  perform net.http_post(
    url := rtrim(_url, '/') || '/api/public/hooks/background-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select token from public.internal_job_tokens where name='background_sync')),
    body := coalesce(_body, '{}'::jsonb),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.trigger_background_sync(jsonb) from public, anon, authenticated;
grant execute on function public.trigger_background_sync(jsonb) to service_role;

create or replace function public.kick_ai_operator(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trigger_background_sync(jsonb_build_object('operatorOnly', true, 'workspace', _ws::text));
end $$;
revoke all on function public.kick_ai_operator(uuid) from public, anon, authenticated;
grant execute on function public.kick_ai_operator(uuid) to service_role;

-- Fresh deployments get the 5-minute job; an existing production job is left untouched.
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'tt24-background-sync') then
    perform cron.schedule('tt24-background-sync', '*/5 * * * *', 'select public.trigger_background_sync(''{}''::jsonb)');
  end if;
end $$;
