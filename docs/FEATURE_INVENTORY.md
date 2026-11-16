# Feature Inventory

_Verified against source code, migrations and automated tests on 2026-11-15 (end of the SaaS
build session). Historical roadmap entries were **not** taken at face value._

| Code | Meaning |
|---|---|
| ✅ **Verified** | Code exists and an automated test in this repo exercises it (unit or database test). |
| 🟡 **Implemented, not verified** | Code exists and builds, but no automated test or live check here (mostly UI and live third-party calls — no credentials in this environment). |
| 🟠 **Partial** | Some of the requirement exists; gaps listed. |
| ❌ **Missing** | Not in the code. |
| ⛔ **Blocked** | Needs an external account, credential, approval or owner decision. |

> "Verified" never means "verified live in production". This environment has no production
> access and no third-party credentials. Live checks are tracked in `docs/BLOCKERS.md` (B-OPS-1).

## 1. Multi-tenant SaaS foundations

| Feature | Status | Evidence / gaps |
|---|---|---|
| Workspace data isolation (RLS) | ✅ | `db-tests/tenant-isolation.test.ts` (12 tables, reads/writes/links/roles) |
| Cross-workspace reference guard | ✅ | same; fails on pre-0019 schema |
| Tenants cannot change own plan/limits/flags | ✅ | same; was a real defect |
| Roles admin / manager / agent | ✅ | RLS + `domain.test.ts` |
| Workspace owner + ownership transfer | ✅ | `db-tests/gdpr.test.ts` |
| Custom roles | ❌ | Fixed role enum (deliberate; see roadmap) |
| Invitations | 🟡 | Team page + `redeemInvitation` (rate-limited); invite emails ⛔ B-EMAIL-1 |
| Self-service registration | 🟠⛔ | `/signup` built, behind `VITE_PUBLIC_SIGNUP`; Supabase signups OFF (B-AUTH-1) |
| Email verification before creating a business | ✅ | `create_workspace` refuses unverified emails |
| Workspace creation + onboarding | ✅ (DB) / 🟡 (UI) | `saas-foundations.test.ts`; `/onboarding`, setup checklist (checklist logic unit-tested) |
| Multiple workspaces per user + switching | ✅ (selection logic) / 🟡 (UI) | `modules.test.ts` (`pickWorkspace`) |
| Password recovery | 🟡 | `/auth?mode=forgot`, `/reset-password` |
| Mandatory MFA + admin reset | 🟡 | `mfa-gate.tsx`, `resetMemberMfa` |
| MFA recovery codes | ✅ (codes, storage) / 🟡 (flow) | `mfa-recovery.test.ts`, `platform-support.test.ts` |
| Plans & entitlements, DB-enforced limits | ✅ | `saas-foundations.test.ts`; prices ⛔ B-BIZ-1 |
| Usage metering (AI, automations) | ✅ | db + unit tests |
| Usage dashboard | 🟡 | `/billing` (level logic unit-tested) |
| Subscription billing (Stripe) | ✅ (logic) / ⛔ (live) | `stripe.test.ts`, `stripe-webhook.test.ts`; needs Stripe account (B-BIZ-2) |
| Workspace suspension | ✅ | db test |
| Platform admin console (plans, suspend, revenue, health, backlog) | ✅ (RPCs) / 🟡 (UI) | `saas-foundations`, `platform-support` tests |
| Support access (consented, time-limited, audited, read-only) | ✅ | `platform-support.test.ts` |
| White-label (business name in app & customer messages) | 🟡 | ticket branding unit-tested; brand colour/logo upload ❌ |
| Industry modules (tour tools optional) | ✅ (rules) / 🟡 (UI) | `modules.test.ts` |
| Workspace data export (JSON) | 🟡 | `privacy.functions.ts` (RLS-scoped) |
| Workspace deletion (30-day grace) + retention | ✅ | `gdpr.test.ts` |

## 2. Multi-channel inbox

| Feature | Status | Evidence / gaps |
|---|---|---|
| Unified inbox, assignment, notes, status, priority, tags | 🟡 | `inbox.tsx`; RLS ✅ |
| Agent visibility rules / no fake delivery status | ✅ | db tests |
| WhatsApp — operator connector | 🟡 | operator-only guard ✅ |
| WhatsApp / Messenger / Instagram — BYO Meta app | 🟡⛔ | signature-verified webhook; Meta App Review (B-META-1) |
| Gmail — operator connector | 🟡 | operator-only guard ✅ |
| Gmail — IMAP/SMTP app password (any business) | 🟡 | parsing unit-tested |
| Gmail OAuth for tenants | ❌⛔ | needs Google verification (B-GOOGLE-1) |
| Outlook | ❌⛔ | needs Microsoft app (B-MS-1) |
| Telegram (per-business bot) | ✅ (parsing) / 🟡 (live) | `telegram.test.ts`; webhook secret auth |
| Website live chat widget | ✅ (validation, CORS) / 🟡 (live) | `webchat.test.ts`; widget render-checked at 384 px |
| Automation Hub (n8n/Make) | 🟡 | HMAC-signed |
| Attachments / media | ❌ | inbound media shown as a labelled placeholder |
| AI reply approval queue | ✅ (DB) / 🟡 (UI) | `ai-drafts.test.ts` |
| AI classification badges (intent/sentiment/summary) | ✅ (parsing) / 🟡 | `classify.test.ts` |
| Webhook dedupe, retry limits, rate limits | ✅ (limiter) / 🟡 | `rate-limits.test.ts` |

