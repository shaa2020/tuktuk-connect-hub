# Production Launch Checklist

## Before deploying this PR

- [ ] PR #1 reviewed; CI green
- [ ] Production database backup taken (and `CREDENTIALS_ENCRYPTION_KEY` safely stored)
- [ ] Migrations 0019–0030 applied to a **staging copy**; `npm run test:db` green; TukTuk24 smoke test on staging
- [ ] Migrations applied to production; `types.ts` regenerated
- [ ] App published; background job log shows workspaces processed without errors

## TukTuk24 smoke test (after deploy)

- [ ] WhatsApp: receive a message, reply, delivery status updates
- [ ] Gmail: new email appears; reply arrives in the same thread
- [ ] Website bookings import; ticket sends; check-in works
- [ ] AI draft in inbox; AI Operator replies in away mode (or drafts in approval mode)
- [ ] Guest reminder / review request still sent (operator only)
- [ ] PayPal sync shows transactions

## Before opening registration

- [ ] Terms, privacy policy, DPA published (B-LEGAL-1); links added to `/signup`
- [ ] Plan prices set; Stripe live keys + webhook configured and a test purchase completed and refunded
- [ ] Transactional email domain verified; invite + verification emails arrive (not spam)
- [ ] Supabase Auth: signups on, email confirmation on, password policy on, rate limits reviewed
- [ ] `VITE_PUBLIC_SIGNUP=true`; full journey tested with two independent test businesses
- [ ] Cross-tenant manual check: business B's token cannot read business A's ids via REST
- [ ] Cloudflare: rate-limiting rules for `/api/public/*`; uptime monitor on `/` and `/api/public/hooks/background-sync` (401 expected)
- [ ] Error reporting (Sentry or similar) connected
- [ ] Supabase PITR enabled; restore drill done once (record the time)
- [ ] Meta App Review submitted/approved for the permissions you advertise
- [ ] Support process: who answers, response time, how to grant support access
