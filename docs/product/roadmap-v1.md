# Roadmap

## SaaS + full social media control (plan approved 2026-10-11)

- [x] social_posts table + Social Planner page (/social) — draft & schedule posts
- [x] workspaces.plan + Platform console (/platform) — owner sees all businesses, sets plans
- [ ] Self-serve signup + workspace creation flow
- [ ] PayPal billing (needs owner's PayPal app Client ID/Secret)
- [ ] Social publishing/comments live — BLOCKED on Meta app credentials + Meta app review
- [ ] Public booking page + PayPal deposits
- [ ] Review requests, chat widget, canned replies UI, SLA rules, reports export

## Current branding request

- [x] Replace shared branding and install icons with the uploaded logo, preserving proportions.
- [x] Verify new artwork loads and fits the sign-in screen.

## Audit backlog (2026-10-11)

- [x] T1 Two-step gate fails closed
- [x] T2 No self-disable; add-new-phone flow; admin reset (audited)
- [x] T3 WhatsApp phone-app replies shown in inbox
- [x] T4 Stuck webhook events capped at 10 attempts
- [x] T5 Background sync every 5 min (live after publish)
- [x] T6 Deleted website bookings stay deleted
- [ ] T7 BLOCKED: automated phone check stops at mandatory two-step sign-in; owner to check pages on phone
- [ ] T8 BLOCKED: Agent-role test needs a second invited account
- [x] T9 Integration health alerts (notification to admins/managers, once a day per broken channel)
- [x] T15 Guest data export (contact page, logged in audit)
- [ ] T10/T17/T18 BLOCKED: Meta app credentials + Meta app review (Instagram, Messenger, comments, posting)
- [ ] T11 BLOCKED: owner's own AI provider key
- [ ] T12 BLOCKED: email sending domain setup
- [ ] T13 BLOCKED: real tour price list
- [ ] T19 BLOCKED: Google Business Profile access
- [ ] T14 Skipped: no built-in rate limiting; receivers already reject unsigned calls
- [ ] T16 Optional: presence / driver view
- [x] Knowledge Base
- [x] AI settings + AI Assistant page
- [x] AI in inbox: draft reply, translate, summarize
- [x] Analytics & Reports with export
- [x] Automations: auto-assign by channel
- [x] Bring-your-own AI model (admin panel, encrypted key)
- [x] WhatsApp / Messenger / Instagram connect from admin panel (webhook + send)
- [ ] WAITING: owner to enter Meta credentials and test live
- [x] Email channel — Gmail tuktuklisbon24@gmail.com (sync while Inbox open, replies in thread)
- [ ] BLOCKED: invite emails & push/email reminders — need email domain

## Done

- Invite-only access: public sign-ups off; accounts only via admin invitation links (Team page); invitees set their own password by email.
- [x] Tour calendar & fleet dispatch (/dispatch)
- [x] Quick tour quotes in inbox composer (packages, guests → tuk tuks, € total, insert into reply)

- [x] Multiple accounts per channel (WhatsApp/Instagram/Messenger), account names, inbox filter + badges, replies sent from the receiving account
- Multiple Gmail inboxes via App Password (IMAP/SMTP) — done
- [x] WhatsApp message templates (follow up after 24h window)
- [x] Mandatory two-step sign-in (authenticator app) for all team accounts
- [x] Inbox translate: guest messages + my reply, language picker

## AI Operator (Away mode)

- [x] Away-mode AI Operator: replies, tentative bookings, tags/assign, alerts, activity log
- [ ] Owner to test live after publishing (runs every 5 min on live app)

## Connect Account upgrade (2026-10-14)

- [x] + Connect Account sheet (inbox header, empty inbox, Connected accounts page) with real per-provider status
- [x] One-click "Continue with Facebook" connect for Instagram/Messenger built
- [ ] WAITING on owner: create Meta app once (App ID + Secret) and pass Meta app review for live use
- [ ] Telegram, Outlook connectors (not built yet); TikTok/LinkedIn need partner approval
- [x] Website card in Connect Account sheet (live status, Sync now); WhatsApp/Gmail "add another" from the same sheet
- [x] Automation Hub (n8n/Make) inbound/outbound + downloadable workflow

## Guest automations (2026-10-25)

- [x] Evening-before WhatsApp reminder (19:00, map pin, guide, ticket) — toggle on Tour Calendar
- [x] Review request 2h after tour (Google/TripAdvisor links) — toggle on Tour Calendar
- [x] Saved replies in inbox (Replies button), editable in Knowledge
- [ ] Voice note transcription (next)
