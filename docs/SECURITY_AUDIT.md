# Security Audit

_Scope: full repository review on 2026-11-15 (all 21 migrations, server functions, public
endpoints, auth/MFA, secrets, integrations). Method: manual code review + automated database
policy tests against a throwaway PostgreSQL (`npm run test:db`). Not a penetration test of the live
system. Security features existing does **not** imply legal (GDPR) compliance._

## Summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-01 | **Critical (before SaaS signup)** | Operator-owned integrations (Lovable Gmail connector, Lovable WhatsApp connector, tuktuk24lisbon.com API) were usable by **any** workspace. Once self-signup opens, a new tenant admin could connect the operator's Gmail (import its emails), list/import its website bookings (customer PII), and background jobs would copy those bookings into every workspace and send WhatsApp reminders from the operator's number to other tenants' customers. | **Fixed** — `platform_connectors` flag + `assertPlatformConnectors` (fails closed) on every path; background jobs gated. Unit tests prove no network call happens. |
| F-02 | **High** | Workspace admins could update **any** column of their workspace via the REST API, including `plan` and `plan_limits` (self-upgrade to unlimited). | **Fixed** — column-level GRANT (0019). DB test failed before, passes after. |
| F-03 | Medium | No way to suspend a tenant; nothing in RLS considered workspace state. | **Fixed** — suspension-aware helpers + audited platform RPC. DB test. |
| F-04 | Medium | Child rows could reference parent rows from another workspace (e.g. `contact_tags` linking a foreign contact; service-role code could attach a conversation to another tenant's contact). No direct read leak (RLS still hides the parent) but it corrupts tenant boundaries and could surface data through server-side joins. | **Fixed** — `enforce_same_workspace` / `enforce_member_ref` triggers on 24 tables. DB tests. |
| F-05 | Low | `kick_ai_operator` and the cron job hard-coded the Lovable preview URL — blocks moving hosting. | **Fixed** — `app_config.app_base_url` + `trigger_background_sync()`; same default URL so production behaviour is unchanged. |
| F-06 | Medium (reliability) | Schema drift: production has columns (`bookings.ticket_token`, `ticket_sent_at`, `workspace_members.whatsapp_phone`, `schedule_sent_on`, `workspaces.driver_auto`, `ticket_auto`) and a cron job not present in migrations; a fresh database could not run the app (e.g. `check_in_ticket` referenced a missing column). | **Fixed** — idempotent reconciliation in 0019 (`add column if not exists`, cron job only if absent). |
| F-07 | Medium | AI prompts injected the TukTuk24 business playbook into every workspace; other tenants' customers would receive TukTuk24 policies/prices. IMAP replies were signed "Tuk Tuk 24 Lisbon" for all tenants. | **Fixed** for AI assistant, AI Operator and IMAP sender name. Other hard-coded copy tracked as L-07. |
| F-08 | Medium | Platform-paid AI (Lovable gateway) had no per-tenant limit → unbounded cost exposure. | **Fixed** — metered in `generate()`, capped by plan. |
| F-09 | Medium | "Custom" AI provider lets a tenant admin set any `https://` base URL that the server then calls (SSRF-lite; https only, no internal hostnames blocked). | **Fixed** — `url-safety.ts` (https only, no credentials/odd ports/IP literals/internal names) checked on save and at call time; 15 tests. DNS-rebinding not covered (Workers can't reach private networks). |
| F-10 | Medium | No rate limiting on public endpoints (webhooks, invite redemption, ticket lookup, auth relies on Supabase's limits). Tokens are 122-bit UUIDs so brute force is impractical, but abuse/DoS is not throttled. | **Mitigated** — DB-backed fixed-window limiter (migration 0021, `rate-limit.server.ts`): ticket lookup 60/min/IP and invite redemption 10/10 min/IP (fail closed); hub + Meta webhooks per-workspace caps (fail open, providers retry on 429). Edge (Cloudflare) rules still recommended. |
| F-11 | Low | `workspace_secrets` encryption has no associated data binding ciphertext to `(workspace_id, kind)` and no key version, so key rotation needs a manual re-encrypt script. Access already requires the service role. | **Open** — v2 format with AAD + key id, backward-compatible decrypt (roadmap P2). |
| F-12 | Low | `.env` is committed although listed in `.gitignore` (contains only the Supabase URL and **publishable** key, which are public by design). | **Open** — `git rm --cached .env` once Lovable no longer needs it in the repo; no secret rotation required. |
| F-13 | Low | MFA recovery is admin-reset only; no self-service recovery codes. A sole admin who loses their phone needs platform support. | **Open** — recovery codes (roadmap P2). |
| F-14 | Info | `profiles` are readable by teammates (name/email) — intended. `shares_workspace` ignores `active` on the other side, so former teammates' names stay visible. | Accepted. |
| F-15 | Low | Dependency/secret scanning not automated (no CI). `bun.lock` resolves through a private mirror. | **Open** — CI with `npm audit`, gitleaks (roadmap P1). |

## Controls verified by automated tests (`db-tests/`)

* Business B sees **zero** rows of business A in 12 tables (contacts, leads, bookings,
  conversations, messages, notes, tasks, tags, PayPal transactions, audit log, members, invitations).
* B cannot insert into, update or delete A's rows; anonymous users get `permission denied`.
* Encrypted credentials are unreadable by any signed-in user.
* Cross-workspace links rejected for browsers **and** service-role code.
* Agents can't see others' conversations, can't promote themselves, can't fake delivery status.
* Admins can't change plan/limits/platform flag/suspension; can still rename.
* Only platform admins can suspend, change plans or list businesses; suspension locks members out
  and is audited.
* Workspace creation requires a verified email, validates input, caps 3 owned workspaces.
* Plan limits enforced in the DB (members, channel accounts), metering stops exactly at the limit,
  browsers can't call the meter.

**Proof the tests detect real defects:** `MIGRATIONS_UPTO=0018 npm run test:db` → 6 failures
(exactly the F-02/F-03/F-04 tests); with all migrations → 42/42 pass.

## Existing strengths (pre-existing, reviewed)

* RLS enabled with explicit GRANTs on every table; service-only tables have no client grants.
* Webhooks verify signatures (Meta `X-Hub-Signature-256`, Lovable-signed WhatsApp, HMAC hub key);
  constant-time comparisons.
* Server functions use `requireSupabaseAuth` and re-check roles via `has_ws_role` before using the
  service-role client; CSRF middleware enabled for server functions.
* Credentials AES-GCM encrypted; UI only sees masked hints; provider error messages scrub tokens.
* Meta OAuth state is encrypted + expiring; long-lived user token held 15 min server-side only.
* App can only create `logged` messages; delivery statuses only from webhook handlers.
* Mandatory TOTP MFA gate fails closed; MFA reset audited.

## GDPR / privacy notes (not legal advice)

The platform will process personal data of EU customers on behalf of each business (the business
is the **controller**, the platform is a **processor**). Before commercial launch you need, with a
lawyer: a Data Processing Agreement for customers, a sub-processor list (Supabase, Cloudflare,
Lovable, AI providers, Meta, Google, email provider), privacy policy and terms, a retention policy,
records of processing, a breach procedure, and SCCs/assessments for non-EU sub-processors (AI
providers in the US). Technical support exists for per-contact export and anonymisation; workspace
-level export/deletion and automated retention are roadmap items (P2).
