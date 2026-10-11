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
- Business data is scoped by `workspace_id`; access is enforced by RLS helpers (`is_member`, `has_ws_role`, `can_view_conversation`) — UI checks in `src/lib/domain.ts` only mirror them.
- CRUD runs from the browser client under RLS; multi-row or privileged operations are SECURITY DEFINER RPCs that check the caller's role first — keeps logic atomic and server-enforced.
- The app may only insert messages with status `logged`; channel delivery statuses come solely from server-side webhook handlers — prevents fake delivery states.
- Protected pages live under `src/routes/_authenticated/` (client-only gate, redirect to `/auth`).
- Sample data is flagged `is_demo` and labelled "[SAMPLE]" — never mixed with real records.
- tsconfig relaxes exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noImplicitReturns — generated DB types are incompatible with them.
- AI calls go through `src/lib/ai.functions.ts` (requireSupabaseAuth, RLS-scoped reads) → `ai-gateway.server.ts` (streamed Responses API); output is always shown as a labelled suggestion, never auto-sent.
- Automations are evaluated in a DB trigger on conversation insert and logged to `automation_runs`.
- Third-party credentials live encrypted (AES-GCM, server key) in `workspace_secrets`, which has no client grants; only server functions read them after `has_ws_role` admin checks, and the UI only ever sees masked hints — secrets are never returned to browsers.
- Meta channels ingest via `/api/public/webhooks/meta/$workspaceId` (verify token + X-Hub-Signature-256) and send via `sendChannelMessage`; only these server paths set sent/delivered/read statuses.
- Email channel uses the linked Gmail connector server-side (email-channel.server.ts); inbox polls syncEmailNow while open since Gmail push needs Pub/Sub — keeps setup credential-free.

- Invite-only access: public signup disabled (auth config); /auth is sign-in + reset only; new accounts are created server-side by redeemInvitation (src/lib/invite.functions.ts) when a valid invitation token is opened, then the invitee sets their password via a reset email.
- Tour dispatch: vehicles table + bookings.vehicle_id/driver_id/dispatch_status; conflict detection is pure client logic in src/lib/dispatch.ts (tested) — keeps warnings instant without extra queries.
