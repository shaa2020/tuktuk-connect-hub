-- 0027 Automation workflows: trigger → conditions → actions, optional delay, durable queue with
-- idempotency, retries and history. Existing auto-assign rules (automation_rules) are unchanged.

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  enabled boolean not null default true,
  trigger text not null check (trigger in ('conversation_created','message_received','booking_confirmed','booking_completed','lead_created')),
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 10),
  delay_minutes int not null default 0 check (delay_minutes between 0 and 43200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_workflows_ws on public.automation_workflows(workspace_id, trigger) where enabled;
grant select, insert, update, delete on public.automation_workflows to authenticated;
grant all on public.automation_workflows to service_role;
alter table public.automation_workflows enable row level security;
drop policy if exists "wf read" on public.automation_workflows;
create policy "wf read" on public.automation_workflows for select to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
drop policy if exists "wf write admins" on public.automation_workflows;
create policy "wf write admins" on public.automation_workflows for all to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));
drop trigger if exists t_upd on public.automation_workflows;
create trigger t_upd before update on public.automation_workflows for each row execute function public.touch_updated_at();
drop trigger if exists t_audit on public.automation_workflows;
create trigger t_audit after insert or update or delete on public.automation_workflows for each row execute function public.audit_row();

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  trigger text not null,
  entity_type text not null,
  entity_id uuid not null,
  idempotency_key text not null,
  run_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','done','skipped','failed')),
  attempts int not null default 0,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workflow_id, idempotency_key)
);
create index if not exists automation_events_due on public.automation_events(workspace_id, run_at) where status = 'pending';
create index if not exists automation_events_ws on public.automation_events(workspace_id, created_at desc);
grant select on public.automation_events to authenticated;
grant all on public.automation_events to service_role;
alter table public.automation_events enable row level security;
drop policy if exists "ae read" on public.automation_events;
create policy "ae read" on public.automation_events for select to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

-- Queue matching workflows. Never blocks the business write: failures are swallowed.
create or replace function public.enqueue_automation(_ws uuid, _trigger text, _entity_type text, _entity_id uuid, _key text)
returns void language plpgsql security definer set search_path = public as $$
declare w record; _lim bigint; _used bigint;
begin
  for w in select id, delay_minutes from public.automation_workflows where workspace_id = _ws and enabled and trigger = _trigger loop
    begin
      _lim := public.workspace_limit(_ws, 'monthly_automation_runs');
      _used := case when _lim is null then 0 else public.workspace_usage(_ws, 'monthly_automation_runs') end;
      insert into public.automation_events(workspace_id, workflow_id, trigger, entity_type, entity_id, idempotency_key, run_at, status, error)
      values (_ws, w.id, _trigger, _entity_type, _entity_id, _key, now() + make_interval(mins => w.delay_minutes),
              case when _lim is not null and _used >= _lim then 'skipped' else 'pending' end,
              case when _lim is not null and _used >= _lim then 'Plan limit reached: automation runs this month' else null end)
      on conflict (workflow_id, idempotency_key) do nothing;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end $$;
revoke all on function public.enqueue_automation(uuid, text, text, uuid, text) from public, anon, authenticated;

-- Nested IFs on purpose: PL/pgSQL does not short-circuit AND, so a combined condition would read
-- columns (e.g. new.direction) that don't exist on the other tables and break their inserts.
create or replace function public.automation_source_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'conversations' then
    if not new.is_demo then perform public.enqueue_automation(new.workspace_id, 'conversation_created', 'conversation', new.id, 'conv:' || new.id); end if;
  elsif tg_table_name = 'messages' then
    if new.direction = 'inbound' then perform public.enqueue_automation(new.workspace_id, 'message_received', 'message', new.id, 'msg:' || new.id); end if;
  elsif tg_table_name = 'bookings' then
    if not new.is_demo and new.status in ('confirmed','completed') then
      if tg_op = 'INSERT' then
        perform public.enqueue_automation(new.workspace_id, 'booking_' || new.status, 'booking', new.id, 'bk:' || new.status || ':' || new.id);
      elsif old.status is distinct from new.status then
        perform public.enqueue_automation(new.workspace_id, 'booking_' || new.status, 'booking', new.id, 'bk:' || new.status || ':' || new.id);
      end if;
    end if;
  elsif tg_table_name = 'leads' then
    if not new.is_demo then perform public.enqueue_automation(new.workspace_id, 'lead_created', 'lead', new.id, 'lead:' || new.id); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_automation_source on public.conversations;
create trigger trg_automation_source after insert on public.conversations for each row execute function public.automation_source_trigger();
drop trigger if exists trg_automation_source on public.messages;
create trigger trg_automation_source after insert on public.messages for each row execute function public.automation_source_trigger();
drop trigger if exists trg_automation_source on public.bookings;
create trigger trg_automation_source after insert or update of status on public.bookings for each row execute function public.automation_source_trigger();
drop trigger if exists trg_automation_source on public.leads;
create trigger trg_automation_source after insert on public.leads for each row execute function public.automation_source_trigger();

-- Count workflow executions toward the plan's automation allowance (in addition to legacy runs).
create or replace function public.workspace_usage(_ws uuid, _key text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare _month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  return case _key
    when 'members' then
      (select count(*) from public.workspace_members where workspace_id = _ws and active)
      + (select count(*) from public.invitations i where i.workspace_id = _ws and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
    when 'channel_accounts' then
      (select count(*) from public.channel_connections where workspace_id = _ws and status = 'connected')
    when 'monthly_conversations' then
      (select count(*) from public.conversations where workspace_id = _ws and not is_demo and created_at >= _month)
    when 'monthly_bookings' then
      (select count(*) from public.bookings where workspace_id = _ws and not is_demo and created_at >= _month)
    when 'scheduled_posts' then
      (select count(*) from public.social_posts where workspace_id = _ws and status = 'scheduled')
    when 'monthly_automation_runs' then
      (select count(*) from public.automation_runs where workspace_id = _ws and created_at >= _month)
      + (select count(*) from public.automation_events where workspace_id = _ws and created_at >= _month and status <> 'skipped')
    else
      coalesce((select count from public.usage_counters where workspace_id = _ws and metric = _key and period_start = _month::date), 0)
  end;
end $$;
