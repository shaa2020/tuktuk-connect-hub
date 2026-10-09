
-- =========== EXTENSIONS ===========
create extension if not exists pg_trgm with schema extensions;

-- =========== ENUMS ===========
create type public.app_role as enum ('admin','manager','agent');
create type public.channel_type as enum ('whatsapp','instagram','messenger','email','manual');
create type public.connection_status as enum ('not_connected','pending','connected','error','disconnected');
create type public.conversation_status as enum ('open','in_progress','waiting_customer','waiting_team','resolved','archived');
create type public.priority_level as enum ('low','normal','high','urgent');
create type public.message_direction as enum ('inbound','outbound');
create type public.message_status as enum ('draft','queued','sending','sent','delivered','read','failed','unknown','logged');
create type public.lead_stage as enum ('new','contacted','qualified','quote_requested','quote_sent','awaiting_customer','won','lost');
create type public.booking_status as enum ('inquiry','quote','tentative','confirmed','cancelled','completed');
create type public.payment_status as enum ('unknown','pending','paid','partially_paid','refunded');
create type public.task_status as enum ('open','done');

-- =========== CORE ===========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  timezone text not null default 'Europe/Lisbon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  timezone text not null default 'Europe/Lisbon',
  agents_see_unassigned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'agent',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members(user_id);
grant select, update on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null default 'agent',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;

-- =========== HELPER FUNCTIONS ===========
create or replace function public.is_member(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = _ws and user_id = auth.uid() and active)
$$;

create or replace function public.has_ws_role(_ws uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = _ws and user_id = auth.uid() and active and role = any(_roles))
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.shares_workspace(_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and a.active and b.user_id = _other)
$$;

-- policies core
create policy "profiles read self or teammates" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles insert self" on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "platform admins read self" on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy "workspace read members" on public.workspaces for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy "workspace update admin" on public.workspaces for update to authenticated
  using (public.has_ws_role(id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(id, array['admin']::public.app_role[]));

create policy "members read" on public.workspace_members for select to authenticated
  using (public.is_member(workspace_id) or user_id = auth.uid());
create policy "members update admin" on public.workspace_members for update to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

create policy "invites admin read" on public.invitations for select to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));
create policy "invites admin insert" on public.invitations for insert to authenticated
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]) and invited_by = auth.uid());
create policy "invites admin update" on public.invitations for update to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

-- prevent admins demoting/deactivating themselves into a workspace with no admin
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.role = 'admin' and old.active) and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.workspace_members
      where workspace_id = old.workspace_id and role = 'admin' and active and id <> old.id) then
      raise exception 'A workspace must keep at least one active admin';
    end if;
  end if;
  if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
    raise exception 'Membership workspace and user cannot be changed';
  end if;
  return new;
end $$;
create trigger trg_guard_last_admin before update on public.workspace_members
  for each row execute function public.guard_last_admin();

-- =========== CRM ===========
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  preferred_name text check (char_length(preferred_name) <= 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 40),
  preferred_language text check (char_length(preferred_language) <= 40),
  country text check (char_length(country) <= 80),
  notes text check (char_length(notes) <= 5000),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_interaction_at timestamptz,
  anonymized_at timestamptz,
  merged_into uuid references public.contacts(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contacts(workspace_id, created_at desc);
create index contacts_name_trgm on public.contacts using gin (full_name extensions.gin_trgm_ops);
create index contacts_email_idx on public.contacts(workspace_id, lower(email));
create index contacts_phone_idx on public.contacts(workspace_id, phone);
grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;
create policy "contacts read" on public.contacts for select to authenticated using (public.is_member(workspace_id));
create policy "contacts insert" on public.contacts for insert to authenticated with check (public.is_member(workspace_id));
create policy "contacts update" on public.contacts for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "contacts delete" on public.contacts for delete to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

create table public.contact_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  purpose text not null check (purpose in ('marketing','service_messages','whatsapp','email','sms')),
  granted boolean not null,
  source text check (char_length(source) <= 200),
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index on public.contact_consents(contact_id, recorded_at desc);
grant select, insert on public.contact_consents to authenticated;
grant all on public.contact_consents to service_role;
alter table public.contact_consents enable row level security;
create policy "consents read" on public.contact_consents for select to authenticated using (public.is_member(workspace_id));
create policy "consents insert" on public.contact_consents for insert to authenticated with check (public.is_member(workspace_id));

create table public.external_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel public.channel_type not null,
  external_id text not null,
  display_name text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, channel, external_id)
);
grant select, insert, update on public.external_identities to authenticated;
grant all on public.external_identities to service_role;
alter table public.external_identities enable row level security;
create policy "ext read" on public.external_identities for select to authenticated using (public.is_member(workspace_id));
create policy "ext update" on public.external_identities for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "ext insert" on public.external_identities for insert to authenticated with check (public.is_member(workspace_id));

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);
grant select, insert, update, delete on public.tags to authenticated;
grant all on public.tags to service_role;
alter table public.tags enable row level security;
create policy "tags read" on public.tags for select to authenticated using (public.is_member(workspace_id));
create policy "tags insert" on public.tags for insert to authenticated with check (public.is_member(workspace_id));
create policy "tags update" on public.tags for update to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "tags delete" on public.tags for delete to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

