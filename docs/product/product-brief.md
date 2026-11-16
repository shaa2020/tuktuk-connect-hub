# Product Brief (v1)

> The original requirements document used to scope the first version of the platform for
> Tuk Tuk 24 Lisbon. Kept for reference; the current plan is in [roadmap.md](roadmap.md) and
> the implemented scope in [feature-inventory.md](feature-inventory.md).

PROJECT: TUK TUK 24 LISBON — UNIFIED CUSTOMER COMMUNICATION PLATFORM

Act as a senior full-stack engineer, SaaS product architect, UI/UX designer, database engineer, security specialist, and AI integration engineer.

Build a production-oriented, premium unified customer communication platform for my business, Tuk Tuk 24 Lisbon, which operates tuk-tuk tours in Lisbon, Portugal.

The application must bring customer conversations from supported communication channels into one organized workspace. My team should be able to read and reply to messages, manage leads, view booking information, assign conversations, collaborate internally, and use AI to improve customer service.

I will primarily use this application on my Android phone, but it must work exceptionally well on iPhones, tablets, laptops, and desktop computers.

Do not build just a static prototype. Build a real, secure, database-connected application with working functionality.

1. CORE DEVELOPMENT RULES

Follow these rules throughout development:

1. Build the application in small, verifiable phases.

2. Implement real functionality wherever the required backend credentials and platform permissions are available.

3. Never claim that a social media integration works until it has been connected and tested successfully.

4. Never use fake messages, simulated delivery statuses, or hardcoded analytics as if they were real customer data.

5. Demo data may be used only when clearly identified as demo data.

6. Never expose API secrets, private access tokens, service-role keys, or other credentials in frontend code.

7. Use secure backend functions for privileged operations and external API calls.

8. Validate all user input on the server.

9. Apply appropriate database access controls to every private business resource.

10. Make all essential actions work on mobile devices.

11. Display useful loading, success, empty, offline, and error states.

12. Do not silently discard customer messages or user changes.

13. Do not mark a message as delivered unless the channel confirms delivery.

14. Do not claim an integration is connected merely because its settings screen exists.

15. Never replace a failing backend operation with a fake successful response.

16. If an external integration requires additional permissions, verification, business approval, or credentials, clearly explain what is missing.

17. Preserve existing working functionality when adding features.

18. Do not stop after creating the visual layout. Connect the interface to the backend and test the important user journeys.

19. TECHNOLOGY STACK

Use the following architecture where supported by the development environment.

Frontend

- React.

- TypeScript.

- A modern, maintainable component architecture.

- Responsive CSS and accessible UI components.

- A consistent design system.

- Client-side routing.

- Form validation.

- Reusable hooks and service modules.

- Appropriate loading and error handling.

Backend

Use Supabase for:

- Authentication.

- PostgreSQL database.

- Row Level Security.

- Secure server-side functions.

- Realtime updates where appropriate.

- File storage for authorized uploads.

- Scheduled jobs or an external job runner when necessary.

Use Supabase Edge Functions or another secure backend service for:

- Social platform API requests.

- Webhook processing.

- AI requests.

- Message delivery.

- Background tasks.

- Integration diagnostics.

- Privileged operations.

Do not make privileged API requests directly from the browser.

AI

Use an approved Gemini API integration or another configurable AI provider.

AI requests must go through a secure backend function. Store API keys as server-side secrets.

Development approach

Inspect the current project before modifying it. Reuse existing working code where possible. Establish a clear project structure, environment configuration, database migrations, and setup documentation.

If a required feature cannot be completed with the available environment, explain the limitation and implement the most appropriate secure foundation without pretending it is finished.

3. PREMIUM DESIGN SYSTEM

Create a premium SaaS interface that feels professional, modern, fast, elegant, and exceptionally easy to use.

The design should feel appropriate for a serious international tourism business.

Brand identity

Business name: Tuk Tuk 24 Lisbon.

Use a refined visual identity inspired by Lisbon's warm architecture and contemporary SaaS products.

Color palette

- Primary dark navy: #14213D

- Primary blue: #2563EB

- Secondary teal: #0F766E

- Background: #F7F8FC

- Main surface: #FFFFFF

- Main text: #172033

- Secondary text: #667085

- Border: #E5E7EB

- Success: #16A34A

- Warning: #D97706

- Error: #DC2626

- Information: #0284C7

Use colors consistently. Ensure sufficient contrast and accessible text sizes.

Visual style

- Clean, spacious layouts.

- Refined typography.

- Consistent spacing.

- Rounded cards and panels.

- Subtle borders and shadows.

- Clear hierarchy.

- Modern icons.

- Professional tables and data visualizations.

- Polished empty states.

