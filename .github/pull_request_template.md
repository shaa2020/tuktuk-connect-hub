## Summary

<!-- What does this change do, and why? Link the issue if there is one. -->

## Changes

-

## Database

- [ ] No database changes
- [ ] New migration(s): `drizzle/migrations/00NN_…sql` — idempotent and non-destructive
- [ ] Policy/RPC changes covered by tests in `db-tests/`
- [ ] Line added to `docs/architecture/database-migrations.md`

## Checks

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:db` and `npm run build` pass
- [ ] Tested at phone width (≈ 384 px) and on desktop
- [ ] No secrets, production data or `.env` values committed
- [ ] Rules in `AGENTS.md` respected (tenant isolation, message statuses, no simulated integrations)
- [ ] Docs / `CHANGELOG.md` updated if behaviour changed

## Release notes

<!-- Anything to do when releasing: migrations to apply, secrets to set, settings to change. -->
