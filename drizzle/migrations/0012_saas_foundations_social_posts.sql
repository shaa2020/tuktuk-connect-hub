-- Per-workspace plan fields (SaaS foundations)
ALTER TABLE public.workspaces ADD COLUMN plan text NOT NULL DEFAULT 'internal';
ALTER TABLE public.workspaces ADD COLUMN plan_limits jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.workspaces.plan IS 'Subscription plan key: internal (owner workspace, unlimited), free, pro, business';

-- Scheduled social media posts (publishing activates once Meta/TikTok approve the app)
CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  media_urls text[] NOT NULL DEFAULT '{}',
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read posts" ON public.social_posts FOR SELECT TO authenticated USING (public.is_member(workspace_id));
CREATE POLICY "Members create posts" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (public.is_member(workspace_id));
CREATE POLICY "Members update posts" ON public.social_posts FOR UPDATE TO authenticated USING (public.is_member(workspace_id));
CREATE POLICY "Admins and managers delete posts" ON public.social_posts FOR DELETE TO authenticated USING (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
CREATE TRIGGER t_upd BEFORE UPDATE ON public.social_posts EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON public.social_posts EXECUTE FUNCTION audit_row();