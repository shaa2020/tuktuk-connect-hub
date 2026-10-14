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
- App branding uses shared BrandMark/BrandLockup components backed by CDN asset pointers; install icons use real versioned public files to prevent stale cached artwork.
- Business data is scoped by `workspace_id`; access is enforced by RLS helpers (`is_member`, `has_ws_role`, `can_view_conversation`) — UI checks in `src/lib/domain.ts` only mirror them.
- CRUD runs from the browser client under RLS; multi-row or privileged operations are SECURITY DEFINER RPCs that check the caller's role first — keeps logic atomic and server-enforced.
- The app may only insert messages with status `logged`; channel delivery statuses come solely from server-side webhook handlers — prevents fake delivery states.
- Protected pages live under `src/routes/_authenticated/` (client-only gate, redirect to `/auth`).
- Sample data is flagged `is_demo` and labelled "[SAMPLE]" — never mixed with real records.
- tsconfig relaxes exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noImplicitReturns — generated DB types are incompatible with them.
- AI calls go through `src/lib/ai.functions.ts` (requireSupabaseAuth, RLS-scoped reads) → `ai-gateway.server.ts` (streamed Responses API); output is a labelled suggestion, never auto-sent — except the AI Operator.
- AI Operator (src/lib/ai-operator.server.ts) auto-acts only while an admin/manager has Away mode on, with per-action toggles; runs in the 5-min background job with a DB lease, per-message marks, a reply cap, 402/403 pause, and logs every action to ai_operator_log — keeps autonomy bounded and auditable.
- Webhooks start the AI Operator via the kick_ai_operator RPC (pg_net, 120s timeout, background-sync operatorOnly), never inline — inline runs were cut off on caller disconnect.
- Outbound sends share src/lib/outbound.server.ts so team and operator replies use the same channel routing.
- Automations are evaluated in a DB trigger on conversation insert and logged to `automation_runs`.
- Third-party credentials live encrypted (AES-GCM, server key) in `workspace_secrets`, which has no client grants; only server functions read them after `has_ws_role` admin checks, and the UI only ever sees masked hints — secrets are never returned to browsers.
- Meta channels ingest via `/api/public/webhooks/meta/$workspaceId` (verify token + X-Hub-Signature-256) and send via `sendChannelMessage`; only these server paths set sent/delivered/read statuses.
- Email channel uses the linked Gmail connector server-side (email-channel.server.ts); inbox polls syncEmailNow while open since Gmail push needs Pub/Sub — keeps setup credential-free.

- Invite-only access: public signup disabled (auth config); /auth is sign-in + reset only; new accounts are created server-side by redeemInvitation (src/lib/invite.functions.ts) when a valid invitation token is opened, then the invitee sets their password via a reset email.
- Tour dispatch: vehicles table + bookings.vehicle_id/driver_id/dispatch_status; conflict detection is pure client logic in src/lib/dispatch.ts (tested) — keeps warnings instant without extra queries.
- Channels are multi-account: one channel_connections row per account (unique workspace+channel+account_id); conversations.connection_id records the receiving account; Meta tokens are stored per connection as `<channel>_token:<connectionId>` — so replies always leave from the account the guest contacted.
- Extra Gmail inboxes use IMAP/SMTP over node:tls with a Gmail App Password stored encrypted as gmail_pass:<connectionId>; rows have config.mode='imap' — the Lovable Gmail connector only supports one account.
- WhatsApp primary number uses the Lovable WhatsApp connector (config.mode='connector'): sends via connector gateway, receives at /api/public/whatsapp/webhook into the durable whatsapp_webhook_events inbox with bounded retry — no Meta tokens stored.
- WhatsApp templates are read live from the connector (/message_templates) and sent only if APPROVED; the 24h-window check (src/lib/wa-templates.ts) is UI guidance — Meta remains the enforcer.
- MFA: TOTP is mandatory; MfaGate (src/components/mfa-gate.tsx) fails closed on lookup errors and forces enroll/verify; a phone can only be removed while another verified one exists; lost phones are reset by an admin via resetMemberMfa (audited) - no path leaves an account without MFA.
- Website (tuktuk24lisbon.com) is read via its /api/v1 with the WEBSITE_API_KEY server secret (website-api.server.ts); quotes fetch tours live and 'Sync now' copies business info/tours/FAQ into knowledge_documents (category 'website') — the website API has no booking-list endpoint, bookings are pulled by syncWebsiteBookingsFor (background-sync.server.ts); deleting a synced booking records a tombstone in website_booking_ignores so it never re-imports.

- Background sync: pg_cron every 5 min POSTs /api/public/hooks/background-sync with a random token read from internal_job_tokens (service_role only) — Gmail push and website webhooks aren't available, and the token never leaves the server/DB.
- Connect Account sheet (src/components/connect-account.tsx) derives card states only from real channel_connections rows via src/lib/connect-providers.ts (tested) and hands off to /integrations?connect=<channel> — one setup path per provider, no fake states.
