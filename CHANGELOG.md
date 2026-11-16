# Changelog

All notable changes to this project. Dates are release (merge) dates; database migrations are listed
per release and are idempotent and non-destructive unless stated otherwise.

## 2026-11-16 — Inbox media, online booking, inbox speed tools, AI documents

**New**

- Inbox: send and receive photos, videos, voice notes and files (website chat, Telegram, Facebook
  Messenger, Instagram, WhatsApp Cloud API). Files are stored privately per conversation.
- Services & online booking: define what customers can book (time slots or nights, opening hours,
  capacity, price) and share a public, mobile-first booking page at `/book/<business>`.
  Overbooking is prevented in the database.
- Inbox speed tools: keyboard shortcuts (press `?`), snooze, bulk actions and live
  "viewing / typing" indicators for teammates.
- AI knowledge from documents: upload PDF, Word (.docx), text, Markdown, CSV or HTML. Large
  knowledge bases send only the passages relevant to each conversation to the AI.

**Fixed**

- People who belong to several businesses: notifications are now shown per business, a
  "Choose a business" screen appears when none is selected on a device, and the current business
  is always shown in the top bar.

**Database**: migrations 0032–0035.

## 2026-11-15 — Interface polish

- Dark mode (light / dark / automatic), global search across contacts, conversations and bookings,
  clearer channel health on the dashboard, settings quick links and a clearer status chart.

## 2026-11 — SaaS foundations

**For TukTuk24 (no change in daily use expected)**

- Your Gmail, WhatsApp number and website stay connected exactly as before; they are now locked to
  your workspace so no future customer business can ever reach them.
- Social Planner now states clearly that posts are not published automatically yet.

**New**

- Businesses can be created from `/onboarding` (public signup still off until you enable it).
- People in several businesses can switch between them from the account menu.
- "Plan & usage" page for admins/managers shows limits and this month's usage.
- Platform console: search businesses, change plans, suspend/reactivate (all audited), monthly usage.
- Setup checklist on the dashboard for new businesses.

**Security**

- Workspace admins can no longer change their own plan or limits through the API.
- Records can't be linked across businesses, even by server code.
- Suspended businesses are locked at the database level.
- AI requests are counted per business and capped by plan for platform-paid AI.

**Also included**

- Channels: Telegram bots; website live chat widget.
- Social: scheduled posts publish to connected Facebook Pages and Instagram (after Meta approval).
- Billing: Stripe checkout and billing portal (appears once Stripe is configured).
- Team: Schedule page — shifts, time off, swaps, clock in/out.
- CRM: CSV import with duplicate skipping, duplicate finder, custom contact fields.
- Automations: workflows with triggers, conditions, delays and actions, plus ready-made recipes.
- AI: approval mode (AI drafts wait for your OK), automatic intent/mood labels.
- Privacy: full data export, scheduled workspace deletion, ownership transfer, message retention.
- Security: MFA recovery codes; time-limited support access you control; platform health views.
- Businesses outside tourism no longer see tour-only tools; messages use their own business name.

**Database**: migrations 0019–0030 (idempotent, non-destructive). Regenerate types after applying.
