ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS account_id text, ADD COLUMN IF NOT EXISTS account_label text;
UPDATE public.channel_connections SET account_id = coalesce(config->>'phone_number_id', config->>'page_id', config->>'account_id', config->>'address') WHERE account_id IS NULL;
ALTER TABLE public.channel_connections DROP CONSTRAINT IF EXISTS channel_connections_workspace_id_channel_key;
CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_ws_channel_account_uq ON public.channel_connections(workspace_id, channel, account_id) WHERE account_id IS NOT NULL;
ALTER TABLE public.channel_connections ADD CONSTRAINT channel_connections_label_len CHECK (account_label IS NULL OR char_length(account_label) <= 60);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.channel_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_connection_idx ON public.conversations(workspace_id, connection_id);
UPDATE public.conversations c SET connection_id = cc.id FROM public.channel_connections cc
  WHERE c.connection_id IS NULL AND cc.workspace_id = c.workspace_id AND cc.channel = c.channel AND cc.status = 'connected' AND c.channel <> 'manual';