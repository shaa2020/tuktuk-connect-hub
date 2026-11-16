# SaaS Administrator Manual (platform owner)

You are a **platform administrator** if your user id is in the `platform_admins` table. This is
separate from being a Business Admin inside a workspace. Add another platform admin only with SQL
run by you on the database: `insert into platform_admins(user_id) values ('<user uuid>');`

## The Platform console (`/platform`)
* **Revenue** — estimated monthly recurring revenue from active subscriptions × plan list prices.
  Stripe's dashboard is the source of truth for money actually received.
* **System health** — backlog counters (unprocessed WhatsApp events, overdue automations, unprocessed
  billing events, pending deletions) and businesses with broken channels, failed automations/posts or
  a paused AI Operator. Counts and provider error text only — never customer messages.
* **Businesses list** — search by name or owner email; change plan (audited); suspend with a reason
  (members are locked out at the database level, data kept, customer messages still received) and
  reactivate (audited).
* **Support view** — works only while the business has granted access (Settings → Support access,
  1–72 h). Read-only snapshot: channel status, team list, recent conversation metadata, recent
  failures. Every open is written to that business's audit log.

## Plans and limits
Plans live in the `plans` table (prices NULL until you set them). Per-business exceptions go in
`workspaces.plan_limits` (e.g. `{"members": 25}`) — set via SQL by a platform admin. Hard limits:
members/invitations, connected accounts, bookings per month, scheduled posts, platform-paid AI
requests, automation runs. Conversations are a soft limit (never dropped).

## Billing (after Stripe is set up)
Customers upgrade on **Plan & usage**; Stripe webhooks update the plan automatically. Cancelled or
unpaid subscriptions fall back to Free (no data deleted). Refunds/disputes are handled in Stripe.
The operator workspace (plan `internal`) is never changed by billing.

## Data requests
* A business can export everything (Settings → Data & privacy) and schedule deletion (30-day grace).
* Deleted workspaces are listed in `workspace_deletion_log` (name, owner email, dates).
* Per-contact export/anonymisation is on each contact page.

## Routine checks (weekly)
1. Platform console → System health is clean. 2. Supabase → Database → Backups succeeded.
3. GitHub → Actions green on main. 4. Stripe → no failed webhooks. 5. Review new businesses for abuse.

## Incident basics
* Suspected abuse: suspend the workspace with a reason; investigate via audit log (with the owner's
  support grant if you need to look inside).
* Credential leak: rotate the affected provider key; if `CREDENTIALS_ENCRYPTION_KEY` leaked, follow the
  key-rotation procedure in `DEPLOYMENT_GUIDE.md` and ask businesses to reconnect integrations.