create table public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (contact_id, tag_id)
);
grant select, insert, delete on public.contact_tags to authenticated;
grant all on public.contact_tags to service_role;
alter table public.contact_tags enable row level security;
create policy "ct read" on public.contact_tags for select to authenticated using (public.is_member(workspace_id));
create policy "ct insert" on public.contact_tags for insert to authenticated with check (public.is_member(workspace_id));
create policy "ct delete" on public.contact_tags for delete to authenticated using (public.is_member(workspace_id));

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  stage public.lead_stage not null default 'new',
  tour_interest text check (char_length(tour_interest) <= 200),
  group_size int check (group_size is null or group_size between 1 and 500),
  preferred_date date,
  preferred_language text check (char_length(preferred_language) <= 40),
  budget numeric(12,2) check (budget is null or budget >= 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  duration_hours numeric(4,1) check (duration_hours is null or duration_hours > 0),
  notes text check (char_length(notes) <= 5000),
  source text check (char_length(source) <= 60),
  owner_id uuid references public.profiles(id) on delete set null,
  follow_up_at timestamptz,
  lost_reason text check (char_length(lost_reason) <= 500),
  is_demo boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_needs_reason check (stage <> 'lost' or lost_reason is not null)
);
create index on public.leads(workspace_id, stage);
create index on public.leads(workspace_id, follow_up_at);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "leads read" on public.leads for select to authenticated using (public.is_member(workspace_id));
create policy "leads insert" on public.leads for insert to authenticated with check (public.is_member(workspace_id));
create policy "leads update" on public.leads for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "leads delete" on public.leads for delete to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('note','stage_change','created','owner_change')),
  body text check (char_length(body) <= 5000),
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.lead_activities(lead_id, created_at desc);
grant select, insert on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;
alter table public.lead_activities enable row level security;
create policy "la read" on public.lead_activities for select to authenticated using (public.is_member(workspace_id));
create policy "la insert" on public.lead_activities for insert to authenticated with check (public.is_member(workspace_id));

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  tour_name text not null check (char_length(tour_name) between 1 and 200),
  tour_date date,
  start_time time,
  duration_minutes int check (duration_minutes is null or duration_minutes between 15 and 1440),
  guests int check (guests is null or guests between 1 and 500),
  language text check (char_length(language) <= 40),
  pickup_location text check (char_length(pickup_location) <= 300),
  status public.booking_status not null default 'inquiry',
  amount numeric(12,2) check (amount is null or amount >= 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  payment_status public.payment_status not null default 'unknown',
  payment_status_source text not null default 'manual' check (payment_status_source in ('manual','provider','booking_system')),
  notes text check (char_length(notes) <= 5000),
  source_system text not null default 'manual',
  external_reference text,
  is_demo boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, reference)
);
create index on public.bookings(workspace_id, tour_date);
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
create policy "bookings read" on public.bookings for select to authenticated using (public.is_member(workspace_id));
create policy "bookings insert" on public.bookings for insert to authenticated with check (public.has_ws_role(workspace_id, array['admin','manager','agent']::public.app_role[]));
create policy "bookings update" on public.bookings for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "bookings delete" on public.bookings for delete to authenticated using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

