-- 0033 Services (any industry) + public online booking page. Availability and booking creation
-- run in the database (capacity checked under a lock), so double-booking past capacity is impossible.
-- Idempotent, non-destructive.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  booking_mode text not null default 'slot' check (booking_mode in ('slot','day')),
  duration_minutes int not null default 60 check (duration_minutes between 15 and 1440),
  slot_interval_minutes int not null default 30 check (slot_interval_minutes between 5 and 720),
  price_cents int check (price_cents is null or price_cents between 0 and 100000000),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  price_per text not null default 'booking' check (price_per in ('booking','person')),
  capacity int not null default 1 check (capacity between 1 and 10000),
  capacity_unit text not null default 'guests' check (capacity_unit in ('guests','bookings')),
  min_guests int not null default 1 check (min_guests between 1 and 1000),
  max_guests int not null default 10 check (max_guests between 1 and 1000),
  weekly_hours jsonb not null default '{"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],"3":[["09:00","18:00"]],"4":[["09:00","18:00"]],"5":[["09:00","18:00"]],"6":[["10:00","16:00"]]}'::jsonb,
  lead_time_hours int not null default 2 check (lead_time_hours between 0 and 720),
  advance_days int not null default 90 check (advance_days between 1 and 730),
  public boolean not null default true,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_range check (max_guests >= min_guests),
  constraint hours_object check (jsonb_typeof(weekly_hours) = 'object')
);
create index if not exists services_ws on public.services(workspace_id, sort);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;
drop policy if exists "services read" on public.services;
create policy "services read" on public.services for select to authenticated using (public.is_member(workspace_id));
drop policy if exists "services write" on public.services;
create policy "services write" on public.services for all to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
drop trigger if exists t_upd on public.services;
create trigger t_upd before update on public.services for each row execute function public.touch_updated_at();

alter table public.bookings add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.bookings add column if not exists end_date date;
create index if not exists bookings_service_date on public.bookings(service_id, tour_date) where service_id is not null;
drop trigger if exists trg_same_workspace on public.bookings;
create trigger trg_same_workspace before insert or update on public.bookings for each row
  execute function public.enforce_same_workspace('contact_id', 'contacts', 'lead_id', 'leads', 'vehicle_id', 'vehicles', 'service_id', 'services');

alter table public.workspaces add column if not exists public_slug text check (public_slug is null or public_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');
alter table public.workspaces add column if not exists booking_page_enabled boolean not null default false;
alter table public.workspaces add column if not exists booking_page_intro text check (booking_page_intro is null or char_length(booking_page_intro) <= 500);
alter table public.workspaces add column if not exists booking_auto_confirm boolean not null default false;
create unique index if not exists workspaces_public_slug_uq on public.workspaces(public_slug) where public_slug is not null;
grant update (public_slug, booking_page_enabled, booking_page_intro, booking_auto_confirm) on public.workspaces to authenticated;

-- Free capacity per start time on a date (slot mode) or for the whole day (day mode).
create or replace function public.service_availability(_service uuid, _date date)
returns table (start_time time, remaining int)
language plpgsql stable security definer set search_path = public as $$
declare s public.services; _tz text; _now timestamp; _win jsonb; _t time; _end time; _used int;
begin
  select * into s from public.services where id = _service and active;
  if not found then return; end if;
  select coalesce(timezone, 'UTC') into _tz from public.workspaces where id = s.workspace_id;
  _now := now() at time zone _tz;
  if _date < _now::date or _date > (_now::date + s.advance_days) then return; end if;
  if s.booking_mode = 'day' then
    if not (s.weekly_hours ? extract(dow from _date)::int::text) then return; end if;
    if _date::timestamp < _now + make_interval(hours => s.lead_time_hours) - interval '1 day' then return; end if;
    select coalesce(sum(case when s.capacity_unit = 'guests' then coalesce(b.guests, 1) else 1 end), 0) into _used
      from public.bookings b where b.service_id = s.id and b.status not in ('cancelled')
        and b.tour_date <= _date and coalesce(b.end_date, b.tour_date + 1) > _date;
    start_time := null; remaining := greatest(0, s.capacity - _used); return next; return;
  end if;
  for _win in select * from jsonb_array_elements(coalesce(s.weekly_hours -> extract(dow from _date)::int::text, '[]'::jsonb)) loop
    _t := (_win ->> 0)::time; _end := (_win ->> 1)::time;
    while _t + make_interval(mins => s.duration_minutes) <= _end and _t + make_interval(mins => s.duration_minutes) > _t loop
      if (_date + _t) >= _now + make_interval(hours => s.lead_time_hours) then
        select coalesce(sum(case when s.capacity_unit = 'guests' then coalesce(b.guests, 1) else 1 end), 0) into _used
          from public.bookings b where b.service_id = s.id and b.status not in ('cancelled') and b.tour_date = _date and b.start_time is not null
            and b.start_time < _t + make_interval(mins => s.duration_minutes)
            and b.start_time + make_interval(mins => coalesce(b.duration_minutes, s.duration_minutes)) > _t;
        start_time := _t; remaining := greatest(0, s.capacity - _used); return next;
      end if;
      _t := _t + make_interval(mins => s.slot_interval_minutes);
    end loop;
  end loop;
end $$;
revoke all on function public.service_availability(uuid, date) from public, anon;
grant execute on function public.service_availability(uuid, date) to authenticated, service_role;

-- Public page data (only what a customer should see). Server functions call this with the service role.
create or replace function public.public_booking_page(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w record;
begin
  select id, name, timezone, booking_page_intro into w from public.workspaces
    where public_slug = lower(_slug) and booking_page_enabled and suspended_at is null;
  if not found then return null; end if;
  return jsonb_build_object('name', w.name, 'timezone', w.timezone, 'intro', w.booking_page_intro,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'mode', booking_mode,
        'duration_minutes', duration_minutes, 'price_cents', price_cents, 'currency', currency, 'price_per', price_per,
        'min_guests', min_guests, 'max_guests', max_guests, 'advance_days', advance_days) order by sort, name)
      from public.services where workspace_id = w.id and active and public), '[]'::jsonb));