- Restrained animation.

- Clear focus and hover states.

- Consistent status badges.

- No unnecessary gradients or excessive decoration.

- No oversized desktop-only layouts on mobile.

Interaction quality

Every visible button, menu, filter, tab, form, and interactive control must have a defined purpose.

Avoid decorative controls that do nothing.

Use confirmation dialogs for destructive actions. Provide clear feedback after successful operations and helpful explanations when something fails.

4. AUTHENTICATION AND BUSINESS WORKSPACES

Implement secure authentication using Supabase Auth.

Support:

- Email and password sign-in.

- Password reset.

- Email verification where configured.

- Secure session handling.

- Sign-out.

- Session expiration handling.

- Invitation-based team membership.

- Protected routes.

- Appropriate account recovery flows.

Do not allow an unauthenticated user to access private conversations, customer information, bookings, or business settings.

Business workspace

Structure the system around a business workspace so the application can support multiple authorized team members.

Each private business record must belong to the appropriate workspace.

Enforce workspace boundaries in the database, not just in the frontend.

A user must not be able to change a workspace ID in a request to access another business's records.

5. TEAM ROLES AND PERMISSIONS

Create these roles:

Superadmin

Responsible for platform-wide administration when the application genuinely operates as a multi-business platform.

Permissions:

- Manage platform-level configuration.

- Manage business workspaces.

- View system health and integration diagnostics.

- Manage platform-level user access where authorized.

- Review audit events.

- Configure platform-wide feature availability.

Do not expose customer content across unrelated businesses without explicit authorization and a legitimate operational need.

Business Admin

Responsible for Tuk Tuk 24 Lisbon.

Permissions:

- Manage workspace settings.

- Invite, deactivate, and manage team members.

- Connect and disconnect authorized integrations.

- Manage business-specific AI instructions and knowledge.

- View all workspace conversations.

- Assign conversations.

- Manage contacts, leads, bookings, and reports.

- Configure business automations.

- Review audit logs.

- Configure notification preferences.

Manager

Permissions:

- View team conversations.

- Assign or reassign conversations.

- Monitor team performance.

- Manage contacts and leads.

- View booking details allowed by workspace policy.

- Add internal notes.

- Review reports.

- Manage operational queues.

- Escalate conversations.

Managers must not be able to change sensitive platform settings unless explicitly authorized.

Agent

Permissions:

- View assigned conversations and other queues explicitly allowed by the administrator.

- Reply through connected channels.

- Use AI-assisted drafting and translation.

- Add internal notes.

- Update permitted contact and lead information.

- Change conversation status when authorized.

- View relevant customer and booking information.

Agents must not manage billing, secrets, platform configuration, or other users' permissions unless separately granted.

Permission enforcement

Implement role checks in backend operations and database policies.

Hiding a button is not a security boundary.

Test attempts to access unauthorized records and perform unauthorized operations.

6. APPLICATION NAVIGATION

Create the following main sections:

1. Home Dashboard.

2. Unified Inbox.

3. Contacts.

4. Leads.

5. Bookings.

6. Tasks.

7. Automations.

8. AI Assistant.

9. Analytics and Reports.

10. Team.

11. Integrations.

12. Knowledge Base.

13. Notifications.

14. Settings.

15. Audit Log, restricted to authorized roles.

On desktop, use a collapsible sidebar.

On mobile, use a compact bottom navigation for the most important sections:

- Home.

- Inbox.

- Contacts.

- Leads.

- More.

Put secondary sections under More.

Display unread counts and relevant notification indicators without overcrowding the interface.

Navigation must remain consistent across the application.

7. HOME DASHBOARD

Build a real dashboard using actual database data.

Include:

- Total conversations.

- Open conversations.

- Unread conversations.

- Conversations awaiting a reply.

- Average first-response time.

- Average resolution time.

- New leads.

- Leads requiring follow-up.

- Upcoming bookings.

- Conversations by channel.

- Conversations by status.

- Recent customer activity.

- Recent booking activity.

- Team workload.

- Integration health.

- Recent errors or failed message deliveries.

Allow users to filter supported reports by date range, channel, team member, and status.

Only display metrics that can be calculated correctly from available data.

If a metric lacks sufficient data, show an honest unavailable or insufficient-data state.

Use appropriate charts and compact cards. Make the dashboard responsive.

8. UNIFIED INBOX

This is the application's most important feature.

Create a central inbox for conversations from connected and authorized channels.

Conversation list

Include:

- Customer name.

- Customer avatar when available.

- Channel icon.

- Last message preview.

- Last activity time.

- Unread indicator.

- Conversation status.

- Assigned team member.

- Priority.

- Labels.

