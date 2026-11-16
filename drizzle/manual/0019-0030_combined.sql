-- COMBINED SaaS migrations 0019+ — fallback for manual application (e.g. Lovable Cloud SQL editor).
-- Safe to run more than once: every statement is idempotent. Take a database backup first.
-- Generated from drizzle/migrations by scripts/db-test/build-combined.sh — do not edit by hand.

-- ===== 0019_tenant_isolation_hardening.sql =====
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

-- ===== 0020_saas_plans_entitlements.sql =====
-- 0020 SaaS foundations (Phase 2): plans, entitlements, usage metering, self-service workspace
-- creation, subscriptions record, platform-admin suspension. Non-destructive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Plan catalogue. Prices are intentionally NULL until the owner decides them
--    (see docs/BLOCKERS.md B-BIZ-1): a plan without a price cannot be purchased.
--    Limits: a number, or null = unlimited.
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  sort int not null default 0,
  monthly_price_cents int check (monthly_price_cents is null or monthly_price_cents >= 0),
  annual_price_cents int check (annual_price_cents is null or annual_price_cents >= 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  trial_days int not null default 0 check (trial_days between 0 and 90),
  limits jsonb not null default '{}'::jsonb,
  public boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
drop policy if exists "plans readable" on public.plans;
create policy "plans readable" on public.plans for select to anon, authenticated using (active or public.is_platform_admin());

insert into public.plans(key, name, sort, public, limits) values
  ('free',         'Free',         10, true,  '{"members":2,"channel_accounts":1,"social_accounts":1,"monthly_ai_requests":50,"monthly_bookings":50,"scheduled_posts":5,"monthly_automation_runs":200,"storage_mb":500,"monthly_conversations":300}'),
  ('starter',      'Starter',      20, true,  '{"members":5,"channel_accounts":3,"social_accounts":3,"monthly_ai_requests":1000,"monthly_bookings":500,"scheduled_posts":50,"monthly_automation_runs":2000,"storage_mb":5000,"monthly_conversations":2000}'),
  ('professional', 'Professional', 30, true,  '{"members":15,"channel_accounts":10,"social_accounts":10,"monthly_ai_requests":5000,"monthly_bookings":3000,"scheduled_posts":300,"monthly_automation_runs":20000,"storage_mb":25000,"monthly_conversations":10000}'),
  ('business',     'Business',     40, true,  '{"members":50,"channel_accounts":30,"social_accounts":30,"monthly_ai_requests":20000,"monthly_bookings":null,"scheduled_posts":null,"monthly_automation_runs":100000,"storage_mb":100000,"monthly_conversations":50000}'),
  ('enterprise',   'Enterprise',   50, true,  '{"members":null,"channel_accounts":null,"social_accounts":null,"monthly_ai_requests":null,"monthly_bookings":null,"scheduled_posts":null,"monthly_automation_runs":null,"storage_mb":null,"monthly_conversations":null}'),
  ('internal',     'Internal (operator)', 99, false, '{"members":null,"channel_accounts":null,"social_accounts":null,"monthly_ai_requests":null,"monthly_bookings":null,"scheduled_posts":null,"monthly_automation_runs":null,"storage_mb":null,"monthly_conversations":null}')
on conflict (key) do nothing;

-- Legacy plan key from the first platform console.
update public.workspaces set plan = 'professional' where plan = 'pro';
update public.workspaces set plan = 'free' where plan not in (select key from public.plans);
alter table public.workspaces alter column plan set default 'free';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_plan_fk') then
    alter table public.workspaces add constraint workspaces_plan_fk foreign key (plan) references public.plans(key);
  end if;
end $$;

-- Optional business profile captured during onboarding.
alter table public.workspaces add column if not exists industry text check (industry is null or char_length(industry) <= 60);
alter table public.workspaces add column if not exists locale text not null default 'en' check (char_length(locale) between 2 and 10);
alter table public.workspaces add column if not exists brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.workspaces add column if not exists onboarding_completed_at timestamptz;
update public.workspaces set onboarding_completed_at = coalesce(onboarding_completed_at, created_at) where platform_connectors;
grant update (industry, locale, brand_color, onboarding_completed_at) on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Usage metering. Counters per workspace / metric / calendar month (UTC).
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric text not null check (char_length(metric) <= 60),
  period_start date not null,
  count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, metric, period_start)
);
grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;
alter table public.usage_counters enable row level security;
drop policy if exists "usage read admins" on public.usage_counters;
create policy "usage read admins" on public.usage_counters for select to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

-- Effective limit: per-workspace override (plan_limits) wins over the plan. NULL = unlimited.
create or replace function public.workspace_limit(_ws uuid, _key text)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when w.plan_limits ? _key then nullif(w.plan_limits ->> _key, '')::bigint
    else nullif(p.limits ->> _key, '')::bigint end
  from public.workspaces w join public.plans p on p.key = w.plan where w.id = _ws
$$;

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
    else
      coalesce((select count from public.usage_counters where workspace_id = _ws and metric = _key and period_start = _month::date), 0)
  end;
end $$;

-- Raises a friendly, machine-recognisable error when an action would exceed the plan.
create or replace function public.assert_entitlement(_ws uuid, _key text, _increment int default 1)
returns void language plpgsql stable security definer set search_path = public as $$
declare _lim bigint := public.workspace_limit(_ws, _key); _used bigint;
begin
  if _lim is null then return; end if;
  _used := public.workspace_usage(_ws, _key);
  if _used + _increment > _lim then
    raise exception 'PLAN_LIMIT:%: your plan allows % (currently %). Upgrade your plan to add more.', _key, _lim, _used
      using errcode = 'P0001';
  end if;
