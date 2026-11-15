# Feature Inventory

_Verified against source code, migrations and automated tests on 2026-11-15. Historical roadmap
entries were **not** taken at face value._

**Status legend**

| Code | Meaning |
|---|---|
| ✅ **Verified** | Code exists and an automated test in this repo exercises it (unit or database test). |
| 🟡 **Implemented, not verified** | Code exists and builds, but no automated test or live check in this environment (most live integrations: no credentials here). |
| 🟠 **Partial** | Some of the requirement exists; gaps listed. |
| ❌ **Missing** | Not in the code. |
| ⛔ **Blocked** | Needs an external account, credential, approval or owner decision. |

> "Verified" never means "verified live in production" — this environment has no production
> access and no third-party credentials. Live verification is tracked in `docs/BLOCKERS.md`.

## 1. Multi-tenant SaaS foundations

| Feature | Status | Evidence / gaps |
|---|---|---|
| Workspace data isolation (RLS) | ✅ | `db-tests/tenant-isolation.test.ts` (29 tests: reads, writes, links, roles) |
| Cross-workspace reference guard | ✅ | same file; 3 tests fail on pre-0019 schema |
| Tenants cannot change own plan/limits/flags | ✅ | same file (failed before 0019 — real defect fixed) |
| Roles admin / manager / agent | ✅ | RLS + `domain.test.ts` |
| Workspace owner | 🟡 | `workspaces.owner_id` set by `create_workspace`; no owner-transfer UI yet |
| Custom roles | ❌ | Roles are a fixed enum |
| Invitations | 🟡 | `invite.functions.ts`, Team page; invite emails ⛔ need email domain |
| Self-service registration | 🟠⛔ | `/signup` built behind `VITE_PUBLIC_SIGNUP`; Supabase "allow signups" is OFF (owner decision) |
| Email verification | 🟡 | Supabase Auth; `create_workspace` refuses unverified emails ✅ (db test) |
| Workspace creation | ✅ | `create_workspace` RPC — 5 db tests; `/onboarding` UI 🟡 |
| Multiple workspaces per user + switching | 🟡 | `use-workspace.tsx` + switcher; not browser-tested with live data |
| Password recovery | 🟡 | `/auth?mode=forgot`, `/reset-password` |
| Mandatory MFA (TOTP) + admin reset | 🟡 | `mfa-gate.tsx`, `resetMemberMfa` (audited). Self-service recovery codes ❌ |
| Plans & entitlements | ✅ | `db-tests/saas-foundations.test.ts`; prices ⛔ owner decision |
| Usage metering (AI) | ✅ | `consume_usage` db test + `tenancy.test.ts` |
| Usage dashboard | 🟡 | `/billing` |
| Subscription billing | ❌⛔ | Tables only; provider not chosen/configured (Phase 3) |
| Workspace suspension | ✅ | db test (lock-out + audit); background jobs skip suspended 🟡 |
| Platform admin console | 🟡 | `/platform` via audited RPCs (RPCs ✅ tested) |
| Support impersonation | ❌ | Deliberately not built yet (needs consent + time-limit design) |
| Workspace branding | ❌ | `brand_color` column only; UI strings hard-code TukTuk24 |
| Workspace-specific AI config | ✅🟡 | `ai_settings` per workspace; prompts no longer inject TukTuk24 playbook into other tenants |

## 2. Multi-channel inbox

| Feature | Status | Evidence / gaps |
|---|---|---|
| Unified inbox, assignment, notes, status, priority | 🟡 | `inbox.tsx` (908 lines), RLS ✅ |
| Agents see only own/unassigned conversations | ✅ | db test |
| No fake delivery statuses | ✅ | db test (`messages` insert must be `logged`) |
| WhatsApp (operator, Lovable connector) | 🟡 | live for TukTuk24 per roadmap; not verifiable here |
| WhatsApp / Messenger / Instagram (BYO Meta app) | 🟡⛔ | code complete (`channels.server.ts`, webhook w/ signature); Meta app + App Review needed |
| Gmail (operator, Lovable connector) | 🟡 | operator-only since 0019 guard ✅ (unit test) |
| Extra Gmail via IMAP/SMTP app password | 🟡 | `imap-mail.server.ts` (+ unit tests of parsing) |
| Gmail OAuth for tenants | ❌ | needed for SaaS (Google verification ⛔) |
| Microsoft Outlook | ❌ | |
| Telegram | ❌ | (listed as "coming soon" in connect sheet) |
| Website live chat | ❌ | |
| Automation Hub (n8n/Make) generic channel | 🟡 | HMAC-signed inbound/outbound |
| Attachments / media | ❌ | `message_attachments` table exists; no storage upload/download; inbound media shown as placeholder text |
| Read/delivery statuses | 🟡 | from webhooks only |
| Saved replies | 🟡 | `canned_replies` |
| Contact merge / anonymise | 🟡 | RPCs with role checks |
| Webhook dedupe / retry limits | 🟡 | unique external ids; WhatsApp inbox max 10 attempts |
| Search & filters | 🟠 | basic; full-text index exists on messages |

