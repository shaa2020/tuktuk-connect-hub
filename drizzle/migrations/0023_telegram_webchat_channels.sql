-- 0023 New inbox channels: Telegram (per-business bot) and website live chat. Idempotent.
alter type public.channel_type add value if not exists 'telegram';
alter type public.channel_type add value if not exists 'webchat';