end $$;

-- Atomic check-and-count for metered actions (AI requests, outbound sends…). Server only.
create or replace function public.consume_usage(_ws uuid, _metric text, _amount int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _month date := (date_trunc('month', now() at time zone 'utc'))::date; _lim bigint; _new bigint;
begin
  if _amount < 1 or _amount > 1000000 then raise exception 'Invalid amount'; end if;
  _lim := public.workspace_limit(_ws, _metric);
  insert into public.usage_counters(workspace_id, metric, period_start, count) values (_ws, _metric, _month, 0)
    on conflict do nothing;
  update public.usage_counters set count = count + _amount, updated_at = now()
    where workspace_id = _ws and metric = _metric and period_start = _month
      and (_lim is null or count + _amount <= _lim)
    returning count into _new;
  if _new is null then
    return jsonb_build_object('ok', false, 'limit', _lim,
      'used', (select count from public.usage_counters where workspace_id = _ws and metric = _metric and period_start = _month));
  end if;
  return jsonb_build_object('ok', true, 'limit', _lim, 'used', _new);
end $$;
revoke all on function public.consume_usage(uuid, text, int) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, int) to service_role;

-- Usage overview for the billing page (admins/managers of the workspace, or platform admins).
create or replace function public.workspace_usage_summary(_ws uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _k text; _r jsonb := '{}'::jsonb;
begin
  if not (public.has_ws_role(_ws, array['admin','manager']::public.app_role[]) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  foreach _k in array array['members','channel_accounts','social_accounts','monthly_conversations','monthly_ai_requests','monthly_bookings','scheduled_posts','monthly_automation_runs'] loop
    _r := _r || jsonb_build_object(_k, jsonb_build_object('used', public.workspace_usage(_ws, _k), 'limit', public.workspace_limit(_ws, _k)));
  end loop;
  return jsonb_build_object('plan', (select plan from public.workspaces where id = _ws), 'usage', _r);
end $$;
revoke all on function public.workspace_usage_summary(uuid) from public, anon;
grant execute on function public.workspace_usage_summary(uuid) to authenticated;

-- Hard limits enforced in the database (cannot be bypassed by any client).
create or replace function public.enforce_plan_limits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'invitations' then
    perform public.assert_entitlement(new.workspace_id, 'members');
  elsif tg_table_name = 'channel_connections' then
    if new.status = 'connected' and (tg_op = 'INSERT' or old.status is distinct from 'connected') then
      perform public.assert_entitlement(new.workspace_id, 'channel_accounts');
    end if;
  elsif tg_table_name = 'bookings' then
    if not new.is_demo then perform public.assert_entitlement(new.workspace_id, 'monthly_bookings'); end if;
  elsif tg_table_name = 'social_posts' then
    if new.status = 'scheduled' and (tg_op = 'INSERT' or old.status is distinct from 'scheduled') then
      perform public.assert_entitlement(new.workspace_id, 'scheduled_posts');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_plan_limits on public.invitations;
create trigger trg_plan_limits before insert on public.invitations for each row execute function public.enforce_plan_limits();
drop trigger if exists trg_plan_limits on public.channel_connections;
create trigger trg_plan_limits before insert or update of status on public.channel_connections for each row execute function public.enforce_plan_limits();
drop trigger if exists trg_plan_limits on public.bookings;
create trigger trg_plan_limits before insert on public.bookings for each row execute function public.enforce_plan_limits();
drop trigger if exists trg_plan_limits on public.social_posts;
create trigger trg_plan_limits before insert or update of status on public.social_posts for each row execute function public.enforce_plan_limits();
-- Conversations are a SOFT limit on purpose: customer messages are never dropped. The usage
-- page shows overage and the platform admin decides (docs/SAAS_ROADMAP.md §Plan enforcement).

-- ---------------------------------------------------------------------------
-- 3. Subscription record (provider-agnostic). Written only by verified provider webhooks
--    (service role); workspace admins can read their own.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('stripe','paypal','manual')),
  provider_customer_id text,
  provider_subscription_id text,
  plan_key text not null references public.plans(key),
  billing_interval text not null default 'month' check (billing_interval in ('month','year')),
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete','paused')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  grace_until timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select on public.workspace_subscriptions to authenticated;
grant all on public.workspace_subscriptions to service_role;
alter table public.workspace_subscriptions enable row level security;
drop policy if exists "subs read admins" on public.workspace_subscriptions;
create policy "subs read admins" on public.workspace_subscriptions for select to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]) or public.is_platform_admin());

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
revoke all on public.billing_events from anon, authenticated;
grant all on public.billing_events to service_role;
alter table public.billing_events enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Self-service workspace creation. Any signed-in, email-verified user may create a
--    business workspace and becomes its owner + Business Admin. Anti-abuse cap: 3 owned.
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(_name text, _timezone text default 'Europe/Lisbon', _industry text default null, _locale text default 'en')
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _ws uuid; _name_clean text := btrim(coalesce(_name, ''));
begin
  if _uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from auth.users where id = _uid and email_confirmed_at is not null) then
    raise exception 'Please verify your email address first';
  end if;
  if char_length(_name_clean) < 2 or char_length(_name_clean) > 120 then raise exception 'Business name must be 2–120 characters'; end if;
  if not exists (select 1 from pg_timezone_names where name = _timezone) then raise exception 'Unknown time zone'; end if;
  if _industry is not null and char_length(_industry) > 60 then raise exception 'Industry is too long'; end if;
  if not public.is_platform_admin() and (select count(*) from public.workspaces where owner_id = _uid) >= 3 then
    raise exception 'You already own the maximum number of workspaces (3). Contact support for more.';
  end if;
  insert into public.profiles(id, email) select id, email from auth.users where id = _uid on conflict (id) do nothing;
  insert into public.workspaces(name, timezone, industry, locale, plan, owner_id, platform_connectors)
    values (_name_clean, _timezone, nullif(btrim(_industry), ''), coalesce(nullif(_locale, ''), 'en'), 'free', _uid, false)
    returning id into _ws;
  insert into public.workspace_members(workspace_id, user_id, role, active) values (_ws, _uid, 'admin', true);
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, _uid, 'create', 'workspaces', _ws, jsonb_build_object('name', _name_clean, 'industry', _industry));
  return _ws;
