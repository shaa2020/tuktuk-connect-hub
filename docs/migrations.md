# Database migrations

Applied in order from `drizzle/migrations/`:

1. `0000_migration.sql` — enums, workspaces, profiles, members, invitations, CRM (contacts, consents,
   identities, tags, leads, activities, bookings), inbox (channels, conversations, assignments, messages,
   delivery events, internal notes, labels), tasks, notifications, audit log, Phase 2 placeholder tables,
   RLS helpers (`is_member`, `has_ws_role`, `can_view_conversation`), triggers (audit, inbox counters,
   assignment history/notifications, agent self-assign guard, last-admin guard), signup bootstrap,
   `accept_invitation`, `dashboard_stats`, sample-data load/clear, realtime publication.
2. `0001_contact_merge_anonymize.sql` — `merge_contacts` and `anonymize_contact` (admin/manager only).

Rules: every table has a `workspace_id`, RLS on, and explicit GRANTs. Messages created from the app can only
have status `logged`; real delivery statuses may only be written by server code handling channel webhooks.

Later migrations (0002–0018) are listed in `drizzle/migrations/meta/_journal.json`; SaaS work adds:

- `0019_tenant_isolation_hardening.sql` — schema-drift reconciliation (ticket_token, ticket_sent_at,
  whatsapp_phone, schedule_sent_on, driver_auto, ticket_auto), workspace owner/suspension/platform_connectors,
  column-level update grants on workspaces, suspension-aware access helpers, cross-workspace reference
  triggers, `app_config` + `trigger_background_sync` (portable job URL), cron job for fresh databases.
- `0020_saas_plans_entitlements.sql` — `plans` catalogue (prices NULL until set by the owner),
  `usage_counters`, `workspace_limit/usage/usage_summary`, `assert_entitlement`, `consume_usage`,
  plan-limit triggers, `workspace_subscriptions`, `billing_events`, `create_workspace`, platform RPCs.

- `0021_rate_limits.sql` — `rate_limits` table + `check_rate_limit()` (service role only).

Testing: `npm run test:db` (requires a local PostgreSQL 16 install; no production access).
All new migrations are idempotent and non-destructive (no DROP of tables/columns, no data deletion).
- `0022_job_fanout_social_publishing.sql` — per-workspace background fan-out, social publishing columns + status guard.
- `0023_telegram_webchat_channels.sql` — adds channel types telegram, webchat.
- `0024_stripe_prices.sql` — Stripe price ids per plan; unique provider subscription id.
- `0025_staff_scheduling.sql` — staff_shifts, time_off_requests, shift_swap_requests, staff_attendance + guards, notifications, decide_* and clock_in/out RPCs.
