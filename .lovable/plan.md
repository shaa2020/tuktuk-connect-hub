# SaaS Roadmap: From Internal Tool to Multi-Business Platform

## What "SaaS" means here

Today the app serves one business (Tuk Tuk 24 Lisbon). To sell it to other tour operators, it needs: multiple independent businesses on one system, self-serve signup, billing, and a polished first-run experience.

## Phase 1 — Multi-business foundations (required first)

- **Self-serve signup with workspace creation** — today only the first user bootstraps a workspace and everyone else is invite-only. Add a "Start your business" flow: sign up, name the company, become its admin. Keep the current invite-only mode as an option per workspace.
- **Per-workspace plan & limits** — plans table (e.g. Free / Pro / Business): max team members, connected channels, AI usage, message volume. Enforced server-side.
- **Billing via PayPal** (you already use PayPal) — PayPal Subscriptions API: plan checkout, upgrades/downgrades, cancel. A signed PayPal webhook updates the workspace's plan automatically. Note: Lovable's built-in one-click payments are Stripe/Paddle only, so PayPal is a custom integration using your own PayPal Business account credentials (stored encrypted, never exposed). PayPal also covers guest booking deposits.
- **Workspace switcher** — users belonging to several businesses can switch between them.
- **Onboarding wizard** — after signup: connect first channel, invite team, load sample data, done checklist.

## Phase 2 — New features that make it sellable

- **Public booking page per business** — guests book tours directly (date, guests, tour, pay deposit); lands in the calendar and inbox automatically. Biggest value-add for tour operators.
- **Online payments for bookings** — PayPal checkout / deposit links on bookings; payment status tracked on the booking via PayPal webhooks.
- **Review requests** — automatic WhatsApp/email after a completed tour asking for a Google/TripAdvisor review.
- **Customer-facing live chat widget** — embeddable on the business's own website; chats arrive in the shared inbox.
- **Canned replies / quick replies library** — shared per workspace, insertable in the composer.
- **SLA & business-hours rules** — auto-reply outside hours, escalation when a conversation waits too long.
- **Reports export (PDF/CSV)** — owner-ready monthly summaries: response times, bookings, revenue, channel mix.

## Phase 3 — Platform polish

- **Platform admin console** (for you as the SaaS owner) — list all businesses, plans, usage, health; impersonate for support; platform_admins table already exists.
- **White-label options** — each business picks its name, logo, brand color for their booking page and widget.
- **Usage-based AI metering** — per-workspace AI credit limits, overage warnings.
- **Status & health page** — channel connection health visible to each business's admins.
- **Landing page + marketing site** — public page explaining the product, pricing, signup (separate from the internal app, which stays invite-only for your team).

## Suggested order

1. Phase 1 (signup, plans, billing) — nothing else works as a product without it.
2. Public booking page + payments — the feature tour operators will pay for.
3. Review requests + chat widget — retention and daily-value features.
4. Platform admin console — needed once real customers exist.

## Technical notes

- The data model is already workspace-scoped with RLS everywhere, so multi-tenancy is mostly additive: signup flow, plans table, billing webhook, and per-plan limit checks.
- Billing via PayPal Subscriptions (your existing PayPal Business account); subscription state stored on the workspace, updated by a verified PayPal webhook under /api/public/. Requires your PayPal app's Client ID and Secret, stored as encrypted server secrets.
- Your own Tuk Tuk 24 Lisbon workspace stays untouched and gets an unlimited internal plan.
- No changes to existing channels, inbox, or security model (MFA, invite-only team access, encrypted secrets all stay).

## Open questions for you

- Pricing: how much per month, and what should the free tier include?
- Do you want a free trial (e.g. 14 days) or a free forever plan?
- Should your own Tuk Tuk 24 team keep using the same app, or a separate internal copy?
