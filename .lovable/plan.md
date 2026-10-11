# Tuk Tuk 24 Lisbon — Project Audit and Completion Backlog

This was a read-only audit. Nothing in the app, its data or its settings was changed. Approving this plan only approves the backlog in section J. Work then starts with the first task.

## A. Executive summary
The core of the platform exists and is backed by real data. That covers the shared inbox, contacts, leads, bookings, tasks, the tour calendar, team roles, the audit log and invite-only sign-in. Two channels have live evidence: **WhatsApp** (your main number) and the **main Gmail inbox**. Instagram, Messenger, extra Gmail inboxes and your own AI model are built, but none of them has ever been connected. There is only **one active team member**, so team permissions have never been tested with real staff. There are **two security gaps in two-step sign-in**. Those come first.

## B. Current architecture
- Web app on TanStack Start, running on edge workers. Lovable Cloud provides the database, sign-in and live updates.
- All business data is tied to one workspace. Database row rules (`is_member`, `has_ws_role`, `can_view_conversation`) control who can see what.
- 28 server functions across ai, admin, website, wa-templates and invite. Sensitive work runs only on the server.
- Two public message receivers (`/api/public/whatsapp/webhook` and `/api/public/webhooks/meta/$workspaceId`). Both check a signature before accepting anything.
- Saved credentials are encrypted (AES-GCM) in a table the browser cannot read.
- No scheduled background jobs. Gmail and website syncs only run while someone has the Inbox or Calendar page open.

## C. Feature summary table
| Feature | Current status | Evidence | Remaining work | Priority |
|---|---|---|---|---|
| Invite-only sign-in | Verified in code | Sign-up off; accounts only created by redeeming an invite | Test with a real invited teammate | P1 |
| Two-step sign-in | Partial, with security gaps | Gate lets people through if the check fails (mfa-gate.tsx:165); "turn off" button in Settings | Block on error; remove or restrict self-disable | P0 |
| WhatsApp main number | Verified live | 9 real incoming events; 2 inbound messages; sent/delivered/read statuses stored | Import messages sent from the phone app; clear the one stuck event | P1 |
| Main Gmail | Verified working | Connection marked connected; email conversations exist | Sync only runs while Inbox is open | P1 |
| Extra Gmail inboxes | Built, never used | 0 saved credentials | Test with a real App Password | P2 |
| Instagram / Messenger | Built, not connected | Both "not_connected"; 0 Meta credentials | Needs your Meta app setup | P2 (blocked) |
| Shared inbox, assign, notes | Working | 12 conversations, 33 messages; database rules enforce assignment | Test the Agent role with a real second account | P1 |
| Contacts, leads, tasks | Working (CRUD under database rules) | Tables and policies present | No real leads yet | P3 |
| Bookings, calendar, website sync | Working | 30 bookings imported from the website | Sync only while the page is open | P2 |
| AI drafts and summaries | Working on built-in AI | Provider is the built-in one | Using your own AI model is still unverified | P2 |
| Automations | Minimal | Only one rule type: auto-assign new conversations | More triggers (optional) | P3 |
| Analytics and dashboard | Working | Figures come from real data | — | — |
| Reminders and alerts (email/push) | Missing | No email domain, no push | Needs email sending set up | P2 |
| Phone layout | Fixed recently | Dashboard checked at 384px | Check every page on a phone | P1 |

## D. Verified functionality
WhatsApp inbound messages and delivery statuses. Main Gmail sync. Website booking import (30 bookings). Signed message receivers. Encrypted credential storage. Invite-only sign-in. Latest security scan with 0 findings. 33 automated tests.

## E. Partial functionality
Instagram and Messenger. Extra Gmail inboxes. Your own AI model. Reminders. Sample tour prices in quotes are placeholders, not your real prices.

## F. Defects
1. If the two-step check fails to load, the app lets the person in anyway (fail open).
2. Messages you send from the WhatsApp Business app on your phone (`smb_message_echoes`) are stored but never shown in the inbox, so conversation history is incomplete.
3. One WhatsApp status event is stuck ("waiting for sent message", 8 attempts) and will be retried again and again.
4. Gmail and website syncs stop completely when nobody has the app open, so emails and bookings arrive late.
5. Deleting a booking that came from the website brings it back on the next sync.

