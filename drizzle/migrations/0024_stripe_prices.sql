-- 0024 Stripe price ids per plan (set by the platform owner once prices exist in Stripe). Idempotent.
alter table public.plans add column if not exists stripe_price_monthly text check (stripe_price_monthly is null or stripe_price_monthly ~ '^price_[A-Za-z0-9]+$');
alter table public.plans add column if not exists stripe_price_annual text check (stripe_price_annual is null or stripe_price_annual ~ '^price_[A-Za-z0-9]+$');
create unique index if not exists workspace_subscriptions_provider_sub_uq on public.workspace_subscriptions(provider, provider_subscription_id) where provider_subscription_id is not null;
