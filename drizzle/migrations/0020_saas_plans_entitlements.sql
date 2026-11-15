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
