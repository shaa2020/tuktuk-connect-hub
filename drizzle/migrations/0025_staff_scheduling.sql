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
