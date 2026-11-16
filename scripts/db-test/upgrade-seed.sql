-- Production-like data created on the OLD schema (migrations 0000–0018) before upgrading.
-- Mirrors the operator workspace: first user bootstraps "Tuk Tuk 24 Lisbon", connector WhatsApp,
-- website bookings, conversations, messages, an AI operator setting and an extra member.
-- Columns created outside migrations in production (ticket_token etc.) are added first, as prod has them.
alter table public.bookings add column if not exists ticket_token uuid not null default gen_random_uuid();
alter table public.bookings add column if not exists ticket_sent_at timestamptz;
alter table public.workspace_members add column if not exists whatsapp_phone text, add column if not exists schedule_sent_on date;
alter table public.workspaces add column if not exists driver_auto boolean not null default false, add column if not exists ticket_auto text not null default 'off';
insert into cron.job(jobname, schedule, command) values ('tt24-background-sync', '*/5 * * * *', 'select 1');
insert into auth.users(id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1', 'owner@tuktuk.test', now());
insert into auth.users(id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a2', 'driver@tuktuk.test', now());
do $$ declare ws uuid; c uuid; cv uuid; cc uuid; begin
  select id into ws from public.workspaces limit 1;
  insert into public.workspace_members(workspace_id, user_id, role, whatsapp_phone) values (ws, '00000000-0000-0000-0000-0000000000a2', 'agent', '+351900000000');
  update public.workspaces set plan = 'pro' where id = ws;
  insert into public.channel_connections(workspace_id, channel, status, account_id, config) values (ws, 'whatsapp', 'connected', '1153006517887308', '{"mode":"connector"}') returning id into cc;
  insert into public.contacts(workspace_id, full_name, phone) values (ws, 'Guest One', '+351911111111') returning id into c;
  insert into public.conversations(workspace_id, contact_id, channel, connection_id) values (ws, c, 'whatsapp', cc) returning id into cv;
  insert into public.messages(workspace_id, conversation_id, direction, body, status, external_id) values (ws, cv, 'inbound', 'Hello', 'delivered', 'wamid.1');
  insert into public.bookings(workspace_id, contact_id, tour_name, status, source_system, external_reference, driver_id) values (ws, c, 'Website tour', 'confirmed', 'website', 'ABC12345', '00000000-0000-0000-0000-0000000000a2');
  insert into public.social_posts(workspace_id, title, status) values (ws, 'Old post', 'published');
  insert into public.ai_operator_settings(workspace_id, away_mode) values (ws, true);
end $$;
