# Contributing

Thank you for helping improve TeamInbox. This guide covers local setup, the rules every change
must follow, and how changes reach production.

## Ground rules

1. **Read [AGENTS.md](AGENTS.md) first.** It lists the architecture rules (tenant isolation,
   secrets, message statuses, background jobs, …) that every change must respect. Folders
   with their own `AGENTS.md` (for example `src/lib/`) add rules for that folder.
2. **Never use production data or credentials in development or tests.** Use a separate
   Supabase project or the local stack.
3. **Never commit secrets.** Server-only values go in the hosting provider's secret store. Only
   public values may use the `VITE_` prefix.
4. **Never rewrite published history.** No force-pushes, and no rebasing or amending of commits
   that are already pushed. `main` is synchronised with the hosting platform.
5. **No simulated integrations.** A feature that needs third-party credentials must say so
   in the UI instead of pretending to work.

## Local setup

See [Getting started](README.md#getting-started). For the database tests you also need
PostgreSQL 16 binaries (`initdb`, `pg_ctl`) on your machine:

```bash
sudo apt-get install -y postgresql-16   # Debian/Ubuntu
npm run test:db
```

## Branches and commits

- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Write commit messages in the imperative mood with a short summary line, for example
  `Add snooze to the inbox`. Explain _why_ in the body when it isn't obvious.
- Keep each commit in a working state. Every push to `main` is deployable.

## Database changes

- Add a new numbered file to `drizzle/migrations/` (`00NN_short_name.sql`) and register it in
  `drizzle/migrations/meta/_journal.json`. Never edit a migration that has been applied.
- Migrations must be **idempotent** (`if not exists`, `create or replace`, `drop … if exists`)
  and **non-destructive**. Dropping data needs an explicit, separately approved plan.
- Any change to RLS policies, RPCs or triggers needs a test in `db-tests/`.
- Add one line to [docs/architecture/database-migrations.md](docs/architecture/database-migrations.md).
- Update `src/integrations/supabase/types.ts` (regenerate after the migration is applied).

## Code conventions

- TypeScript everywhere. Code is formatted by Prettier and checked by ESLint (`npm run lint`).
- Browser-callable server logic lives in `src/lib/*.functions.ts` and uses the signed-in
  user's RLS-scoped client. Privileged code lives in `*.server.ts`.
- Put business rules in pure modules with unit tests (`src/lib/<name>.ts` +
  `<name>.test.ts`).
- Colours come from design tokens in `src/styles.css`. Never hard-code colours.
- Every list and action must work at phone width (≈ 384 px).

## Before opening a pull request

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:db
npm run build
```

Then open a pull request against `main` using the template. CI runs the same checks and must
be green before merging. After merging, apply any new migrations to production as described in
[docs/operations/go-live.md](docs/operations/go-live.md).
