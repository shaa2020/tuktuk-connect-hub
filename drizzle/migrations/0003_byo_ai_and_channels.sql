ALTER TABLE public.ai_settings
  ADD COLUMN provider text NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable','openai','anthropic','gemini','openrouter','custom')),
  ADD COLUMN model text CHECK (model IS NULL OR char_length(model) <= 120),
  ADD COLUMN base_url text CHECK (base_url IS NULL OR (base_url ~ '^https://' AND char_length(base_url) <= 300));

ALTER TABLE public.channel_connections
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Encrypted credentials. No policies: browsers can never read or write; only server code after role checks.
CREATE TABLE public.workspace_secrets (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (char_length(kind) <= 60),
  ciphertext text NOT NULL,
  hint text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, kind)
);
GRANT ALL ON public.workspace_secrets TO service_role;
REVOKE ALL ON public.workspace_secrets FROM anon, authenticated;
ALTER TABLE public.workspace_secrets ENABLE ROW LEVEL SECURITY;