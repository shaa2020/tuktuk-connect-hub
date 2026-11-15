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
