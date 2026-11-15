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