end $$;
revoke all on function public.create_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Platform administration (separate from workspace admins). Every action audited.
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_workspace_suspension(_ws uuid, _suspend boolean, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  if _suspend and (_reason is null or char_length(btrim(_reason)) < 3) then raise exception 'Give a reason for the suspension'; end if;
  update public.workspaces set
    suspended_at = case when _suspend then coalesce(suspended_at, now()) else null end,
    suspended_reason = case when _suspend then left(btrim(_reason), 500) else null end
  where id = _ws;
  if not found then raise exception 'Workspace not found'; end if;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), case when _suspend then 'platform.suspend' else 'platform.reactivate' end, 'workspaces', _ws,
            jsonb_build_object('reason', _reason));
end $$;
revoke all on function public.platform_set_workspace_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.platform_set_workspace_suspension(uuid, boolean, text) to authenticated;

create or replace function public.platform_set_workspace_plan(_ws uuid, _plan text)
returns void language plpgsql security definer set search_path = public as $$
declare _old text;
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  if not exists (select 1 from public.plans where key = _plan) then raise exception 'Unknown plan'; end if;
  select plan into _old from public.workspaces where id = _ws;
  if not found then raise exception 'Workspace not found'; end if;
  update public.workspaces set plan = _plan where id = _ws;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (_ws, auth.uid(), 'platform.plan_change', 'workspaces', _ws, jsonb_build_object('from', _old, 'to', _plan));
end $$;
revoke all on function public.platform_set_workspace_plan(uuid, text) from public, anon;
grant execute on function public.platform_set_workspace_plan(uuid, text) to authenticated;

