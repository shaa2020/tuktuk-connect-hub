# Deployment Guide

> Nothing in this branch has been deployed. Applying migrations 0019/0020 to production and
> publishing the app require the owner's approval (see §5 checklist).

## 1. Current production setup (as found in the code)
* **App**: built by Lovable, deployed to Cloudflare Workers (Nitro preset). Public URL used by
  background jobs: `https://project--133f9183-9d83-4d21-85ed-38bd33238705.lovable.app` (now stored in
  `app_config.app_base_url`).
* **Database/Auth/Realtime**: Supabase project `hoqmvktmnbvmdgvrsiae` (Lovable Cloud).
* **Background jobs**: pg_cron job `tt24-background-sync` every 5 min.
* **Secrets**: Lovable Cloud secret store (names in `.env.example`).

## 2. Local development
```bash
npm install --no-package-lock --legacy-peer-deps   # bun.lock points at Lovable's private mirror;
npm install --no-save @testing-library/dom@10       # peer needed by tests when not using bun
cp .env.example .env    # fill VITE_SUPABASE_* with a NON-production project
npm run dev             # http://localhost:3000 (add --host 127.0.0.1 if IPv6 is unavailable)
npm test                # unit tests
npm run test:db         # database policy tests (needs PostgreSQL 16 binaries installed locally)
npx tsc --noEmit && npm run build
```
Never point local development at the production Supabase project.

## 3. Applying database migrations
Migrations live in `drizzle/migrations/` and are registered in `meta/_journal.json`.
* Inside Lovable: Lovable applies new migrations from the connected branch.
* Self-managed: `psql "$DATABASE_URL" -1 -f drizzle/migrations/00NN_*.sql` in order, on **staging
  first**, then production after a backup (§6).
0019 and 0020 are idempotent and non-destructive (no table/column drops, no data deletes). They
change behaviour in these visible ways: workspace admins can no longer edit plan/limit columns via
the API (the app never did); the operator workspace is marked `platform_connectors = true`.
After applying, regenerate `src/integrations/supabase/types.ts`.

## 4. Moving off Lovable (independence plan — do not execute without approval)
| Concern | Recommended portable target | Notes |
|---|---|---|
| Frontend + server functions | Cloudflare Workers via `wrangler` (same Nitro output) — or any Node host with the Nitro `node-server` preset | Build already emits `wrangler.json` |
| Database/Auth/Storage/Realtime | Own Supabase organisation (managed) — or self-hosted Supabase on a VPS later | Migrate with `pg_dump`/`pg_restore`; auth users included; keep the same JWT secret or force re-login |
| Lovable connectors (Gmail, WhatsApp) | Replace with direct Google OAuth and WhatsApp Cloud API (code for both patterns already exists for tenants) | Required anyway for SaaS |
| Lovable AI gateway | Direct provider keys (platform-paid key per provider) | `ai-provider.server.ts` already supports this |
| Cron | Supabase pg_cron (unchanged) or Cloudflare Cron Triggers | Update `app_config.app_base_url` |
| Email | Transactional provider (Postmark/Resend/SES) | Needs DNS records |
| Monitoring | Sentry (errors) + Supabase logs + uptime checks (Better Stack/UptimeRobot) | |
Steps: (1) staging Supabase project + `pg_dump --schema-only` diff vs migrations, (2) deploy app to a
staging Worker, (3) replace connectors, (4) full E2E on staging, (5) cut-over window with DNS
change, (6) rollback = point DNS back + keep the old project read-only for 14 days.

## 5. Release checklist for this branch
1. Review PR. 2. Backup production database (Supabase dashboard → Backups, or `pg_dump`).
3. Apply 0019, 0020 on a staging copy; run `npm run test:db` and smoke-test TukTuk24 flows
(inbox send/receive, Gmail sync, website bookings import, AI draft, AI Operator, tickets).
4. Apply to production. 5. Publish app. 6. Verify the background job log shows the TukTuk24
workspace processed and no `isn't available for this workspace` errors for it.
**Rollback**: the app code is backward compatible with the old schema except AI metering
(`consume_usage` must exist) — so roll back the app first, then (only if needed) `drop function
consume_usage` etc. Data is never removed by these migrations.

## 6. Backups & disaster recovery
* Supabase Pro includes daily backups (7-day retention); Point-in-Time Recovery is a paid add-on —
  recommended once paying customers exist (RPO minutes instead of 24 h).
* Additionally: weekly `pg_dump` to separate storage (e.g. Cloudflare R2 / Backblaze B2) with
  30-day retention, encrypted.
* Quarterly restore drill into a scratch project; record time-to-restore (target RTO < 4 h).
* `CREDENTIALS_ENCRYPTION_KEY` must be backed up separately (password manager) — without it all
  stored integration credentials are lost.

## 7. Estimated monthly infrastructure cost (EUR, rough, excl. VAT)
Assumptions: prices as known to the author in 2026 and **must be re-checked** on vendor sites
before budgeting; AI and messaging pass-through costs excluded (charged to/paid by customers or
covered by plan limits).

| Item | 1–10 businesses | ~100 businesses | ~1,000 businesses |
|---|---|---|---|
| Supabase (Pro + compute; PITR from 100) | ~25–40 | ~150–300 | ~800–2,000 |
| Cloudflare Workers paid + bandwidth | ~5 | ~5–30 | ~50–200 |
| Transactional email | 0–15 | ~20–50 | ~100–300 |
| Error monitoring (Sentry) + uptime | 0–30 | ~30–80 | ~100–300 |
| Off-site backups storage | <5 | ~5–10 | ~20–50 |
| Lovable subscription (only while still used) | per Lovable plan | — | — |
| **Infra total (approx.)** | **€35–95** | **€210–470** | **€1,070–2,850** |
Variable costs to watch: platform-paid AI (capped per plan by `monthly_ai_requests`), WhatsApp
conversation fees (Meta bills the business's WABA), Stripe fees (% of revenue).