create or replace function public.booking_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := 'TT24-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  end if;
  return new;
end $$;
create trigger trg_booking_defaults before insert on public.bookings for each row execute function public.booking_defaults();

-- =========== INBOX ===========
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel public.channel_type not null,
  status public.connection_status not null default 'not_connected',
  display_name text,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, channel)
);
grant select on public.channel_connections to authenticated;
grant all on public.channel_connections to service_role;
alter table public.channel_connections enable row level security;
create policy "cc read" on public.channel_connections for select to authenticated using (public.is_member(workspace_id));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel public.channel_type not null default 'manual',
  subject text check (char_length(subject) <= 200),
  status public.conversation_status not null default 'open',
  priority public.priority_level not null default 'normal',
  assigned_to uuid references public.profiles(id) on delete set null,
  unread boolean not null default true,
  awaiting_reply boolean not null default false,
  escalated boolean not null default false,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  first_response_at timestamptz,
  first_inbound_at timestamptz,
  resolved_at timestamptz,
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conv_inbox_idx on public.conversations(workspace_id, last_message_at desc);
create index on public.conversations(workspace_id, assigned_to);
create index on public.conversations(workspace_id, status);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

create or replace function public.can_view_conversation(_ws uuid, _assigned uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _ws and m.user_id = auth.uid() and m.active
      and (m.role in ('admin','manager') or _assigned = auth.uid()
           or (_assigned is null and w.agents_see_unassigned)))
$$;

create or replace function public.can_view_conversation_id(_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversations c where c.id = _conv
    and public.can_view_conversation(c.workspace_id, c.assigned_to))
$$;

create policy "conv read" on public.conversations for select to authenticated
  using (public.can_view_conversation(workspace_id, assigned_to));
create policy "conv insert" on public.conversations for insert to authenticated
  with check (public.is_member(workspace_id));
create policy "conv update" on public.conversations for update to authenticated
  using (public.can_view_conversation(workspace_id, assigned_to))
  with check (public.is_member(workspace_id));
create policy "conv delete" on public.conversations for delete to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

create table public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_user uuid, to_user uuid,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select on public.conversation_assignments to authenticated;
grant all on public.conversation_assignments to service_role;
alter table public.conversation_assignments enable row level security;
create policy "ca read" on public.conversation_assignments for select to authenticated using (public.can_view_conversation_id(conversation_id));

create table public.conversation_tags (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (conversation_id, tag_id)
);
grant select, insert, delete on public.conversation_tags to authenticated;
grant all on public.conversation_tags to service_role;
alter table public.conversation_tags enable row level security;
create policy "cvt read" on public.conversation_tags for select to authenticated using (public.can_view_conversation_id(conversation_id));
create policy "cvt insert" on public.conversation_tags for insert to authenticated with check (public.is_member(workspace_id) and public.can_view_conversation_id(conversation_id));
create policy "cvt delete" on public.conversation_tags for delete to authenticated using (public.can_view_conversation_id(conversation_id));

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_identity_id uuid not null references public.external_identities(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (conversation_id, external_identity_id)
);
grant select on public.conversation_participants to authenticated;
grant all on public.conversation_participants to service_role;
alter table public.conversation_participants enable row level security;
create policy "cp read" on public.conversation_participants for select to authenticated using (public.can_view_conversation_id(conversation_id));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text not null check (char_length(body) between 1 and 10000),
  status public.message_status not null default 'logged',
  author_id uuid default auth.uid(),
  external_id text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index on public.messages(conversation_id, created_at desc);
create index messages_body_trgm on public.messages using gin (body extensions.gin_trgm_ops);
grant select, insert, update on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "msg read" on public.messages for select to authenticated using (public.can_view_conversation_id(conversation_id));
-- From the app, only manually-logged entries can be created; channel sends go through server code.
create policy "msg insert logged" on public.messages for insert to authenticated
  with check (public.is_member(workspace_id) and public.can_view_conversation_id(conversation_id) and status = 'logged' and external_id is null);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null, mime_type text, size_bytes bigint,
  created_at timestamptz not null default now()
);
grant select on public.message_attachments to authenticated;
grant all on public.message_attachments to service_role;
alter table public.message_attachments enable row level security;
create policy "att read" on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.can_view_conversation_id(m.conversation_id)));

