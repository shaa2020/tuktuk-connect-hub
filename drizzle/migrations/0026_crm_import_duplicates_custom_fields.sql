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