end $$;
revoke all on function public.public_booking_page(text) from public, anon, authenticated;
grant execute on function public.public_booking_page(text) to service_role;

-- Creates a booking from the public page. Re-checks capacity under a per-service/date lock.
create or replace function public.public_create_booking(_slug text, _service uuid, _date date, _time time, _guests int,
  _name text, _email text, _phone text, _note text, _nights int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; s public.services; _left int; _contact uuid; _ref text; _b uuid; _need int; _email_n text := nullif(lower(btrim(coalesce(_email, ''))), '');
  _phone_n text := nullif(left(btrim(coalesce(_phone, '')), 40), ''); _d date; _status public.booking_status; _amount numeric;
begin
  select id, name, booking_auto_confirm into w from public.workspaces where public_slug = lower(_slug) and booking_page_enabled and suspended_at is null;
  if not found then raise exception 'This booking page is not available.'; end if;
  select * into s from public.services where id = _service and workspace_id = w.id and active and public;
  if not found then raise exception 'This service is not available.'; end if;
  if char_length(btrim(coalesce(_name, ''))) < 2 then raise exception 'Please enter your name.'; end if;
  if _email_n is null and _phone_n is null then raise exception 'Please enter an email or phone number.'; end if;
  if _email_n is not null and _email_n !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email.'; end if;
  if _guests < s.min_guests or _guests > s.max_guests then raise exception 'Choose between % and % guests.', s.min_guests, s.max_guests; end if;
  if s.booking_mode = 'day' and (_nights < 1 or _nights > 30) then raise exception 'Choose 1–30 nights.'; end if;
  perform pg_advisory_xact_lock(hashtext(s.id::text || _date::text));
  _need := case when s.capacity_unit = 'guests' then _guests else 1 end;
  if s.booking_mode = 'slot' then
    select remaining into _left from public.service_availability(s.id, _date) where start_time = _time;
    if _left is null then raise exception 'That time is not available. Please pick another.'; end if;
    if _left < _need then raise exception 'Only % place(s) left at that time.', _left; end if;
  else
    for _d in select generate_series(_date, _date + (_nights - 1), interval '1 day')::date loop
      select remaining into _left from public.service_availability(s.id, _d);
      if _left is null or _left < _need then raise exception 'Not available on %. Please choose other dates.', _d; end if;
    end loop;
  end if;
  select id into _contact from public.contacts where workspace_id = w.id and merged_into is null
    and ((_email_n is not null and lower(email) = _email_n) or (_phone_n is not null and public.norm_phone(phone) = public.norm_phone(_phone_n))) limit 1;
  if _contact is null then
    insert into public.contacts(workspace_id, full_name, email, phone, created_by) values (w.id, left(btrim(_name), 200), _email_n, _phone_n, null) returning id into _contact;
  end if;
  _status := case when w.booking_auto_confirm then 'confirmed' else 'tentative' end;
  _amount := case when s.price_cents is null then null else (s.price_cents / 100.0) * (case when s.price_per = 'person' then _guests else 1 end) * (case when s.booking_mode = 'day' then _nights else 1 end) end;
  insert into public.bookings(workspace_id, contact_id, service_id, tour_name, tour_date, end_date, start_time, duration_minutes, guests, status, amount, currency, notes, source_system, created_by)
  values (w.id, _contact, s.id, s.name, _date, case when s.booking_mode = 'day' then _date + _nights else null end,
          case when s.booking_mode = 'slot' then _time else null end, case when s.booking_mode = 'slot' then s.duration_minutes else null end,
          _guests, _status, _amount, s.currency, nullif(left(btrim(coalesce(_note, '')), 2000), ''), 'booking_page', null)
  returning id, reference into _b, _ref;
  insert into public.notifications(workspace_id, user_id, kind, title, body, link)
    select w.id, m.user_id, 'booking', 'New online booking', left(btrim(_name), 80) || ' · ' || s.name || ' · ' || _date || coalesce(' ' || to_char(_time, 'HH24:MI'), ''), '/bookings?b=' || _b
    from public.workspace_members m where m.workspace_id = w.id and m.active and m.role in ('admin','manager');
  return jsonb_build_object('reference', _ref, 'status', _status, 'amount', _amount, 'currency', s.currency);
end $$;
revoke all on function public.public_create_booking(text, uuid, date, time, int, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.public_create_booking(text, uuid, date, time, int, text, text, text, text, int) to service_role;