-- Platform overview without reading any private conversation content.
create or replace function public.platform_workspace_overview()
returns table (id uuid, name text, plan text, industry text, created_at timestamptz, suspended_at timestamptz,
               suspended_reason text, owner_email text, members bigint, connected_channels bigint,
               conversations_this_month bigint, ai_requests_this_month bigint, subscription_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select w.id, w.name, w.plan, w.industry, w.created_at, w.suspended_at, w.suspended_reason,
    (select p.email from public.profiles p where p.id = w.owner_id),
    (select count(*) from public.workspace_members m where m.workspace_id = w.id and m.active),
    (select count(*) from public.channel_connections c where c.workspace_id = w.id and c.status = 'connected'),
    (select count(*) from public.conversations c where c.workspace_id = w.id and c.created_at >= date_trunc('month', now())),
    coalesce((select u.count from public.usage_counters u where u.workspace_id = w.id and u.metric = 'monthly_ai_requests'
              and u.period_start = (date_trunc('month', now() at time zone 'utc'))::date), 0),
    (select s.status from public.workspace_subscriptions s where s.workspace_id = w.id)
  from public.workspaces w order by w.created_at;
end $$;
revoke all on function public.platform_workspace_overview() from public, anon;
grant execute on function public.platform_workspace_overview() to authenticated;

-- ===== 0021_rate_limits.sql =====
-- 0021 Fixed-window rate limiter for public endpoints (SECURITY_AUDIT F-10). Server only.
-- Idempotent and non-destructive.
create table if not exists public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;
alter table public.rate_limits enable row level security;

-- Returns true if the call is allowed (and counts it), false once _max calls happened in the window.
create or replace function public.check_rate_limit(_key text, _max int, _window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare _win timestamptz; _n int;
begin
  if _max < 1 or _window_seconds < 1 or _window_seconds > 86400 then raise exception 'Invalid rate limit'; end if;
  _win := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  insert into public.rate_limits(key, window_start, count) values (left(_key, 200), _win, 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into _n;
  -- Opportunistic cleanup (~1% of calls) keeps the table small without a separate job.
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return _n <= _max;
end $$;
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- ===== 0022_job_fanout_social_publishing.sql =====
-- 0022 Background-job fan-out + social publishing bookkeeping. Idempotent, non-destructive.

-- One background request per active (non-suspended) workspace, started asynchronously via pg_net,
-- so each workspace gets its own time budget instead of all sharing one request.
create or replace function public.trigger_background_sync_fanout()
returns int language plpgsql security definer set search_path = public as $$
declare _w record; _n int := 0;
begin
  for _w in select id from public.workspaces where suspended_at is null order by created_at loop
    perform public.trigger_background_sync(jsonb_build_object('workspace', _w.id::text));
    _n := _n + 1;
  end loop;
  return _n;
end $$;
revoke all on function public.trigger_background_sync_fanout() from public, anon, authenticated;
grant execute on function public.trigger_background_sync_fanout() to service_role;

-- Social publishing worker state (claimed with a lease, bounded retries, per-target results).
alter table public.social_posts add column if not exists publish_attempts int not null default 0;
alter table public.social_posts add column if not exists publish_started_at timestamptz;
alter table public.social_posts add column if not exists publish_results jsonb not null default '[]'::jsonb;
create index if not exists social_posts_due_idx on public.social_posts(workspace_id, scheduled_at) where status = 'scheduled';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_posts_status_chk') then
    alter table public.social_posts add constraint social_posts_status_chk
      check (status in ('draft','scheduled','publishing','published','partially_published','failed')) not valid;
  end if;
end $$;
-- Browsers may not fake publishing results: those columns are written only by the worker.
revoke update on public.social_posts from authenticated;
grant update (title, body, media_urls, targets, status, scheduled_at) on public.social_posts to authenticated;

-- Members may only set draft/scheduled themselves (published/failed come from the worker).
-- SECURITY INVOKER on purpose: current_user must be the caller's role (authenticated vs service_role).
create or replace function public.social_post_status_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.status not in ('draft','scheduled') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Only drafts and scheduled posts can be saved from the app' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_social_status_guard on public.social_posts;
create trigger trg_social_status_guard before insert or update on public.social_posts
  for each row execute function public.social_post_status_guard();

-- ===== 0023_telegram_webchat_channels.sql =====
-- 0023 New inbox channels: Telegram (per-business bot) and website live chat. Idempotent.
alter type public.channel_type add value if not exists 'telegram';
alter type public.channel_type add value if not exists 'webchat';

-- ===== 0024_stripe_prices.sql =====
-- 0024 Stripe price ids per plan (set by the platform owner once prices exist in Stripe). Idempotent.
alter table public.plans add column if not exists stripe_price_monthly text check (stripe_price_monthly is null or stripe_price_monthly ~ '^price_[A-Za-z0-9]+$');
alter table public.plans add column if not exists stripe_price_annual text check (stripe_price_annual is null or stripe_price_annual ~ '^price_[A-Za-z0-9]+$');
create unique index if not exists workspace_subscriptions_provider_sub_uq on public.workspace_subscriptions(provider, provider_subscription_id) where provider_subscription_id is not null;

-- ===== 0025_staff_scheduling.sql =====
-- 0025 Staff scheduling: shifts, time-off requests, shift swaps, attendance (clock in/out).
-- Idempotent, non-destructive. Attendance is an operational record only — NOT certified legal
-- timekeeping or payroll (docs/KNOWN_LIMITATIONS.md).

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  position text check (position is null or char_length(position) <= 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint shift_time_ok check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index if not exists staff_shifts_ws_time on public.staff_shifts(workspace_id, starts_at);
create index if not exists staff_shifts_user_time on public.staff_shifts(user_id, starts_at);
grant select, insert, update, delete on public.staff_shifts to authenticated;
grant all on public.staff_shifts to service_role;
alter table public.staff_shifts enable row level security;
drop policy if exists "shifts read" on public.staff_shifts;
create policy "shifts read" on public.staff_shifts for select to authenticated using (public.is_member(workspace_id));
drop policy if exists "shifts write managers" on public.staff_shifts;
create policy "shifts write managers" on public.staff_shifts for all to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint time_off_dates_ok check (ends_on >= starts_on and ends_on - starts_on <= 90)
);
create index if not exists time_off_ws on public.time_off_requests(workspace_id, starts_on);
grant select, insert, delete on public.time_off_requests to authenticated;
grant all on public.time_off_requests to service_role;
alter table public.time_off_requests enable row level security;
drop policy if exists "timeoff read" on public.time_off_requests;
create policy "timeoff read" on public.time_off_requests for select to authenticated
  using (user_id = auth.uid() and public.is_member(workspace_id) or public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
drop policy if exists "timeoff insert own" on public.time_off_requests;
create policy "timeoff insert own" on public.time_off_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null and public.is_member(workspace_id));
drop policy if exists "timeoff delete own pending" on public.time_off_requests;
create policy "timeoff delete own pending" on public.time_off_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shift_id uuid not null references public.staff_shifts(id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.shift_swap_requests to authenticated;
grant all on public.shift_swap_requests to service_role;
alter table public.shift_swap_requests enable row level security;
drop policy if exists "swap read" on public.shift_swap_requests;
create policy "swap read" on public.shift_swap_requests for select to authenticated
  using (public.is_member(workspace_id) and (from_user = auth.uid() or to_user = auth.uid()) or public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
drop policy if exists "swap insert own shift" on public.shift_swap_requests;
create policy "swap insert own shift" on public.shift_swap_requests for insert to authenticated
  with check (from_user = auth.uid() and status = 'pending' and decided_by is null and public.is_member(workspace_id)
    and exists (select 1 from public.staff_shifts s where s.id = shift_id and s.user_id = auth.uid() and s.workspace_id = shift_swap_requests.workspace_id));
drop policy if exists "swap delete own pending" on public.shift_swap_requests;
create policy "swap delete own pending" on public.shift_swap_requests for delete to authenticated
  using (from_user = auth.uid() and status = 'pending');

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  constraint attendance_order check (clock_out is null or clock_out >= clock_in)
);
create index if not exists attendance_ws on public.staff_attendance(workspace_id, clock_in desc);
create unique index if not exists attendance_one_open on public.staff_attendance(workspace_id, user_id) where clock_out is null;
grant select on public.staff_attendance to authenticated;
grant all on public.staff_attendance to service_role;
alter table public.staff_attendance enable row level security;
drop policy if exists "attendance read" on public.staff_attendance;
create policy "attendance read" on public.staff_attendance for select to authenticated
  using (user_id = auth.uid() and public.is_member(workspace_id) or public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

-- Same-workspace and membership guards (from 0019).
drop trigger if exists trg_member_ref on public.staff_shifts;
create trigger trg_member_ref before insert or update on public.staff_shifts for each row execute function public.enforce_member_ref('user_id');
drop trigger if exists trg_member_ref on public.time_off_requests;
create trigger trg_member_ref before insert or update on public.time_off_requests for each row execute function public.enforce_member_ref('user_id');
drop trigger if exists trg_member_ref on public.shift_swap_requests;
create trigger trg_member_ref before insert or update on public.shift_swap_requests for each row execute function public.enforce_member_ref('from_user', 'to_user');
drop trigger if exists trg_same_workspace on public.shift_swap_requests;
create trigger trg_same_workspace before insert or update on public.shift_swap_requests for each row execute function public.enforce_same_workspace('shift_id', 'staff_shifts');
drop trigger if exists trg_same_workspace on public.staff_attendance;
create trigger trg_same_workspace before insert or update on public.staff_attendance for each row execute function public.enforce_same_workspace('shift_id', 'staff_shifts');

-- No double-booking a person; notify them about new or moved shifts.
create or replace function public.staff_shift_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare _clash uuid;
begin
  perform pg_advisory_xact_lock(hashtext(new.workspace_id::text || new.user_id::text));
  select id into _clash from public.staff_shifts s
    where s.workspace_id = new.workspace_id and s.user_id = new.user_id and s.id <> new.id
      and s.starts_at < new.ends_at and s.ends_at > new.starts_at limit 1;
  if found then raise exception 'This person already has a shift at that time.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists trg_staff_shift_guard on public.staff_shifts;
create trigger trg_staff_shift_guard before insert or update of user_id, starts_at, ends_at on public.staff_shifts
  for each row execute function public.staff_shift_guard();

create or replace function public.staff_shift_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from auth.uid() and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.starts_at is distinct from old.starts_at) then
    insert into public.notifications(workspace_id, user_id, kind, title, body, link)
      values (new.workspace_id, new.user_id, 'shift', case when tg_op = 'INSERT' then 'New shift' else 'Shift changed' end,
              to_char(new.starts_at at time zone coalesce((select timezone from public.workspaces where id = new.workspace_id), 'UTC'), 'Dy DD Mon HH24:MI') || ' – ' ||
              to_char(new.ends_at at time zone coalesce((select timezone from public.workspaces where id = new.workspace_id), 'UTC'), 'HH24:MI'), '/schedule');
  end if;
  return new;
end $$;
drop trigger if exists trg_staff_shift_notify on public.staff_shifts;
create trigger trg_staff_shift_notify after insert or update on public.staff_shifts for each row execute function public.staff_shift_notify();

-- Managers decide time off / swaps (atomic, audited, requester notified).
create or replace function public.decide_time_off(_id uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.time_off_requests;
begin
  select * into r from public.time_off_requests where id = _id for update;
  if not found or not public.has_ws_role(r.workspace_id, array['admin','manager']::public.app_role[]) then raise exception 'Not allowed'; end if;
  if r.status <> 'pending' then raise exception 'Already decided'; end if;
  update public.time_off_requests set status = case when _approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = _id;
  insert into public.notifications(workspace_id, user_id, kind, title, body, link)
    values (r.workspace_id, r.user_id, 'time_off', case when _approve then 'Time off approved' else 'Time off declined' end, r.starts_on || ' – ' || r.ends_on, '/schedule');
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (r.workspace_id, auth.uid(), case when _approve then 'approve' else 'decline' end, 'time_off_requests', _id, jsonb_build_object('user', r.user_id));
end $$;
revoke all on function public.decide_time_off(uuid, boolean) from public, anon;
grant execute on function public.decide_time_off(uuid, boolean) to authenticated;

create or replace function public.decide_shift_swap(_id uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.shift_swap_requests;
begin
  select * into r from public.shift_swap_requests where id = _id for update;
  if not found or not public.has_ws_role(r.workspace_id, array['admin','manager']::public.app_role[]) then raise exception 'Not allowed'; end if;
  if r.status <> 'pending' then raise exception 'Already decided'; end if;
  if _approve then
    update public.staff_shifts set user_id = r.to_user where id = r.shift_id and user_id = r.from_user;
    if not found then raise exception 'The shift changed since the request was made'; end if;
  end if;
  update public.shift_swap_requests set status = case when _approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = _id;
  insert into public.notifications(workspace_id, user_id, kind, title, link)
    values (r.workspace_id, r.from_user, 'shift', case when _approve then 'Shift swap approved' else 'Shift swap declined' end, '/schedule');
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
    values (r.workspace_id, auth.uid(), case when _approve then 'approve' else 'decline' end, 'shift_swap_requests', _id, jsonb_build_object('from', r.from_user, 'to', r.to_user));
end $$;
revoke all on function public.decide_shift_swap(uuid, boolean) from public, anon;
grant execute on function public.decide_shift_swap(uuid, boolean) to authenticated;

-- Clock in/out uses the server clock (members can't backdate).
create or replace function public.clock_in(_ws uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _shift uuid;
begin
  if not public.is_member(_ws) then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.staff_attendance where workspace_id = _ws and user_id = auth.uid() and clock_out is null) then raise exception 'You are already clocked in'; end if;
  select id into _shift from public.staff_shifts where workspace_id = _ws and user_id = auth.uid()
    and starts_at - interval '2 hours' <= now() and ends_at >= now() order by starts_at limit 1;
  insert into public.staff_attendance(workspace_id, user_id, shift_id) values (_ws, auth.uid(), _shift) returning id into _id;
  return _id;
end $$;
create or replace function public.clock_out(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(_ws) then raise exception 'Not allowed'; end if;
  update public.staff_attendance set clock_out = now() where workspace_id = _ws and user_id = auth.uid() and clock_out is null;
  if not found then raise exception 'You are not clocked in'; end if;
end $$;
revoke all on function public.clock_in(uuid), public.clock_out(uuid) from public, anon;
grant execute on function public.clock_in(uuid), public.clock_out(uuid) to authenticated;

-- ===== 0026_crm_import_duplicates_custom_fields.sql =====
-- 0026 CRM: custom contact fields, bulk import with de-duplication, duplicate finder. Idempotent.

create table if not exists public.contact_field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 60),
  type text not null default 'text' check (type in ('text','number','date','select')),
  options text[] not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);
grant select, insert, update, delete on public.contact_field_definitions to authenticated;
grant all on public.contact_field_definitions to service_role;
alter table public.contact_field_definitions enable row level security;
drop policy if exists "cfd read" on public.contact_field_definitions;
create policy "cfd read" on public.contact_field_definitions for select to authenticated using (public.is_member(workspace_id));
drop policy if exists "cfd write admins" on public.contact_field_definitions;
create policy "cfd write admins" on public.contact_field_definitions for all to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

alter table public.contacts add column if not exists custom_fields jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_custom_fields_size') then
    alter table public.contacts add constraint contacts_custom_fields_size check (jsonb_typeof(custom_fields) = 'object' and pg_column_size(custom_fields) <= 8192);
  end if;
end $$;

-- Only defined keys, values of the right type.
create or replace function public.validate_custom_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; d record;
begin
  if new.custom_fields = '{}'::jsonb or (tg_op = 'UPDATE' and new.custom_fields = old.custom_fields) then return new; end if;
  for k, v in select * from jsonb_each(new.custom_fields) loop
    select type, options into d from public.contact_field_definitions where workspace_id = new.workspace_id and key = k;
    if not found then raise exception 'Unknown custom field: %', k using errcode = '22023'; end if;
    continue when v = 'null'::jsonb;
    if d.type = 'number' and jsonb_typeof(v) <> 'number' then raise exception '% must be a number', k using errcode = '22023'; end if;
    if d.type in ('text','date','select') and jsonb_typeof(v) <> 'string' then raise exception '% must be text', k using errcode = '22023'; end if;
    if d.type = 'date' and (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '% must be a date (YYYY-MM-DD)', k using errcode = '22023'; end if;
    if d.type = 'select' and not ((v #>> '{}') = any(d.options)) then raise exception '% must be one of the listed options', k using errcode = '22023'; end if;
    if d.type = 'text' and char_length(v #>> '{}') > 500 then raise exception '% is too long', k using errcode = '22023'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_validate_custom_fields on public.contacts;
create trigger trg_validate_custom_fields before insert or update of custom_fields on public.contacts
  for each row execute function public.validate_custom_fields();

-- Phone normalisation for matching: digits only, leading 00 → nothing.
create or replace function public.norm_phone(_p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(_p, ''), '\D', '', 'g'), '^00', ''), '')
$$;
create index if not exists contacts_norm_phone_idx on public.contacts(workspace_id, public.norm_phone(phone));

-- Bulk import (admins/managers). Skips rows that match an existing contact or an earlier row by
-- email or phone. Max 2,000 rows per call. Returns counts; audited.
create or replace function public.import_contacts(_ws uuid, _rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; _name text; _email text; _phone text; _ins int := 0; _skip int := 0; _bad int := 0;
begin
  if not public.has_ws_role(_ws, array['admin','manager']::public.app_role[]) then raise exception 'Only admins and managers can import contacts'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 2000 then raise exception 'Send between 1 and 2000 rows'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    _name := left(btrim(coalesce(r->>'full_name', '')), 200);
    _email := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    _phone := nullif(left(btrim(coalesce(r->>'phone', '')), 40), '');
    if _email is not null and _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then _email := null; end if;
    if _name = '' then _name := coalesce(_email, _phone, ''); end if;
    if _name = '' then _bad := _bad + 1; continue; end if;
    if exists (select 1 from public.contacts c where c.workspace_id = _ws and c.merged_into is null and (
         (_email is not null and lower(c.email) = _email) or (_phone is not null and public.norm_phone(c.phone) = public.norm_phone(_phone)))) then
      _skip := _skip + 1; continue;
    end if;
    begin
      insert into public.contacts(workspace_id, full_name, email, phone, preferred_language, country, notes, custom_fields, created_by)
      values (_ws, _name, _email, _phone, nullif(left(btrim(coalesce(r->>'preferred_language','')), 40), ''), nullif(left(btrim(coalesce(r->>'country','')), 80), ''),
              nullif(left(coalesce(r->>'notes',''), 5000), ''), coalesce(r->'custom_fields', '{}'::jsonb), auth.uid());
      _ins := _ins + 1;
    exception when others then _bad := _bad + 1;
    end;
  end loop;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, details)
    values (_ws, auth.uid(), 'import', 'contacts', jsonb_build_object('inserted', _ins, 'skipped_duplicates', _skip, 'invalid', _bad));
  return jsonb_build_object('inserted', _ins, 'skipped_duplicates', _skip, 'invalid', _bad);
end $$;
revoke all on function public.import_contacts(uuid, jsonb) from public, anon;
grant execute on function public.import_contacts(uuid, jsonb) to authenticated;

-- Likely duplicates: same email, same phone, or same name (case-insensitive).
create or replace function public.find_duplicate_contacts(_ws uuid, _limit int default 100)
returns table (keep_id uuid, keep_name text, dup_id uuid, dup_name text, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_ws_role(_ws, array['admin','manager']::public.app_role[]) then raise exception 'Not allowed'; end if;
  return query
  with c as (select id, full_name, lower(email) em, public.norm_phone(phone) ph, lower(btrim(full_name)) nm, created_at
             from public.contacts where workspace_id = _ws and merged_into is null and anonymized_at is null and not is_demo)
  select distinct on (b.id) a.id, a.full_name, b.id, b.full_name,
    case when a.em = b.em then 'same email' when a.ph = b.ph then 'same phone' else 'same name' end
  from c a join c b on a.id <> b.id and (a.created_at, a.id) < (b.created_at, b.id)
    and ((a.em is not null and a.em = b.em) or (a.ph is not null and length(a.ph) >= 7 and a.ph = b.ph) or (a.nm = b.nm and length(a.nm) >= 5))
  order by b.id, a.created_at
  limit greatest(1, least(_limit, 500));
end $$;
revoke all on function public.find_duplicate_contacts(uuid, int) from public, anon;
grant execute on function public.find_duplicate_contacts(uuid, int) to authenticated;

-- ===== 0027_automation_workflows.sql =====
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

-- ===== 0028_gdpr_ownership_retention.sql =====
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

-- ===== 0029_ai_classification_approvals.sql =====
-- 0029 AI: conversation classification (intent, sentiment, summary) and an approval queue for
-- AI-drafted replies (sent only after a human approves). Idempotent.

alter table public.ai_settings add column if not exists auto_classify boolean not null default false;
alter table public.conversations add column if not exists ai_intent text check (ai_intent is null or ai_intent in ('booking','pricing','availability','support','complaint','cancellation','other'));
alter table public.conversations add column if not exists ai_sentiment text check (ai_sentiment is null or ai_sentiment in ('positive','neutral','negative'));
alter table public.conversations add column if not exists ai_summary text check (ai_summary is null or char_length(ai_summary) <= 500);
alter table public.conversations add column if not exists ai_classified_message_id uuid;
alter table public.conversations add column if not exists ai_classified_at timestamptz;

create table if not exists public.ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4096),
  source text not null default 'ai_operator',
  status text not null default 'pending' check (status in ('pending','sent','discarded')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_reply_drafts_conv on public.ai_reply_drafts(conversation_id) where status = 'pending';
grant select on public.ai_reply_drafts to authenticated;
grant all on public.ai_reply_drafts to service_role;
alter table public.ai_reply_drafts enable row level security;
drop policy if exists "drafts read" on public.ai_reply_drafts;
create policy "drafts read" on public.ai_reply_drafts for select to authenticated using (public.can_view_conversation_id(conversation_id));
drop trigger if exists trg_same_workspace on public.ai_reply_drafts;
create trigger trg_same_workspace before insert or update on public.ai_reply_drafts for each row execute function public.enforce_same_workspace('conversation_id', 'conversations');

-- Discard (sending goes through the normal send path, then mark_ai_draft_sent).
create or replace function public.decide_ai_draft(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.ai_reply_drafts;
begin
  if _status not in ('sent','discarded') then raise exception 'Invalid status'; end if;
  select * into d from public.ai_reply_drafts where id = _id for update;
  if not found or not public.can_view_conversation_id(d.conversation_id) then raise exception 'Not allowed'; end if;
  if d.status <> 'pending' then return; end if;
  update public.ai_reply_drafts set status = _status, decided_by = auth.uid(), decided_at = now() where id = _id;
end $$;
revoke all on function public.decide_ai_draft(uuid, text) from public, anon;
grant execute on function public.decide_ai_draft(uuid, text) to authenticated;

-- ===== 0030_platform_health_support_mfa_recovery.sql =====
-- 0030 Platform revenue & health views, consent-based time-limited support access,
-- MFA recovery codes. Idempotent, non-destructive.

-- Estimated MRR from active subscriptions × plan list prices (annual / 12). Platform admins only.
create or replace function public.platform_revenue_summary()
returns table (plan text, active_subscriptions bigint, trialing bigint, past_due bigint, mrr_cents bigint, currency text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select p.key, count(*) filter (where s.status = 'active'), count(*) filter (where s.status = 'trialing'), count(*) filter (where s.status = 'past_due'),
    coalesce(sum(case when s.status in ('active','past_due') then case when s.billing_interval = 'year' then coalesce(p.annual_price_cents, 0) / 12 else coalesce(p.monthly_price_cents, 0) end else 0 end), 0)::bigint,
    max(p.currency)
  from public.plans p left join public.workspace_subscriptions s on s.plan_key = p.key
  group by p.key, p.sort order by p.sort;
end $$;
revoke all on function public.platform_revenue_summary() from public, anon;
grant execute on function public.platform_revenue_summary() to authenticated;

-- System health per workspace: counts and provider error strings only, never customer content.
create or replace function public.platform_health()
returns table (workspace_id uuid, name text, broken_channels bigint, channel_errors text, failed_automations_24h bigint, pending_automations bigint,
               failed_social_posts bigint, ai_operator_paused text, last_operator_run timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select w.id, w.name,
    (select count(*) from public.channel_connections c where c.workspace_id = w.id and c.last_error is not null),
    (select string_agg(c.channel || ': ' || left(c.last_error, 120), ' | ') from public.channel_connections c where c.workspace_id = w.id and c.last_error is not null),
    (select count(*) from public.automation_events e where e.workspace_id = w.id and e.status = 'failed' and e.created_at > now() - interval '24 hours'),
    (select count(*) from public.automation_events e where e.workspace_id = w.id and e.status = 'pending' and e.run_at < now() - interval '15 minutes'),
    (select count(*) from public.social_posts s where s.workspace_id = w.id and s.status = 'failed'),
    (select o.paused_reason from public.ai_operator_settings o where o.workspace_id = w.id),
    (select o.last_run_at from public.ai_operator_settings o where o.workspace_id = w.id)
  from public.workspaces w where w.suspended_at is null order by w.name;
end $$;
revoke all on function public.platform_health() from public, anon;
grant execute on function public.platform_health() to authenticated;

create or replace function public.platform_job_backlog()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return jsonb_build_object(
    'whatsapp_unprocessed', (select count(*) from public.whatsapp_webhook_events where processed_at is null),
    'whatsapp_stuck_1h', (select count(*) from public.whatsapp_webhook_events where processed_at is null and received_at < now() - interval '1 hour'),
    'billing_unprocessed', (select count(*) from public.billing_events where processed_at is null),
    'automations_overdue', (select count(*) from public.automation_events where status = 'pending' and run_at < now() - interval '15 minutes'),
    'pending_deletions', (select count(*) from public.workspaces where deletion_scheduled_for is not null));
end $$;
revoke all on function public.platform_job_backlog() from public, anon;
grant execute on function public.platform_job_backlog() to authenticated;

-- Support access: a workspace admin grants the platform team read-only access for a limited time.
create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granted_by uuid not null default auth.uid(),
  reason text not null check (char_length(reason) between 3 and 300),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_window check (expires_at <= created_at + interval '72 hours')
);
grant select on public.support_access_grants to authenticated;
grant all on public.support_access_grants to service_role;
alter table public.support_access_grants enable row level security;
drop policy if exists "grants read" on public.support_access_grants;
create policy "grants read" on public.support_access_grants for select to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]) or public.is_platform_admin());

create or replace function public.grant_support_access(_ws uuid, _hours int, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.has_ws_role(_ws, array['admin']::public.app_role[]) then raise exception 'Only a Business Admin can grant support access'; end if;
  if _hours < 1 or _hours > 72 then raise exception 'Choose between 1 and 72 hours'; end if;
  insert into public.support_access_grants(workspace_id, reason, expires_at) values (_ws, btrim(_reason), now() + make_interval(hours => _hours)) returning id into _id;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details) values (_ws, auth.uid(), 'support.grant', 'support_access_grants', _id, jsonb_build_object('hours', _hours, 'reason', _reason));
  return _id;
end $$;
create or replace function public.revoke_support_access(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _ws uuid;
begin
  select workspace_id into _ws from public.support_access_grants where id = _id;
  if _ws is null or not public.has_ws_role(_ws, array['admin']::public.app_role[]) then raise exception 'Not allowed'; end if;
  update public.support_access_grants set revoked_at = now() where id = _id and revoked_at is null;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id) values (_ws, auth.uid(), 'support.revoke', 'support_access_grants', _id);
end $$;
revoke all on function public.grant_support_access(uuid, int, text), public.revoke_support_access(uuid) from public, anon;
grant execute on function public.grant_support_access(uuid, int, text), public.revoke_support_access(uuid) to authenticated;

-- Read-only support snapshot. Requires an active grant; every call is written to the workspace's
-- own audit log so the business sees exactly when support looked.
create or replace function public.support_workspace_snapshot(_ws uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _g uuid;
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  select id into _g from public.support_access_grants where workspace_id = _ws and revoked_at is null and expires_at > now() order by expires_at desc limit 1;
  if _g is null then raise exception 'No active support access for this workspace. Ask the business admin to grant it.'; end if;
  insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id) values (_ws, auth.uid(), 'support.view', 'support_access_grants', _g);
  return jsonb_build_object(
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'label', coalesce(account_label, display_name), 'status', status, 'last_error', last_error)), '[]') from public.channel_connections where workspace_id = _ws),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', m.role, 'active', m.active)), '[]') from public.workspace_members m join public.profiles p on p.id = m.user_id where m.workspace_id = _ws),
    'recent_conversations', (select coalesce(jsonb_agg(x), '[]') from (select channel, status, left(last_message_preview, 80) preview, last_message_at from public.conversations where workspace_id = _ws order by last_message_at desc limit 20) x),
    'failed_messages', (select coalesce(jsonb_agg(x), '[]') from (select created_at, left(error_message, 200) error from public.messages where workspace_id = _ws and status = 'failed' order by created_at desc limit 20) x),
    'automation_failures', (select coalesce(jsonb_agg(x), '[]') from (select created_at, left(error, 200) error from public.automation_events where workspace_id = _ws and status = 'failed' order by created_at desc limit 20) x));
end $$;
revoke all on function public.support_workspace_snapshot(uuid) from public, anon;
grant execute on function public.support_workspace_snapshot(uuid) to authenticated;

-- MFA recovery codes (hashes only; each usable once). Written/used only by server functions.
create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_user on public.mfa_recovery_codes(user_id) where used_at is null;
revoke all on public.mfa_recovery_codes from anon, authenticated;
grant all on public.mfa_recovery_codes to service_role;
alter table public.mfa_recovery_codes enable row level security;