## 3. Social media

| Feature | Status | Evidence / gaps |
|---|---|---|
| Planner: drafts, schedule | 🟡 | `social.tsx` |
| Publishing worker — Facebook Pages, Instagram (image/Reel) | ✅ (planning/status) / ⛔ (live) | `social-publish.test.ts`; needs `pages_manage_posts` / `instagram_content_publish` (Meta review) |
| Publishing integrity (no fake "published") | ✅ | `jobs-social.test.ts` |
| TikTok / LinkedIn / YouTube publishing | ❌⛔ | partner approvals (B-TIKTOK-1, B-LI-1, B-GOOGLE-1) |
| Comments inbox, analytics, media library, approvals | ❌ | roadmap Phase 5 |

## 4. AI

| Feature | Status | Evidence |
|---|---|---|
| Draft / summarise / translate | 🟡 | `ai.functions.ts` |
| Multi-provider + encrypted BYO key | ✅ | `ai-provider.test.ts`, `secrets.test.ts` |
| Custom-provider SSRF guard | ✅ | `url-safety.test.ts` |
| Tenant-neutral prompts (no TukTuk24 playbook for others) | 🟡 | code review |
| AI Operator (away mode) + approval mode | ✅ (outcomes) / 🟡 | `ai-operator*.test.ts`, `ai-drafts.test.ts` |
| Per-workspace AI metering & cap | ✅ | db + unit |
| Token/cost tracking in money | ❌ | requests only |
| Document knowledge (files, embeddings) | ❌ | text knowledge only |

## 5. CRM

| Feature | Status | Evidence |
|---|---|---|
| Contacts, leads, tags, activities | 🟡 | pages + RLS |
| CSV export | 🟡 | contacts page (audited) |
| CSV import with de-duplication | ✅ | `crm.test.ts`, `csv.test.ts` |
| Duplicate finder + merge | ✅ | `crm.test.ts` |
| Custom fields (typed, validated) | ✅ | `crm.test.ts` |
| Segmentation | 🟠 | search + "assigned to me"; tag/segment filters ❌ |
| GDPR per-contact export / anonymise | 🟡 | contact page, RPC |

## 6. Bookings & operations

| Feature | Status | Evidence |
|---|---|---|
| Bookings, calendar, dispatch, conflict guard | 🟡 | `dispatch.test.ts` (client preview); DB guard not yet in db-tests |
| Tickets + check-in | 🟡 | `tickets.test.ts` |
| Generic (non-tour) booking model | 🟠 | tour tools hidden for other industries; generic resources/services ❌ |
| Deposits / online customer payments | ❌ | |

## 7. Team & scheduling

| Feature | Status | Evidence |
|---|---|---|
| Shifts (no overlaps, members only, notifications) | ✅ | `scheduling.test.ts` |
| Time-off requests & approvals | ✅ | same |
| Shift swaps | ✅ | same |
| Attendance clock in/out (server time; not legal timekeeping) | ✅ | same |
| Workload overview | ✅ (logic) / 🟡 | `schedule.test.ts` |

## 8. Automation

| Feature | Status | Evidence |
|---|---|---|
| Legacy auto-assign rule | 🟡 | DB trigger |
| Workflows: triggers, conditions, actions, delays | ✅ (queue, conditions, templates) / 🟡 (worker live) | `automation.test.ts` (db + unit) |
| Idempotency, retries, history, plan limits | ✅ | same |
| Branching / visual canvas editor | ❌ | linear actions with conditions |

## 9. Finance / 10. Analytics & admin

| Feature | Status |
|---|---|
| PayPal sync + matching | 🟡 (matching ✅) |
| SaaS billing (Stripe) | ✅ logic / ⛔ live |
| Dashboard, analytics export | 🟡 |
| Audit log | 🟡; platform/support/billing actions ✅ |
| Monitoring / error reporting | ❌ (see DEPLOYMENT_GUIDE) |

## Progress against acceptance criteria

Counted mechanically from the rows above (✅ = any automated test covers it, even if the UI part is 🟡):
**78 rows — 42 ✅ verified, 25 🟡/🟠 implemented or partial, 11 ❌/⛔ missing or blocked** (re-run
`python3 scripts/inventory-count.py` after editing this file). Start of session: 73 rows, 16 ✅.
No overall "percent complete" is claimed: rows differ in size and live integration checks are outstanding.