create table public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  status public.message_status not null,
  provider_event_id text,
  detail text,
  occurred_at timestamptz not null default now(),
  unique (workspace_id, provider_event_id)
);
grant select on public.message_delivery_events to authenticated;
grant all on public.message_delivery_events to service_role;
alter table public.message_delivery_events enable row level security;
create policy "mde read" on public.message_delivery_events for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.can_view_conversation_id(m.conversation_id)));

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.internal_notes(conversation_id, created_at);
grant select, insert, delete on public.internal_notes to authenticated;
grant all on public.internal_notes to service_role;
alter table public.internal_notes enable row level security;
create policy "notes read" on public.internal_notes for select to authenticated using (public.can_view_conversation_id(conversation_id));
create policy "notes insert" on public.internal_notes for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(workspace_id) and public.can_view_conversation_id(conversation_id));
create policy "notes delete own" on public.internal_notes for delete to authenticated
  using (author_id = auth.uid() or public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

create table public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.saved_replies to authenticated;
grant all on public.saved_replies to service_role;
alter table public.saved_replies enable row level security;
create policy "sr read" on public.saved_replies for select to authenticated using (public.is_member(workspace_id));
create policy "sr write" on public.saved_replies for all to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

-- =========== TASKS ===========
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  priority public.priority_level not null default 'normal',
  status public.task_status not null default 'open',
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks(workspace_id, status, due_at);
create index on public.tasks(assigned_to, status);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "tasks read" on public.tasks for select to authenticated using (public.is_member(workspace_id));
create policy "tasks insert" on public.tasks for insert to authenticated with check (public.is_member(workspace_id));
create policy "tasks update" on public.tasks for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (created_by = auth.uid() or public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

create or replace function public.task_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status = 'open' then new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_task_completion before insert or update on public.tasks for each row execute function public.task_completion();

-- =========== SYSTEM ===========
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notif own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(workspace_id, created_at desc);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "audit read" on public.audit_logs for select to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "audit insert export" on public.audit_logs for insert to authenticated
  with check (public.is_member(workspace_id) and actor_id = auth.uid() and action = 'export');

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null, event_id text not null,
  payload jsonb, processed_at timestamptz, error text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel public.channel_type, level text not null default 'info', message text not null,
  created_at timestamptz not null default now()
);
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null, payload jsonb, status text not null default 'pending',
  attempts int not null default 0, run_at timestamptz not null default now(), last_error text,
  created_at timestamptz not null default now()
);
create table public.ai_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  instructions text, enabled boolean not null default false, updated_at timestamptz not null default now()
);
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, content text, created_at timestamptz not null default now()
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  content text not null, created_at timestamptz not null default now()
);
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, trigger jsonb, actions jsonb, enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  status text not null, detail text, created_at timestamptz not null default now()
);
create table public.role_permissions (
  role public.app_role not null, permission text not null, primary key (role, permission)
);
grant select on public.integration_events, public.ai_settings, public.knowledge_documents, public.knowledge_chunks, public.automation_rules, public.automation_runs, public.role_permissions to authenticated;
grant all on public.webhook_events, public.integration_events, public.background_jobs, public.ai_settings, public.knowledge_documents, public.knowledge_chunks, public.automation_rules, public.automation_runs, public.role_permissions to service_role;
alter table public.webhook_events enable row level security;
alter table public.background_jobs enable row level security;
alter table public.integration_events enable row level security;
alter table public.ai_settings enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.role_permissions enable row level security;
create policy "ie read" on public.integration_events for select to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "ai read" on public.ai_settings for select to authenticated using (public.is_member(workspace_id));
create policy "kd read" on public.knowledge_documents for select to authenticated using (public.is_member(workspace_id));
create policy "kc read" on public.knowledge_chunks for select to authenticated using (public.is_member(workspace_id));
create policy "ar read" on public.automation_rules for select to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "arun read" on public.automation_runs for select to authenticated using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "rp read" on public.role_permissions for select to authenticated using (true);
insert into public.role_permissions(role, permission) values
 ('admin','workspace.manage'),('admin','team.manage'),('admin','integrations.manage'),('admin','audit.read'),('admin','conversations.all'),
 ('manager','conversations.all'),('manager','conversations.assign'),('manager','audit.read'),('manager','reports.read'),
 ('agent','conversations.assigned'),('agent','conversations.reply');

