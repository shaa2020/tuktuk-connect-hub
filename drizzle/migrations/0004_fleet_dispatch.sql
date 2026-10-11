create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  plate text,
  seats integer not null default 6,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
alter table public.vehicles enable row level security;
create policy "veh read" on public.vehicles for select to authenticated using (public.is_member(workspace_id));
create policy "veh insert" on public.vehicles for insert to authenticated with check (public.has_ws_role(workspace_id, array['admin','manager']::app_role[]));
create policy "veh update" on public.vehicles for update to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::app_role[]));
create policy "veh delete" on public.vehicles for delete to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::app_role[]));

alter table public.bookings
  add column vehicle_id uuid references public.vehicles(id) on delete set null,
  add column driver_id uuid references public.profiles(id) on delete set null,
  add column dispatch_status text not null default 'scheduled'
    check (dispatch_status in ('scheduled','dispatched','on_tour','done'));