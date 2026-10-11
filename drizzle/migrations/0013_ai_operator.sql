CREATE TABLE public.ai_operator_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  away_mode boolean NOT NULL DEFAULT false,
  allow_reply boolean NOT NULL DEFAULT true,
  allow_booking boolean NOT NULL DEFAULT true,
  allow_assign boolean NOT NULL DEFAULT true,
  allow_alert boolean NOT NULL DEFAULT true,
  default_assignee uuid,
  max_replies integer NOT NULL DEFAULT 6 CHECK (max_replies BETWEEN 1 AND 20),
  notes text NOT NULL DEFAULT '',
  paused_reason text,
  lock_until timestamptz,
  last_run_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_operator_settings TO authenticated;
GRANT ALL ON public.ai_operator_settings TO service_role;
ALTER TABLE public.ai_operator_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read operator settings" ON public.ai_operator_settings FOR SELECT TO authenticated USING (public.is_member(workspace_id));
CREATE POLICY "Admins and managers create operator settings" ON public.ai_operator_settings FOR INSERT TO authenticated WITH CHECK (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
CREATE POLICY "Admins and managers update operator settings" ON public.ai_operator_settings FOR UPDATE TO authenticated USING (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[])) WITH CHECK (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
CREATE TRIGGER t_upd BEFORE UPDATE ON public.ai_operator_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_operator_marks (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  last_inbound_id uuid,
  replies integer NOT NULL DEFAULT 0,
  handed_off boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_operator_marks TO service_role;
ALTER TABLE public.ai_operator_marks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_operator_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_operator_log_ws_idx ON public.ai_operator_log (workspace_id, created_at DESC);
GRANT SELECT ON public.ai_operator_log TO authenticated;
GRANT ALL ON public.ai_operator_log TO service_role;
ALTER TABLE public.ai_operator_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read operator log" ON public.ai_operator_log FOR SELECT TO authenticated USING (public.is_member(workspace_id));