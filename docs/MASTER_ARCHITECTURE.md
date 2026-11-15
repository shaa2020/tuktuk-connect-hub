# Master Architecture — TukTuk Connect Hub

_Last verified against the code: 2026-11-15 (branch `claude/tuktuk-connect-hub-saas-3awos9`)._

## 1. In one paragraph

A single TypeScript web application (React 19 + TanStack Start) that renders the UI in the
browser and runs "server functions" and webhook endpoints on a serverless runtime (built with
Nitro for Cloudflare Workers). All business data lives in one Supabase PostgreSQL database.
Every business ("workspace") shares the same database; isolation is enforced **inside the
database** with Row Level Security (RLS) policies and triggers, so a bug in the UI cannot leak
another business's data. Credentials for third-party services are stored encrypted per workspace.
A database cron job calls the app every 5 minutes to do background work (email polling, website
booking import, AI Operator, reminders, PayPal sync).

## 2. Building blocks

| Layer | Technology | Where |
|---|---|---|
| UI | React 19, TanStack Router (file routes), TanStack Query, Tailwind v4, Radix/shadcn | `src/routes`, `src/components` |
| Server functions | TanStack Start `createServerFn` + `requireSupabaseAuth` middleware (user JWT → RLS-scoped client) | `src/lib/*.functions.ts` |
| Server-only modules | `*.server.ts` — never shipped to browsers; may use the service-role client | `src/lib/*.server.ts` |
| Public HTTP endpoints | Webhooks / cron / OAuth callbacks | `src/routes/api/public/**` |
| Database | Supabase Postgres 15+, RLS, SECURITY DEFINER RPCs, triggers, pg_cron, pg_net | `drizzle/migrations/*.sql` |
| Auth | Supabase Auth (email + password), mandatory TOTP MFA (`MfaGate`) | `src/components/mfa-gate.tsx` |
| Hosting (today) | Lovable Cloud → Cloudflare Workers (Nitro preset, `wrangler.json` generated at build) | `vite.config.ts` |
| Realtime | Supabase Realtime on conversations, messages, notes, notifications | migration 0000 |
| Push | Web Push (VAPID) via service worker `public/sw.js` | `src/lib/push*.ts` |

## 3. Tenancy model

```
auth.users ──1:1── profiles ──n:m── workspace_members(role: admin|manager|agent) ──n:1── workspaces
                                                                                         │
            every business table has workspace_id ───────────────────────────────────────┘
```

* **Access helpers** (SQL, SECURITY DEFINER): `is_member(ws)`, `has_ws_role(ws, roles[])`,
  `can_view_conversation(ws, assigned_to)`, `has_membership(ws)`, `is_platform_admin()`.
  Since migration 0019 the first three return **false for suspended workspaces**.
* **Owner**: `workspaces.owner_id` (billing owner; always also an `admin` member).
* **Platform administrators**: rows in `platform_admins` (separate from workspace admins).
  They act only through audited `platform_*` RPCs.
* **Cross-workspace reference guard** (0019): triggers ensure that e.g. a lead in workspace B can
  never point at a contact in workspace A — even when written by server code.
* **Privileged columns** (`plan`, `plan_limits`, `owner_id`, `suspended_*`, `platform_connectors`)
  are not updatable by browsers (column-level GRANT).
* **Operator-owned integrations**: the Lovable Gmail connector, the Lovable WhatsApp connector and
  the tuktuk24lisbon.com website API use credentials that belong to the platform operator. They are
  usable only by workspaces with `platform_connectors = true` (TukTuk24 only), checked in
  `src/lib/tenancy.server.ts` before any network call (fails closed).

## 4. Request flows

### 4.1 Browser CRUD
Browser → Supabase PostgREST with the user's JWT → RLS decides. Used for lists, edits, notes.
Messages created from the browser can only have status `logged`.

### 4.2 Privileged action (example: send a WhatsApp reply)
Browser → `sendChannelMessage` server function → `requireSupabaseAuth` verifies the JWT →
RLS-scoped read proves the caller can see the conversation → `outbound.server.ts` (service role)
chooses the connection the guest wrote to → provider API → message stored as `sent`; provider
webhooks later upgrade it to `delivered`/`read`.

### 4.3 Inbound webhook
Provider → `/api/public/webhooks/meta/$workspaceId` (signature verified with that workspace's
encrypted app secret) or `/api/public/whatsapp/webhook` (Lovable-signed, durable inbox table with
bounded retries) → `ingestInbound()` (dedupe by `(workspace_id, external_id)`) →
`kick_ai_operator` RPC (pg_net async call back into the app).

### 4.4 Background job
`pg_cron` (every 5 min) → `trigger_background_sync()` → POST `/api/public/hooks/background-sync`
with a random token stored in `internal_job_tokens` → loops over **non-suspended** workspaces:
email sync, website bookings (operator only), integration alerts, AI Operator, tickets,
driver dispatch (operator only), guest reminders (operator only), PayPal (hourly), push.

### 4.5 SaaS lifecycle (new in this branch)
`/signup` (flagged) → Supabase sends verification email → `/onboarding` → `create_workspace` RPC
(verified email, max 3 owned) → user is owner + admin on plan `free` → MFA enrolment (MfaGate) →
dashboard setup checklist.

## 5. Plans, limits, metering (migration 0020)

* `plans` (catalogue; prices NULL until the owner sets them) + `workspaces.plan_limits` overrides.
* `workspace_limit()`, `workspace_usage()`, `workspace_usage_summary()` (admins/managers).
* **Hard limits in the database**: invitations (`members`), connected channel accounts,
  monthly bookings, scheduled posts — triggers call `assert_entitlement()`.
* **Metered actions**: `consume_usage()` (service role only, atomic check-and-increment). Every AI
  call goes through `generate()` in `ai-provider.server.ts`, which meters platform-paid AI
  (`monthly_ai_requests`, capped) and BYO-key AI (`monthly_ai_requests_byo`, recorded only).
* **Soft limit**: monthly conversations — customer messages are never dropped.
* `workspace_subscriptions` / `billing_events` exist for the billing provider (Phase 3; not wired).

## 6. Security architecture summary
See `docs/SECURITY_AUDIT.md`. Key controls: RLS on every table; secrets AES-GCM encrypted in
`workspace_secrets` (no client grants); webhook signature verification; CSRF middleware on server
functions; mandatory TOTP MFA; audit log triggers; tenancy guard for operator connectors.

## 7. Testing architecture
* `npm test` — Vitest unit/component tests (jsdom).
* `npm run test:db` — starts a **throwaway local PostgreSQL 16**, applies Supabase stubs + every
  migration (0019+ twice for idempotency) and runs `db-tests/` (RLS, cross-tenant, plan limits,
  platform admin). Never touches production.
See `docs/TESTING_STRATEGY.md`.

## 8. Known architectural debts (prioritised in `docs/SAAS_ROADMAP.md`)
1. Background job processes all workspaces serially in one HTTP request — will hit runtime limits
   at roughly tens of active workspaces. Needs a job queue with per-workspace fan-out.
2. Branding/business copy for TukTuk24 is hard-coded in many UI strings and guest message
   templates (white-labelling backlog).
3. Meta integration uses a per-workspace "bring your own Meta app" model; a SaaS normally uses one
   platform Meta app with App Review (required for scale).
4. `supabase/types.ts` is generated by Lovable; this branch extended it by hand for the new
   objects — regenerate after migrations are applied.
5. Lockfile (`bun.lock`) points at Lovable's private npm mirror; outside Lovable install with the
   public registry (see `docs/DEPLOYMENT_GUIDE.md`).
