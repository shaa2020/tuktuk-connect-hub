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