-- =========== TRIGGERS: timestamps, audit, inbox ===========
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger t_upd before update on public.contacts for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.leads for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.bookings for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.conversations for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.tasks for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _row jsonb; _old jsonb; _diff jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'DELETE' then _row := to_jsonb(old); else _row := to_jsonb(new); end if;
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
create trigger t_audit after insert or update or delete on public.leads for each row execute function public.audit_row();
create trigger t_audit after insert or update or delete on public.bookings for each row execute function public.audit_row();
create trigger t_audit after delete on public.contacts for each row execute function public.audit_row();
create trigger t_audit after insert or update on public.workspace_members for each row execute function public.audit_row();
create trigger t_audit after update on public.workspaces for each row execute function public.audit_row();
create trigger t_audit after insert or update on public.invitations for each row execute function public.audit_row();

create or replace function public.conversation_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare _role public.app_role;
begin
  if new.workspace_id <> old.workspace_id then raise exception 'Workspace cannot be changed'; end if;
  select role into _role from public.workspace_members where workspace_id = new.workspace_id and user_id = auth.uid() and active;
  if new.assigned_to is distinct from old.assigned_to then
    if _role = 'agent' and new.assigned_to is not null and new.assigned_to <> auth.uid() then
      raise exception 'Agents can only assign conversations to themselves';
    end if;
    if new.assigned_to is not null and not exists (select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.assigned_to and active) then
      raise exception 'Assignee is not an active team member';
    end if;
  end if;
  if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
  if new.status not in ('resolved','archived') then new.resolved_at := null; end if;
  return new;
end $$;
create trigger trg_conv_guard before update on public.conversations for each row execute function public.conversation_guard();

create or replace function public.conversation_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.conversation_assignments(workspace_id, conversation_id, from_user, to_user, actor_id)
      values (new.workspace_id, new.id, old.assigned_to, new.assigned_to, auth.uid());
    insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
      values (new.workspace_id, auth.uid(), 'assign', 'conversations', new.id, jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      insert into public.notifications(workspace_id, user_id, kind, title, body, link)
        values (new.workspace_id, new.assigned_to, 'assignment', 'Conversation assigned to you', new.last_message_preview, '/inbox?c=' || new.id);
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, details)
      values (new.workspace_id, auth.uid(), 'status', 'conversations', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.escalated and not old.escalated then
    insert into public.notifications(workspace_id, user_id, kind, title, body, link)
      select new.workspace_id, m.user_id, 'escalation', 'Conversation escalated', new.last_message_preview, '/inbox?c=' || new.id
      from public.workspace_members m where m.workspace_id = new.workspace_id and m.active and m.role in ('admin','manager') and m.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
  end if;
  return new;
end $$;
create trigger trg_conv_after after update on public.conversations for each row execute function public.conversation_after_update();

create or replace function public.message_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations c set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 160),
    unread = case when new.direction = 'inbound' then true else c.unread end,
    awaiting_reply = (new.direction = 'inbound'),
    first_inbound_at = case when new.direction = 'inbound' then coalesce(c.first_inbound_at, new.created_at) else c.first_inbound_at end,
    first_response_at = case when new.direction = 'outbound' and c.first_inbound_at is not null then coalesce(c.first_response_at, new.created_at) else c.first_response_at end
  where c.id = new.conversation_id;
  update public.contacts set last_interaction_at = new.created_at
  where id = (select contact_id from public.conversations where id = new.conversation_id);
  return new;
end $$;
create trigger trg_msg_after after insert on public.messages for each row execute function public.message_after_insert();

