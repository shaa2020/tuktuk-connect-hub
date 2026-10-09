# Tuk Tuk 24 Lisbon — Phase 1 Plan

Phase 1 delivers a secure, working team workspace: sign-in, team roles, contacts, leads, bookings, tasks, and the inbox foundation (conversations, assignments, internal notes, live updates). No social channels get connected in Phase 1. Every channel shows "Not connected" until it is set up for real in Phase 2.

## What you will get

**Sign-in and team**
- Email and password sign-in, password reset page, email verification, and sign-out.
- Pages are protected: anyone who is not signed in is sent to the sign-in page.
- One "Tuk Tuk 24 Lisbon" workspace. The first person to sign up becomes Business Admin.
- Admins invite teammates by email and pick a role: Admin, Manager or Agent. They can also deactivate members.

**Layout (built for your Android phone first)**
- Phone: bottom bar with Home, Inbox, Contacts, Leads and More. Everything else sits under More.
- Desktop: collapsible sidebar with all 15 sections.
- Sections that are not built yet (Automations, AI Assistant, Integrations, Knowledge Base, Analytics) show an honest "Coming in Phase 2" page. They have no buttons that pretend to work.

**Home Dashboard**
- Figures come from real records: total, open, unread and awaiting-reply conversations, new leads, leads due for follow-up, upcoming bookings, conversations by channel and status, team workload, and overdue tasks.
- Response-time figures say "Not enough data yet" until real messages exist.
- Filters for date range, channel, team member and status.

**Unified Inbox**
- Conversation list showing channel, preview, time, unread dot, status, assignee, priority and labels.
- All the filters from your brief, plus search by name, email, phone and booking reference.
- Conversation actions: assign, change status (Open, In progress, Waiting for customer, Waiting for team, Resolved, Archived), change priority, add labels, mark read or unread, link a contact, lead or booking, create a task, and escalate.
- Internal notes look clearly different from customer messages and are never sent to customers.
- Channel messages can't be sent until a channel is connected. Instead of a fake "sent", the message box explains why.
- A "Manual / Phone" conversation type lets your team log calls and walk-in enquiries now.
- Updates appear live for new messages, assignments, status changes and notes.

**Contacts, Leads, Bookings, Tasks**
- Contacts: create, edit, search, filter, labels, consent preferences, and history. Merging duplicates always asks you to confirm first. Contacts are never matched by name alone.
- Leads: board and list views with the 8 stages, all tour fields from your brief, an owner, a follow-up date, and a reason when a lead is lost.
- Bookings: reference, tour, date and time, guests, language, pickup, amount, and status (Inquiry, Quote, Tentative, Confirmed, Cancelled, Completed). Payment status is entered by hand and labelled as such. Card details are never stored.
- Tasks: my tasks, team tasks, overdue tasks, complete and reopen, linked to a contact, conversation, lead or booking.

**Audit log and states**
- The audit log records role changes, assignments, lead and booking changes, deletions and exports. Only Admins and Managers can see it.
- Every page has loading, empty, offline and error states, with clear success and failure messages.
- No sample data by default. An Admin can optionally load clearly marked sample records and remove them again.

## Design
- Your colour palette: navy #14213D, blue #2563EB, teal #0F766E, background #F7F8FC, plus the success, warning, error and info colours.
- Fonts: "Plus Jakarta Sans" for headings and "Inter Tight" for body text. Rounded cards, subtle borders and restrained motion.

## What comes later (Phase 2+)
WhatsApp, Instagram, Facebook Messenger and email channels, AI drafting and translation, the knowledge base, automations, analytics exports, reminder notifications and booking-system sync. Each one needs credentials or approvals from you, and I will list them after Phase 1.

## Technical details
- Lovable Cloud for auth, Postgres, Realtime and Storage. Server logic uses TanStack `createServerFn` with `requireSupabaseAuth`, not Edge Functions, which this stack doesn't support. Inputs are validated with zod on the server.
- Migration 1 (core): workspaces, profiles, workspace_members, an `app_role` enum stored in a separate user_roles-style membership table (role per workspace), and security-definer helper functions `is_member(ws)`, `has_ws_role(ws, role)`, plus a superadmin flag in its own table.
- Migration 2 (CRM): contacts, contact_consents, external_identities, tags, contact_tags, leads, lead_activities, bookings, tasks, task_relations.
- Migration 3 (inbox): channels, channel_connections, conversations, conversation_participants, conversation_assignments, messages (unique per workspace + external_id), message_attachments, message_delivery_events, internal_notes, conversation_tags, saved_replies.
- Migration 4 (system): notifications, audit_logs, webhook_events (unique event id), integration_events, background_jobs, and Phase 2 placeholder tables (ai_settings, knowledge_documents, knowledge_chunks, automation_rules, automation_runs, role_permissions).
- Every table has a workspace_id foreign key, GRANTs, RLS turned on, and policies built on the helper functions. On insert, workspace_id is checked against the user's membership so changing the ID in a request can't reach another workspace.
- Agents only see conversations assigned to them or in queues the Admin has allowed (a workspace setting).
- Audit rows are written by triggers. Indexes cover inbox sorting (workspace_id, last_message_at desc) and a trigram search index. Lists use cursor pagination.
- Invitations: an Admin-only server function creates a pending invite, and the invitee signs up and joins the workspace by token. Sending the invite email needs an email domain to be set up. Until then, the invite link can be copied.
- Tests: Vitest tests for role and permission rules, plus RLS checks that an Agent cannot read unassigned conversations or another workspace's data. Playwright smoke tests cover sign-in, contact create/edit, lead create, booking create, and task complete on a phone-sized screen.
- An AGENTS.md section and a docs/migrations.md file document the setup.