## 3. Social media management

| Feature | Status | Evidence / gaps |
|---|---|---|
| Social planner (drafts, schedule records) | 🟠 | `social.tsx` stores posts; **no publishing worker** — "scheduled" posts are never published (see KNOWN_LIMITATIONS L-04) |
| Publishing / comments / analytics (any platform) | ❌⛔ | Needs platform apps + reviews (Meta, TikTok, LinkedIn, Google) |
| Scheduled-post plan limit | ✅ | db trigger |

## 4. AI

| Feature | Status | Evidence / gaps |
|---|---|---|
| Draft / summarise / translate in inbox | 🟡 | `ai.functions.ts` |
| Multi-provider (OpenAI, Anthropic, Gemini, OpenRouter, custom) | 🟡 | `ai-provider.server.ts` (+ model-picking unit tests ✅) |
| Encrypted BYO key | ✅ | `secrets.test.ts` (AES-GCM round trip) |
| AI Operator (away mode, bounded, logged) | 🟡 | `ai-operator*.ts` (+ outcome unit tests ✅) |
| Knowledge base | 🟡 | text documents; no file upload/embeddings |
| Per-workspace AI metering & limit | ✅ | db + unit tests |
| AI cost tracking in money | ❌ | requests counted, not tokens/cost |
| Intent / sentiment / auto-tagging | ❌ | |

## 5. CRM

| Feature | Status | Evidence / gaps |
|---|---|---|
| Contacts, leads pipeline, tags, activities | 🟡 | pages + RLS |
| GDPR export (per contact, audited) | 🟡 | contact page |
| Anonymisation | 🟡 | `anonymize_contact` RPC |
| Custom fields, segmentation, import, duplicate detection | ❌ | |

## 6. Bookings & operations

| Feature | Status | Evidence / gaps |
|---|---|---|
| Bookings, calendar, dispatch (guides/vehicles) | 🟡 | `bookings.tsx`, `dispatch.tsx`; conflict detection unit-tested ✅ |
| DB conflict guard (no double-booking) | 🟡 | trigger `booking_conflict_guard` (not yet in db-tests) |
| Tickets + check-in | 🟡 | `check_in_ticket` RPC; ticket rules unit-tested ✅ |
| Website booking import (operator) | 🟡 | operator-only since 0019 ✅ (unit test) |
| Guest reminders / review requests | 🟡 | operator-only (uses operator WhatsApp) |
| Generic (non-tour) booking model / industry modules | ❌ | tour fields are core columns |
| Deposits / online payments | ❌ | |

## 7. Team & scheduling

| Feature | Status |
|---|---|
| Team page, roles, deactivate, MFA reset | 🟡 |
| Shifts, availability, time-off, attendance | ❌ |
| Tasks | 🟡 |

## 8. Automation

| Feature | Status |
|---|---|
| Auto-assign rule on new conversation (DB trigger, logged) | 🟡 |
| Visual workflow builder, delays, retries, branching | ❌ |

## 9. Finance

| Feature | Status |
|---|---|
| PayPal transaction sync + booking matching | 🟡 (matching rules unit-tested ✅) |
| SaaS subscription billing | ❌⛔ |

## 10. Analytics & admin

| Feature | Status |
|---|---|
| Dashboard stats, analytics export | 🟡 |
| Audit log (triggers + page) | 🟡; platform actions audited ✅ |
| Integration health alerts | 🟡 |
| Monitoring / error reporting / backups | ❌ (see DEPLOYMENT_GUIDE) |

## Progress against acceptance criteria

Counted mechanically from the rows above (a row counts as ✅ if any automated test covers it):
**73 rows — 16 ✅ verified, 38 🟡/🟠 implemented or partial, 19 ❌/⛔ missing or blocked.**
No overall "percent complete" is claimed: rows are not equal in size, and live integration checks
are still outstanding (`docs/BLOCKERS.md`).
