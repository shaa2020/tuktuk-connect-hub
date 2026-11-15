# SaaS Roadmap

Ordered by dependency and risk. Each item lists its exit criteria; an item is "done" only when
those are met **and** tests exist (see `docs/TESTING_STRATEGY.md`). External blockers are in
`docs/BLOCKERS.md`. Supersedes `roadmap.md` (kept for history).

## Phase 0 — Discovery ✅ (this branch)
Architecture, inventory, security audit, integration matrix, test strategy, deployment guide,
known limitations, tracking docs.

## Phase 1 — Security & foundations
| # | Item | State |
|---|---|---|
| 1.1 | Operator-integration isolation (F-01) | ✅ done |
| 1.2 | Lock privileged workspace columns (F-02) | ✅ done |
| 1.3 | Cross-workspace reference guard (F-04) | ✅ done |
| 1.4 | Suspension (F-03) | ✅ done |
| 1.5 | Schema drift + portable job URL (F-05/F-06) | ✅ done |
| 1.6 | DB policy test harness | ✅ done (42 tests) |
| 1.7 | SSRF guard for custom AI base URL (F-09) | ✅ done |
| 1.8 | Rate limiting on public endpoints (F-10) | ✅ DB limiter done; Cloudflare edge rules recommended at deploy |
| 1.9 | CI pipeline: typecheck, unit, db tests, build, `npm audit` | 🟡 workflow written (`.github/workflows/ci.yml`), not yet run on GitHub; secret scanning to add |
| 1.10 | Fix ~4,900 pre-existing Prettier lint errors (mechanical `eslint --fix` in its own PR) | next |
| 1.11 | MFA recovery codes (F-13) | P2 |
| 1.12 | Secrets v2 with AAD + key id, rotation script (F-11) | P2 |

## Phase 2 — SaaS foundations
| # | Item | State |
|---|---|---|
| 2.1 | Plans, entitlements, metering (DB) | ✅ done |
| 2.2 | `create_workspace`, onboarding page, setup checklist | ✅ built (UI not live-tested) |
| 2.3 | Multi-workspace switching | ✅ built (UI not live-tested) |
| 2.4 | Public signup | ⛔ built behind flag; owner must enable Supabase signups |
| 2.5 | Invite emails via a transactional email provider | ⛔ needs sending domain |
| 2.6 | Owner transfer, leave workspace, delete workspace (with export + 30-day grace) | next |
| 2.7 | White-labelling: replace hard-coded TukTuk24 copy with workspace name/branding | next |
| 2.8 | Industry modules: make tour/dispatch/tickets optional per workspace (`workspaces.industry`) | next |
| 2.9 | Background job fan-out (one queued job per workspace, `background_jobs` table + lease) | next — required before ~20 active tenants |

## Phase 3 — Billing
Recommendation: **Stripe Billing** as the initial provider (see comparison below), PayPal kept
for TukTuk24's own customer payments. Build: checkout session server function, signed webhook
(`/api/public/webhooks/stripe`) writing `billing_events` (dedupe by event id) →
`workspace_subscriptions` → `workspaces.plan`; customer portal; grace period (`grace_until`, 7
days) then read-only mode; dunning emails from Stripe.

| | Stripe Billing | PayPal Subscriptions |
|---|---|---|
| Availability (Portugal/EU) | Yes | Yes |
| Card + SEPA + wallets, SCA/3DS | Native | Card via PayPal; SEPA limited |
| Invoices, VAT handling | Invoices built-in; Stripe Tax add-on | Basic |
| Customer self-service portal | Built-in | Limited |
| Proration, trials, annual plans, usage billing | Native | Trials/annual yes; proration/usage weak |
| Fees (verify current prices before deciding) | card fee + Billing fee (%, of recurring volume) | PayPal transaction fee, no extra subscription fee |
| Webhook signing | HMAC (`Stripe-Signature`) | Verify via API call |
**Owner decision required** (B-BIZ-2) — needs your Stripe account.

## Phase 4 — Multi-channel inbox
Gmail OAuth for tenants (Google verification), Outlook (Microsoft Graph, OAuth + webhooks),
Telegram (Bot API, per-workspace bot token, webhook secret header), website live chat widget
(public token per workspace, rate-limited), attachments via Supabase Storage (private bucket,
signed URLs, size/type limits, malware-scan hook), platform Meta app (single webhook, App Review).

## Phase 5 — Social media
Publishing worker (claims due `social_posts` with lease → platform API → status/retry), media
library (Storage), approval workflow, comments inbox, insights sync. Meta first (Pages + Instagram
Graph API: feed, carousel, reels; stories limited), then LinkedIn, TikTok (Content Posting API,
audit required), YouTube (uploads, quota).

## Phase 6 — AI operator
Token/cost metering per call, intent/sentiment classification, auto-tagging, document knowledge
(file upload + embeddings with pgvector), approval queue for outbound AI replies per workspace
setting, escalation rules, working hours.

## Phase 7 — CRM & operations
Custom fields (JSONB + definitions), segments, CSV import/export, duplicate detection, generic
resources/services booking model, deposits via the tenant's payment provider, staff shifts and
time-off, visual automation builder with durable executions (`automation_runs` + queue, retries,
idempotency keys).

## Phase 8 — Platform administration
Revenue overview (from billing), job/queue health, error log view, AI usage/cost by tenant,
time-limited audited support access (tenant admin grants, expiry, read-only by default).

## Phase 9 — Production readiness
E2E browser suite against a staging Supabase project, load test of webhook ingestion, backup
restore drill, monitoring/alerting, launch checklist.

## Plan enforcement policy (decided)
* Hard limits: members (invites), connected channel accounts, monthly bookings, scheduled posts,
  platform-paid AI requests.
* Soft limits: monthly conversations (never drop customer messages; show overage).
* Downgrade never deletes data; over-limit resources stay readable, new ones are blocked.
* Expired/failed payment: 7-day grace, then read-only (planned with Phase 3).