-- =========== SIGNUP & INVITES ===========
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _ws uuid;
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  -- First user ever bootstraps the business workspace as admin.
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces(name) values ('Tuk Tuk 24 Lisbon') returning id into _ws;
    insert into public.workspace_members(workspace_id, user_id, role) values (_ws, new.id, 'admin');
    insert into public.channel_connections(workspace_id, channel, status)
      select _ws, c, 'not_connected' from unnest(array['whatsapp','instagram','messenger','email']::public.channel_type[]) c;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.accept_invitation(_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _inv public.invitations; _email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select email into _email from auth.users where id = auth.uid();
  select * into _inv from public.invitations where token = _token;
  if _inv.id is null then raise exception 'Invitation not found'; end if;
  if _inv.revoked_at is not null then raise exception 'Invitation was revoked'; end if;
  if _inv.accepted_at is not null then raise exception 'Invitation already used'; end if;
  if _inv.expires_at < now() then raise exception 'Invitation expired'; end if;
  if lower(_inv.email) <> lower(_email) then raise exception 'This invitation was sent to a different email address'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, active)
    values (_inv.workspace_id, auth.uid(), _inv.role, true)
    on conflict (workspace_id, user_id) do update set role = excluded.role, active = true;
  update public.invitations set accepted_at = now() where id = _inv.id;
  return _inv.workspace_id;
end $$;
revoke execute on function public.accept_invitation(uuid) from anon, public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- =========== DASHBOARD ===========
create or replace function public.dashboard_stats(_ws uuid, _from timestamptz, _to timestamptz, _channel public.channel_type default null, _assignee uuid default null, _status public.conversation_status default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _r jsonb;
begin
  with conv as (
    select * from public.conversations
    where workspace_id = _ws and created_at >= _from and created_at < _to
      and (_channel is null or channel = _channel)
      and (_assignee is null or assigned_to = _assignee)
      and (_status is null or status = _status)
  )
  select jsonb_build_object(
    'total', (select count(*) from conv),
    'open', (select count(*) from conv where status not in ('resolved','archived')),
    'unread', (select count(*) from conv where unread),
    'awaiting', (select count(*) from conv where awaiting_reply and status not in ('resolved','archived')),
    'failed', (select count(*) from public.messages m join conv on conv.id = m.conversation_id where m.status = 'failed'),
    'frt_samples', (select count(*) from conv where first_response_at is not null and first_inbound_at is not null),
    'avg_frt_minutes', (select round(avg(extract(epoch from first_response_at - first_inbound_at))/60) from conv where first_response_at is not null and first_inbound_at is not null),
    'res_samples', (select count(*) from conv where resolved_at is not null),
    'avg_res_minutes', (select round(avg(extract(epoch from resolved_at - created_at))/60) from conv where resolved_at is not null),
    'by_channel', coalesce((select jsonb_object_agg(channel, n) from (select channel, count(*) n from conv group by channel) s), '{}'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from conv group by status) s), '{}'::jsonb),
    'workload', coalesce((select jsonb_agg(jsonb_build_object('user_id', assigned_to, 'n', n)) from (select assigned_to, count(*) n from public.conversations where workspace_id = _ws and status not in ('resolved','archived') group by assigned_to) s), '[]'::jsonb),
    'new_leads', (select count(*) from public.leads where workspace_id = _ws and created_at >= _from and created_at < _to),
    'followup_leads', (select count(*) from public.leads where workspace_id = _ws and follow_up_at <= now() and stage not in ('won','lost')),
    'upcoming_bookings', (select count(*) from public.bookings where workspace_id = _ws and tour_date >= current_date and tour_date <= current_date + 14 and status in ('tentative','confirmed')),
    'overdue_tasks', (select count(*) from public.tasks where workspace_id = _ws and status = 'open' and due_at < now())
  ) into _r;
  return _r;
end $$;
grant execute on function public.dashboard_stats(uuid, timestamptz, timestamptz, public.channel_type, uuid, public.conversation_status) to authenticated;