- Booking or lead indicator where applicable.

Inbox filters

Provide:

- All conversations.

- My conversations.

- Unassigned.

- Unread.

- Open.

- Waiting for customer.

- Waiting for team.

- Resolved.

- High priority.

- Failed messages.

- Filter by channel.

- Filter by assignee.

- Filter by label.

- Filter by date.

Search

Search available authorized records by:

- Customer name.

- Customer email.

- Customer phone number.

- Conversation content, where supported.

- Booking reference.

- Lead information.

Respect access permissions in search results.

Conversation actions

Support:

- Assign to a team member.

- Change status.

- Mark unread or read.

- Change priority.

- Add labels.

- Add internal notes.

- Link an existing contact.

- Create a new contact.

- Link a booking.

- Link a lead.

- Create a follow-up task.

- Escalate a conversation.

- View message delivery status.

- Open customer details.

- View authorized conversation history.

Conversation statuses

Use a consistent workflow:

- Open.

- In progress.

- Waiting for customer.

- Waiting for team.

- Resolved.

- Archived.

Use appropriate permissions and audit logging for important changes.

Message composer

Support:

- Text messages.

- Emoji.

- Multiline input.

- Keyboard-friendly sending.

- Draft preservation.

- Attachment selection where the channel supports it.

- AI-assisted drafting.

- Translation.

- Clear send status.

- Retry after a genuine delivery failure.

Do not show an attachment option for a channel unless that type of attachment is supported.

Show the actual channel restrictions when necessary.

Message states

Represent states accurately:

- Draft.

- Queued.

- Sending.

- Sent.

- Delivered, when confirmed by the platform.

- Read, when a supported read receipt is received.

- Failed.

- Delivery unknown.

Never infer a delivery receipt from a successful HTTP request alone.

Internal notes

Internal notes must be visually distinct from customer-facing messages.

Internal notes must never be sent to the customer through a social platform.

Apply backend permissions to prevent unauthorized users from reading or adding notes when the business's policy restricts them.

Real-time updates

Use Supabase Realtime or an appropriate secure event mechanism for:

- New conversations.

- Incoming messages.

- Assignment changes.

- Status changes.

- Internal notes.

- Relevant notification updates.

Avoid duplicating messages when both realtime events and webhook updates arrive.

9. CONTACT MANAGEMENT

Build a proper customer database.

Each contact can include:

- Full name.

- Preferred name.

- Email.

- Phone number.

- Preferred language.

- Country.

- Communication preferences.

- Labels.

- Internal notes.

- Lead status.

- Booking relationships.

- Connected social identities.

- Conversation history.

- Created date.

- Last interaction date.

- Assigned team member, when applicable.

Support:

- Create contacts.

- Edit contacts.

- Search and filter.

- Merge duplicate contacts with confirmation.

- View interaction history.

- Link or unlink authorized conversations.

- Export permitted data.

- Delete or anonymize data where appropriate.

- Record applicable consent and communication preferences.

Identity matching

Do not automatically merge two people just because they share a display name.

Use reliable identifiers such as verified email, phone number, or platform-specific identifiers where appropriate.

When a match is uncertain, request human confirmation.

Keep platform identities linked to the correct contact.

Do not assume that a person using the same name on two social networks is necessarily the same person.

10. LEAD MANAGEMENT

Create a lightweight CRM pipeline for tourism inquiries.

Suggested stages:

- New.

- Contacted.

- Qualified.

- Quote requested.

- Quote sent.

- Awaiting customer.

- Won.

- Lost.

Allow authorized users to:

- Create leads manually.

- Create a lead from a conversation.

- Link leads to contacts.

- Record tour interest.

- Record group size.

- Record preferred date.

- Record preferred language.

- Record budget where supplied.

- Record the requested tour duration.

- Add notes.

- Assign an owner.

- Schedule a follow-up.

- Update the lead stage.

- View associated conversations.

- Link a booking.

- Record the reason a lead was lost.

Do not invent missing customer details.

Clearly distinguish information provided by the customer from AI-generated suggestions.

11. BOOKING INFORMATION

Create a booking overview and customer booking panel.

Support fields appropriate to the business:

- Booking reference.

- Customer or contact.

- Tour name.

- Tour date.

- Start time.

- Duration.

- Number of guests.

- Language requested.

- Pickup location.

- Booking status.

- Amount and currency where applicable.

- Payment status when available.

- Booking notes.

- Associated lead.

- Associated conversations.

- Source system.

- External booking reference.

Allow authorized users to create and update bookings manually.

If an external booking system is connected, synchronize data through its authorized API or webhook.

Do not pretend a booking is confirmed because someone mentioned a date in a conversation.

Clearly distinguish:

