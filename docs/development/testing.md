# Testing Strategy

## Test layers

| Layer                                          | Tool                                              | Command            | Runs where                          | Status                                                  |
| ---------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------------------- | ------------------------------------------------------- |
| Unit (pure logic)                              | Vitest                                            | `npm test`         | anywhere                            | 34 files / 153 tests passing                            |
| Component / routing                            | Vitest + Testing Library (jsdom)                  | `npm test`         | anywhere                            | `src/test/app-routing.test.tsx`                         |
| Server-module guards (mocked Supabase + fetch) | Vitest                                            | `npm test`         | anywhere                            | `src/lib/tenancy.test.ts`                               |
| **Database policies & RPCs**                   | Vitest + `postgres` driver against throwaway PG16 | `npm run test:db`  | needs local PostgreSQL 16 binaries  | 10 files / 81 tests passing                             |
| Migration idempotency                          | `scripts/db-test/run.sh` re-applies 0019+         | `npm run test:db`  | same                                | passing                                                 |
| Typecheck                                      | `tsc --noEmit`                                    | `npx tsc --noEmit` | anywhere                            | clean                                                   |
| Lint                                           | ESLint + Prettier                                 | `npm run lint`     | anywhere                            | passing (0 errors; `any` = warning) — enforced in CI    |
| Build                                          | Vite/Nitro                                        | `npm run build`    | anywhere                            | passing                                                 |
| Browser E2E                                    | Playwright                                        | _not yet in repo_  | needs a staging Supabase project    | manual 384 px checks of public pages + chat widget done |
| Live integration smoke tests                   | manual checklist                                  | —                  | production/staging with credentials | blocked (B-OPS-1)                                       |

## How the database test harness works

`scripts/db-test/run.sh`:

1. `initdb` a temporary cluster on port 54329 (deleted on exit).
2. Applies `scripts/db-test/supabase-stubs.sql` — minimal stand-ins for Supabase: roles `anon`,
   `authenticated`, `service_role`; `auth.users`; `auth.uid()` reading `request.jwt.claim.sub`;
   `cron`/`net` stubs; realtime publication.
3. Applies every migration in order (`MIGRATIONS_UPTO=0018` to test an older schema).
4. Re-applies new migrations (0019+) to prove idempotency.
5. Runs `db-tests/*.test.ts`. Helpers `asUser(id, fn)` / `asService(fn)` execute inside a
   transaction **as the `authenticated` role with that user's JWT subject** and always roll back.

Rule: **every new table, policy, RPC or trigger gets a db-test**, including a cross-tenant case.

## Cross-tenant test matrix (implemented)

For two businesses A and B: B reads/writes/links nothing of A across 12 tables; anonymous blocked;
secrets unreadable; agents limited; privileged columns locked; platform-admin-only RPCs; suspension.

## Realistic workflow tests (planned E2E, needs staging)

1. Owner signs up → verifies email → creates workspace → enrols MFA.
2. Connects Telegram/WhatsApp test number → receives message → agent replies (correct account).
3. AI suggests a reply (metered) → booking created → conflict guard → PayPal/Stripe test payment.
4. Reminder sent → owner views analytics.
5. Repeat for a second business in parallel; assert zero leakage via UI **and** direct REST calls
   with B's token against A's ids.
   Mobile viewports: 384×800 and 768×1024 for every page; assert no horizontal scroll.

## Gaps (honest)

- CI is green on GitHub (typecheck, unit, DB policy, lint, build, audit).
- Webhook handlers (Meta, WhatsApp, hub) have no automated tests with signed fixture payloads — next.
- `booking_conflict_guard`, `check_in_ticket`, `anonymize_contact` not yet in db-tests.
- Server workers (automation actions, social publisher, classifier, Telegram send) are tested through their pure
  logic and the DB queue; their live third-party calls are untested here (no credentials).
- The DB tests already caught two serious trigger bugs this session (SECURITY_AUDIT F-16) — keep adding them.
- No load/performance tests; no backup-restore drill.
