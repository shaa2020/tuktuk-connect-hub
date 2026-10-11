create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  attempts int not null default 0
);
alter table public.whatsapp_webhook_events enable row level security;
grant all on public.whatsapp_webhook_events to service_role;
create index whatsapp_webhook_events_pending on public.whatsapp_webhook_events (received_at) where processed_at is null;
update public.channel_connections
  set status='connected', account_id='1153006517887308', account_label=coalesce(account_label,'Main WhatsApp'),
      display_name='+351 922 024 690', config='{"mode":"connector","phone_number_id":"1153006517887308"}'::jsonb
  where id='5349e93f-f9f6-4603-806f-ef89e52eb302';