## G. Security and data protection
- **P0:** The two-step sign-in gate fails open, and any user can turn their own two-step sign-in off even though it is meant to be mandatory.
- **P1:** The public message receivers have no rate limit. They reject unsigned requests, so the risk is low.
- **P2:** No written data-retention or delete-on-request policy. Anonymizing a contact (`anonymize_contact`) is possible, but there is no export for a customer who asks for their data.
- Fine as it is: credentials are encrypted and never sent to the browser; incoming events are de-duplicated; each workspace's data is isolated; messages created in the app can only be marked `logged`.
- Not checked: database backups (handled by the platform, not visible here) and live sign-in as an Agent (needs a second account).

## H. Missing essential features
Scheduled background sync that runs when nobody is online (essential). Integration health alerts when a channel breaks (essential). Email notifications for invites and reminders (recommended; blocked on email sending). Multiple businesses in one app and subscription billing are outside the scope of an internal tool.

## I. Optional enhancements
Live "someone else is replying" indicator, driver-only view, automatic review requests, payment links, offline support.

## J. Prioritized backlog

**Fix existing functionality**
| ID | Area | Priority | Size | Order | Done when |
|---|---|---|---|---|---|
| T1 | Two-step gate fails closed on errors | P0 | S | 1 | A simulated check failure shows a "retry" screen, not the app |
| T2 | Turning two-step off only possible by resetting your phone, with an admin-only reset | P0 | S | 2 | No self-disable without re-setup; admin reset is logged in the audit log |
| T3 | Show messages sent from the WhatsApp phone app | P1 | S | 3 | Replies sent from the phone appear in the conversation |
| T4 | Stuck event: stop retrying after a limit | P1 | S | 4 | No unprocessed event stays stuck past the limit |
| T5 | Scheduled sync for Gmail, extra inboxes and website (cron route with a secret) | P1 | M | 5 | New email or booking appears with the app closed |
| T6 | Synced booking deleted in the app stays deleted | P2 | S | 6 | A deleted booking does not come back on the next sync |
| T7 | Phone check of every page | P1 | M | 7 | Screenshots at 384px with no sideways scrolling |
| T8 | Test the Agent role with a real invited account | P1 | S | 8 | Agent sees only allowed conversations (needs you to invite one person) |

**New or blocked features**
| ID | Area | Priority | Size | Depends on |
|---|---|---|---|---|
| T9 | Integration health page plus alert after repeated failures | P2 | M | T5 |
| T10 | Instagram and Messenger go-live | P2 | M | Your Meta app credentials |
| T11 | Test your own AI model | P2 | S | Your provider and key |
| T12 | Email sending for invites and reminders on tuktuk24team.xyz | P2 | M | Email domain setup |
| T13 | Real tour packages and prices for quotes | P2 | S | Your price list |
| T14 | Rate limit on the message receivers | P3 | S | — |
| T15 | Customer data export and retention policy | P3 | M | — |
| T16 | Presence and collision warning; driver view | P4 | L | — |
| T17 | Social media management: Instagram and Facebook comments in the shared inbox (read, reply, hide) | P2 | M | T10 (Meta app with comment permissions) |
| T18 | Post scheduler: write, schedule and publish posts to Instagram and your Facebook Page, with a content calendar | P3 | L | T10 plus Meta app review for publishing permissions |
| T19 | Google Business reviews: read and reply | P3 | M | Google Business Profile access |

**About social media management (T17 to T19):** none of this exists today. The app currently handles private messages only. Comments and posting go through the same Meta app as Instagram and Messenger messages, but they need extra permissions that Meta must approve (app review, which usually takes several days to a few weeks). Recommended order: comments first, because guests ask about tours in comments, then scheduled posting. TikTok posting is possible later, but TikTok has its own approval process.

## K. Phases
1. Security: T1, T2.
2. Reliability: T3 to T6.
3. Launch check: T7, T8, then publish.
4. Channel expansion: T9 to T13.
5. Extras: T14 to T16.

## L. Launch readiness
The app is **not ready to launch with a team yet**. It is usable by you alone today. It is ready for staff once phases 1 to 3 are done, after the two-step fixes and an Agent test. No completion percentage is given, because there is no fixed requirement list to measure against.

## M. What prevented a full assessment
- There is only one user account, so the Agent and Manager roles could not be tried live.
- No Meta, IMAP or custom-AI credentials exist, so those paths are untested.
- No real messages were sent during the audit, by design.
- Platform backups are not visible from here.

## Tracking checklist
- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8
- [ ] T9 · [ ] T10 · [ ] T11 · [ ] T12 · [ ] T13 · [ ] T14 · [ ] T15 · [ ] T16

## Most important next task
**T1 and T2, two-step sign-in hardening.** Today, a failed check lets people in, and anyone can switch the protection off. That defeats the main security promise for a team app with customer data, and the fix is small.
