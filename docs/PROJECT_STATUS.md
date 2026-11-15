# Project Status

_Updated: 2026-11-15 · Branch: `claude/tuktuk-connect-hub-saas-3awos9` (2 commits + docs, **not yet pushed** — see B-GIT-1)_

## Where we are
* **Phase 0 Discovery** — complete (8 assessment docs + tracking docs).
* **Phase 1 Security** — 8 of 12 roadmap items done (1.1–1.8); CI workflow written but unverified (1.9). Remaining: lint cleanup, MFA recovery codes, secrets v2.
* **Phase 2 SaaS foundations** — DB layer done and tested; UI built (onboarding, switcher, plan & usage, platform console, setup checklist) but not exercised against a live database. Public signup blocked on owner (B-AUTH-1).
* **Phases 3–9** — not started.

## Acceptance evidence (from `FEATURE_INVENTORY.md`, counted mechanically)
73 inventory rows: 16 ✅ verified by automated tests · 38 🟡/🟠 implemented/partial · 19 ❌/⛔.

## Latest checks (2026-11-15)
| Check | Result |
|---|---|
| `npm test` | 23 files, 113 tests — **pass** |
| `npm run test:db` | 3 files, 45 tests — **pass**; with `MIGRATIONS_UPTO=0018`: 6 fail (expected — proves fixes) |
| Migration idempotency (0019, 0020 applied twice) | **pass** |
| `npx tsc --noEmit` | **pass** |
| `npm run build` | **pass** |
| `npm run lint` | **fail** — ~4,900 pre-existing Prettier errors (not introduced here) |
| Browser check 384px: `/signup`, `/auth`, `/onboarding` redirect | **pass** (no horizontal scroll, no console errors) |

## Next milestone
Verify CI on GitHub once push access works; lint auto-fix PR; then Phase 2.7–2.9 (white-label copy,
industry modules, background-job fan-out).
