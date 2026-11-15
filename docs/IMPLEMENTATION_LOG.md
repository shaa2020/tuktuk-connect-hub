# Implementation Log

## 2026-11-15 — Milestone 0: Discovery
* Read README, AGENTS.md (root + src/lib), roadmap.md, all 19 migrations, server functions,
  webhooks, background job, auth/MFA, integrations, tests.
* Baseline: build ✅, tsc ✅, 78/78 tests ✅, lint ❌ (pre-existing formatting).
* Found: operator-integration exposure (F-01), self-upgradeable plan (F-02), schema drift (F-06),
  hard-coded job URL (F-05), cross-tenant references (F-04), TukTuk24 playbook in every tenant's
  AI prompt (F-07), uncapped platform AI (F-08). Full list in SECURITY_AUDIT.md.
* Environment note: `bun.lock` resolves via Lovable's private npm mirror (blocked here); installed
  from the public npm registry without changing the lockfile.

## 2026-11-15 — Milestone 1: Tenant isolation + SaaS DB foundations (commit 046aac5)
* Added local PostgreSQL test harness (`scripts/db-test`, `db-tests/`, `npm run test:db`).
* Migration 0019 (tenant isolation hardening) and 0020 (plans, entitlements, metering,
  create_workspace, subscriptions tables, platform RPCs).
* `src/lib/tenancy.server.ts` guards on Gmail connector, WhatsApp connector, templates, website API,
  WhatsApp inbound routing; background job skips suspended workspaces and runs operator-only jobs
  only for the operator.
* AI: tenant-neutral prompts for non-operator workspaces; every call metered.
* Tests: +42 db tests, +11 tenancy unit tests, +4 plan helper tests.

## 2026-11-15 — Milestone 2: SaaS app layer (commit 4788d61)
* Multi-workspace provider + switcher, suspended screen, `/signup` (flagged), `/onboarding`,
  `/billing` (plan & usage), platform console via audited RPCs, dashboard setup checklist.
* Removed unused `platform.functions.ts` (legacy plan list incompatible with the plans FK).
* Tests: +5 (signup helpers, setup checklist). Browser check of public pages at 384px.

## 2026-11-15 — Milestone 3: Documentation
* docs/: MASTER_ARCHITECTURE, FEATURE_INVENTORY, SECURITY_AUDIT, SAAS_ROADMAP, INTEGRATION_MATRIX,
  TESTING_STRATEGY, DEPLOYMENT_GUIDE, KNOWN_LIMITATIONS, PROJECT_STATUS, IMPLEMENTATION_LOG,
  BLOCKERS, RELEASE_NOTES; `.env.example`.
* Corrected Social Planner copy that claimed scheduled posts would publish automatically.

## 2026-11-15 — Milestone 4: Phase 1 hardening continued
* SSRF guard (`url-safety.ts`) for tenant "custom" AI base URLs — save + call time. 15 tests.
* Migration 0021 + `rate-limit.server.ts`: public ticket lookup, invite redemption (fail closed),
  hub + Meta webhooks (fail open). 3 db tests.
* `.github/workflows/ci.yml` (typecheck, unit, db tests, build, audit; lint informational) — unverified.
