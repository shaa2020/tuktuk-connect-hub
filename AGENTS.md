<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Subdirectories have their own AGENTS.md (src/lib) — read it before changing files there.
- App branding uses shared BrandMark/BrandLockup components backed by CDN asset pointers; install icons use real versioned public files to prevent stale cached artwork.
- Business data is scoped by `workspace_id`; access is enforced by RLS helpers (`is_member`, `has_ws_role`, `can_view_conversation`) — UI checks in `src/lib/domain.ts` only mirror them.
- CRUD runs from the browser client under RLS; multi-row or privileged operations are SECURITY DEFINER RPCs that check the caller's role first — keeps logic atomic and server-enforced.
- The app may only insert messages with status `logged`; channel delivery statuses come solely from server-side webhook handlers — prevents fake delivery states.
- Protected pages live under `src/routes/_authenticated/` (client-only gate, redirect to `/auth`).
- Sample data is flagged `is_demo` and labelled "[SAMPLE]" — never mixed with real records.
- tsconfig relaxes exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noImplicitReturns — generated DB types are incompatible with them.
- AI calls go through `src/lib/ai.functions.ts` (requireSupabaseAuth, RLS-scoped reads) → `ai-gateway.server.ts` (streamed Responses API); output is a labelled suggestion, never auto-sent — except the AI Operator.
- Webhooks start the AI Operator via the kick_ai_operator RPC (pg_net, 120s timeout, background-sync operatorOnly), never inline — inline runs were cut off on caller disconnect.
- Outbound sends share src/lib/outbound.server.ts so team and operator replies use the same channel routing.
- Automations are evaluated in a DB trigger on conversation insert and logged to `automation_runs`.
- Third-party credentials live encrypted (AES-GCM, server key) in `workspace_secrets`, which has no client grants; only server functions read them after `has_ws_role` admin checks, and the UI only ever sees masked hints — secrets are never returned to browsers.
- Meta channels ingest via `/api/public/webhooks/meta/$workspaceId` (verify token + X-Hub-Signature-256) and send via `sendChannelMessage`; only these server paths set sent/delivered/read statuses.
- Email channel uses the linked Gmail connector server-side (email-channel.server.ts); inbox polls syncEmailNow while open since Gmail push needs Pub/Sub — keeps setup credential-free.
- Invite-only access: public signup disabled (auth config); /auth is sign-in + reset only; new accounts are created server-side by redeemInvitation (src/lib/invite.functions.ts) when a valid invitation token is opened, then the invitee sets their password via a reset email.
- Channels are multi-account: one channel_connections row per account (unique workspace+channel+account_id); conversations.connection_id records the receiving account; Meta tokens are stored per connection as `<channel>_token:<connectionId>` — so replies always leave from the account the guest contacted.
- Extra Gmail inboxes use IMAP/SMTP over node:tls with a Gmail App Password stored encrypted as gmail_pass:<connectionId>; rows have config.mode='imap' — the Lovable Gmail connector only supports one account.
- WhatsApp primary number uses the Lovable WhatsApp connector (config.mode='connector'): sends via connector gateway, receives at /api/public/whatsapp/webhook into the durable whatsapp_webhook_events inbox with bounded retry — no Meta tokens stored.
- MFA: TOTP is mandatory; MfaGate (src/components/mfa-gate.tsx) fails closed on lookup errors and forces enroll/verify; a phone can only be removed while another verified one exists; lost phones are reset by an admin via resetMemberMfa (audited) - no path leaves an account without MFA.
- Background sync: pg_cron every 5 min POSTs /api/public/hooks/background-sync with a random token read from internal_job_tokens (service_role only) — Gmail push and website webhooks aren't available, and the token never leaves the server/DB.
- Connect Account sheet (src/components/connect-account.tsx) derives card states only from real channel_connections rows via src/lib/connect-providers.ts (tested) and hands off to /integrations?connect=<channel> — one setup path per provider, no fake states.
- Booking overlaps (same guide or tuk tuk, confirmed bookings) are blocked in the DB trigger booking_conflict_guard with a per-day advisory lock; a busy default guide is skipped instead of failing — client findConflicts is only a preview.
- Ticket boarding uses the check_in_ticket RPC (members only, row-locked) so a second scan reports "already checked in".
- PayPal finance (src/lib/paypal.server.ts): admin saves Live Client ID/Secret encrypted; background sync (~hourly, 3 days) and "Check now" (31 days) pull the Reporting API into paypal_transactions (manager/admin read-only RLS); matching rules are pure and tested (paypal-match.ts) — only completed PayPal money sets payment_status, never for website-synced bookings.
- Operator-owned integrations (Lovable Gmail/WhatsApp connectors, tuktuk24lisbon.com API) act only for workspaces with platform_connectors=true, checked by assertPlatformConnectors (src/lib/tenancy.server.ts, fails closed) before any network call — prevents new tenants reaching the operator's mailbox, bookings or WhatsApp number.
- Browsers may update only ordinary workspace columns (column-level GRANT, migration 0019); plan, plan_limits, owner, suspension and platform_connectors change only via service role or platform_* RPCs — tenants can't self-upgrade.
- Child rows may only reference same-workspace parents/members (enforce_same_workspace / enforce_member_ref triggers) — blocks cross-tenant linking even from server code.
- Suspension: is_member/has_ws_role/can_view_conversation return false for suspended workspaces; background jobs skip them; inbound webhooks still store customer messages.
- Plans & limits live in the plans table (+ workspaces.plan_limits overrides); hard limits are DB triggers/assert_entitlement, metered actions use consume_usage (service role only); conversations are a soft limit so customer messages are never dropped. Every AI call is metered in generate() (ai-provider.server.ts).
- New tenants are created only by the create_workspace RPC (verified email, max 3 owned) — the caller becomes owner + admin, plan 'free', platform_connectors false.
- Database policy tests: `npm run test:db` starts a throwaway local Postgres, applies every migration (0019+ twice for idempotency) and runs db-tests/ — add a test there for any RLS/RPC change.
- Public, unauthenticated endpoints are throttled with check_rate_limit (src/lib/rate-limit.server.ts): credential-like lookups fail closed, provider webhooks fail open (providers retry on 429) — never drop customer messages because the limiter is down.
- Tenant-supplied outbound URLs (custom AI provider) must pass unsafeUrlReason (src/lib/url-safety.ts) on save and at call time — SSRF guard.
