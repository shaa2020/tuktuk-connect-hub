# Project Status

_Updated: 2026-11-15 · CI green on GitHub_

## Summary for the owner

All phases have code in this PR, but **nothing is live yet**: the PR must be reviewed, the
database migrations (0019–0030) applied after a backup, and the app published. Several features
also need your accounts/approvals before they can work for real (Stripe, Meta, Google, Microsoft,
email domain) — see `docs/project/blockers.md`.

| Phase                    | State                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| 0 Discovery              | ✅ Complete                                                                                   |
| 1 Security & foundations | ✅ 11/12 roadmap items (secrets v2 open)                                                      |
| 2 SaaS foundations       | ✅ Built; public signup waits for your decision                                               |
| 3 Billing                | ✅ Stripe code complete & tested; ⛔ needs Stripe account + prices                            |
| 4 Inbox                  | 🟠 Telegram + website chat added; Outlook/Gmail OAuth ⛔ provider apps; attachments ❌        |
| 5 Social                 | 🟠 Facebook/Instagram publishing worker; ⛔ Meta review; TikTok/LinkedIn ⛔; analytics ❌     |
| 6 AI                     | 🟠 Metering, approval queue, classification; token cost + document KB ❌                      |
| 7 CRM & operations       | 🟠 Import/dedupe/custom fields, scheduling, automation engine; generic bookings & deposits ❌ |
| 8 Platform admin         | ✅ Plans, suspension, revenue, health, backlog, consented support access                      |
| 9 Production readiness   | 🟠 CI + DB policy tests; staging E2E, load test, restore drill ❌ (need staging project)      |

## Acceptance evidence (`python3 scripts/inventory-count.py`)

78 inventory rows: **42 ✅ verified**, 25 🟡/🟠, 11 ❌/⛔. (Session start: 73 rows, 16 ✅.)

## Latest checks

| Check                                | Result                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| `npm test`                           | 34 files, 153 tests — pass                                     |
| `npm run test:db`                    | 10 files, 81 tests — pass (0019+ re-applied for idempotency)   |
| `npx tsc --noEmit`                   | pass                                                           |
| `npm run lint`                       | pass — 0 errors (211 warnings, mostly `any`)                   |
| `npm run build`                      | pass                                                           |
| GitHub Actions CI on PR #1           | pass                                                           |
| Browser checks (384 px)              | `/signup`, `/auth`, `/onboarding` redirect, chat widget — pass |
| Signed-in UI against a real database | **not done** (needs staging project, B-OPS-2)                  |

## Next milestone (needs you)

1. Review/merge PR #1 → apply migrations on staging, then production (DEPLOYMENT_GUIDE §5).
2. Decide prices + public signup; create Stripe account; set up email domain.
3. Create a staging Supabase project so signed-in flows can be browser-tested end to end.
