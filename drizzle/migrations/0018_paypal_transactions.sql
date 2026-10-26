CREATE TABLE public.paypal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  txn_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  currency text NOT NULL,
  status text NOT NULL,
  payer_email text,
  payer_name text,
  reference_text text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  match_kind text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, txn_id)
);
CREATE INDEX ON public.paypal_transactions (workspace_id, occurred_at DESC);
GRANT SELECT ON public.paypal_transactions TO authenticated;
GRANT ALL ON public.paypal_transactions TO service_role;
ALTER TABLE public.paypal_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read paypal" ON public.paypal_transactions FOR SELECT TO authenticated
  USING (public.has_ws_role(workspace_id, ARRAY['admin','manager']::public.app_role[]));