- Inquiry.

- Quote.

- Tentative booking.

- Confirmed booking.

- Cancelled booking.

- Completed booking.

Do not store payment-card details.

Do not mark a payment as successful unless a trusted payment provider or authorized booking system confirms it.

12. TASKS AND FOLLOW-UPS

Build a task management feature.

Each task can include:

- Title.

- Description.

- Assigned team member.

- Due date and time.

- Priority.

- Status.

- Related contact.

- Related conversation.

- Related lead.

- Related booking.

- Created by.

- Completion timestamp.

Support:

- Create task.

- Assign task.

- Change due date.

- Complete task.

- Reopen task.

- View overdue tasks.

- View my tasks.

- View team tasks.

Display overdue tasks clearly.

If reminders are enabled, deliver them through a real supported notification mechanism.

Do not rely on a browser tab remaining open for critical reminders.

13. DATABASE DESIGN

Create normalized database tables with appropriate indexes, constraints, timestamps, and foreign keys.

At minimum, design the following entities:

- workspaces

- profiles

- workspace_members

- role_permissions

- channels

- channel_connections

- external_identities

- contacts

- contact_consents

- conversations

- conversation_participants

- conversation_assignments

- messages

- message_attachments

- message_delivery_events

- internal_notes

- tags

- contact_tags

- conversation_tags

- leads

- lead_activities

- bookings

- tasks

- task_relations

- saved_replies

- automation_rules

- automation_runs

- ai_settings

- knowledge_documents

- knowledge_chunks

- notifications

- integration_events

- webhook_events

- audit_logs

- background_jobs

Adjust the schema when implementation details require it.

Database requirements

- Use UUIDs or another suitable stable identifier.

- Use UTC timestamps for stored event times.

- Display dates in the user's selected timezone.

- Preserve original external message IDs.

- Enforce uniqueness where needed to prevent duplicate imports.

- Index frequently filtered and joined fields.

- Use transactions for operations that must succeed or fail together.

- Use appropriate foreign-key constraints.

- Store webhook event IDs or reliable idempotency keys.

- Avoid unnecessary duplication of customer data.

- Keep a record of relevant status transitions.

- Create versioned SQL migrations.

- Include indexes for inbox sorting and searching.

- Paginate conversation and message history.

- Never load an unlimited conversation history into one request.

14. ROW LEVEL SECURITY AND PRIVACY

Enable and test Row Level Security for all tables containing private business data.

Policies must enforce:

- Workspace membership.

- Role-based access.

- Authorized record visibility.

- Appropriate write permissions.

- Appropriate administrative privileges.

Users must not be able to bypass these rules by directly querying the database.

Keep privileged operations in secure server-side functions.

Never expose a Supabase service-role key in the frontend.

Do not place private access tokens in browser storage.

Protect sensitive information in logs.

Use audit logs for important actions, including:

- Authentication and access changes where available.

- Role changes.

- Integration changes.

- Conversation assignment changes.

- Lead and booking changes.

- Data exports.

- Deletion operations.

- Administrative configuration changes.

Apply data minimization and suitable retention policies.

15. PHASE 1 IMPLEMENTATION ORDER

Start by implementing the following:

1. Inspect the project and establish the application structure.

2. Create the design system.

3. Build the responsive application shell.

4. Implement Supabase authentication.

5. Create database migrations.

6. Implement workspaces and team membership.

7. Configure Row Level Security.

8. Build the Home Dashboard.

9. Build the Unified Inbox interface.

10. Implement contacts.

11. Implement leads.

12. Implement booking records.

13. Implement tasks.

14. Add internal notes and assignments.

15. Add real-time updates where appropriate.

16. Add loading, empty, offline, and error states.

17. Test access control and core workflows.

At this stage, use clearly identified sample records only if needed to demonstrate the interface. Do not present sample records as real customer conversations.

Do not begin by creating every integration screen while leaving the database and core application nonfunctional.

16. PHASE 1 ACCEPTANCE CRITERIA

Phase 1 is complete only when:

- A user can sign in securely.

- Unauthorized users cannot access private pages.

- Workspace boundaries are enforced.

- Roles and permissions are enforced by the backend.

- Contacts can be created, edited, searched, and viewed.

- Leads can be created, assigned, and updated.

- Booking records can be created and linked to contacts.

- Tasks can be created and completed.

- Conversations can be assigned and updated.

- Internal notes remain private.

- The interface works on mobile and desktop.

- Errors are visible and understandable.

- Database migrations are documented.

- Important operations have been tested.

- No fake external integration is represented as connected.

After implementing Phase 1, report what is working, what has been tested, what remains incomplete, and which credentials or configuration are needed for the next phase.
