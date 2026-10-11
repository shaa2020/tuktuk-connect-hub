create table public.website_booking_ignores (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_reference text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, external_reference)
);
grant select on public.website_booking_ignores to authenticated;
grant all on public.website_booking_ignores to service_role;
alter table public.website_booking_ignores enable row level security;
create policy "members read ignores" on public.website_booking_ignores for select to authenticated using (public.is_member(workspace_id));

create or replace function public.remember_deleted_website_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.source_system = 'website' and old.external_reference is not null then
    insert into public.website_booking_ignores(workspace_id, external_reference)
    values (old.workspace_id, old.external_reference) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger trg_remember_deleted_website_booking after delete on public.bookings
for each row execute function public.remember_deleted_website_booking();