-- =========== DEMO DATA (admin-only, clearly flagged) ===========
create or replace function public.load_demo_data(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c1 uuid; c2 uuid; c3 uuid; l1 uuid; b1 uuid; v1 uuid; v2 uuid;
begin
  if not public.has_ws_role(_ws, array['admin']::public.app_role[]) then raise exception 'Only admins can load sample data'; end if;
  insert into contacts(workspace_id, full_name, email, phone, preferred_language, country, is_demo)
    values (_ws, '[SAMPLE] Emma Clarke', 'emma.sample@example.com', '+44 7700 900001', 'English', 'United Kingdom', true) returning id into c1;
  insert into contacts(workspace_id, full_name, email, preferred_language, country, is_demo)
    values (_ws, '[SAMPLE] Lucas Moreau', 'lucas.sample@example.com', 'French', 'France', true) returning id into c2;
  insert into contacts(workspace_id, full_name, phone, preferred_language, country, is_demo)
    values (_ws, '[SAMPLE] Ana Souza', '+55 11 90000 0003', 'Portuguese', 'Brazil', true) returning id into c3;
  insert into leads(workspace_id, contact_id, title, stage, tour_interest, group_size, preferred_date, preferred_language, duration_hours, source, follow_up_at, is_demo)
    values (_ws, c1, '[SAMPLE] Family tour — Alfama & Belém', 'quote_requested', 'Alfama & Belém', 4, current_date + 10, 'English', 3, 'manual', now() + interval '1 day', true) returning id into l1;
  insert into leads(workspace_id, contact_id, title, stage, tour_interest, group_size, preferred_language, source, is_demo)
    values (_ws, c2, '[SAMPLE] Sunset tour enquiry', 'new', 'Sunset viewpoints', 2, 'French', 'manual', true);
  insert into bookings(workspace_id, contact_id, lead_id, tour_name, tour_date, start_time, duration_minutes, guests, language, pickup_location, status, amount, is_demo, notes)
    values (_ws, c3, null, '[SAMPLE] Lisbon Highlights', current_date + 3, '10:00', 120, 2, 'Portuguese', 'Praça do Comércio', 'confirmed', 120, true, 'Sample record') returning id into b1;
  insert into conversations(workspace_id, contact_id, channel, subject, priority, lead_id, is_demo)
    values (_ws, c1, 'manual', '[SAMPLE] Phone enquiry', 'high', l1, true) returning id into v1;
  insert into messages(workspace_id, conversation_id, direction, body, status) values
    (_ws, v1, 'inbound', '[SAMPLE] Hi! Could we book a 3-hour tour for 4 people next week?', 'logged');
  insert into conversations(workspace_id, contact_id, channel, subject, booking_id, is_demo)
    values (_ws, c3, 'manual', '[SAMPLE] Pickup question', b1, true) returning id into v2;
  insert into messages(workspace_id, conversation_id, direction, body, status) values
    (_ws, v2, 'inbound', '[SAMPLE] Where exactly is the pickup point?', 'logged'),
    (_ws, v2, 'outbound', '[SAMPLE] Next to the arch at Praça do Comércio — look for our yellow tuk tuk!', 'logged');
  insert into tasks(workspace_id, title, due_at, priority, contact_id, lead_id, is_demo)
    values (_ws, '[SAMPLE] Send quote to Emma', now() + interval '1 day', 'high', c1, l1, true),
           (_ws, '[SAMPLE] Confirm driver for Ana', now() - interval '2 hours', 'normal', c3, null, true);
end $$;

create or replace function public.clear_demo_data(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_ws_role(_ws, array['admin']::public.app_role[]) then raise exception 'Only admins can remove sample data'; end if;
  delete from tasks where workspace_id = _ws and is_demo;
  delete from conversations where workspace_id = _ws and is_demo;
  delete from bookings where workspace_id = _ws and is_demo;
  delete from leads where workspace_id = _ws and is_demo;
  delete from contacts where workspace_id = _ws and is_demo;
end $$;
revoke execute on function public.load_demo_data(uuid), public.clear_demo_data(uuid) from anon, public;
grant execute on function public.load_demo_data(uuid), public.clear_demo_data(uuid) to authenticated;

-- =========== REALTIME ===========
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.internal_notes;
alter publication supabase_realtime add table public.notifications;
