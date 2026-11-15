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
