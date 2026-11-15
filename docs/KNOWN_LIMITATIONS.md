# Known Limitations

| ID | Limitation | Impact | Plan |
|---|---|---|---|
| L-01 | Public signup is OFF (Supabase Auth setting + `VITE_PUBLIC_SIGNUP`) | New businesses can't register themselves yet | Owner enables after reviewing (B-AUTH-1) |
| L-02 | No subscription billing / checkout | Plans changed manually by platform admin | Phase 3 (Stripe recommended) |
| L-03 | Operator integrations (Lovable Gmail/WhatsApp, website API) are TukTuk24-only by design; tenants must use BYO Meta app, IMAP app password or the Automation Hub | Onboarding for tenants is manual/technical | Phase 4: Gmail OAuth, Telegram, Outlook, platform Meta app |
| L-04 | Social planner stores drafts/scheduled records but **nothing publishes them** | A "scheduled" post will not appear on social media | Phase 5 publishing worker; UI copy to be made explicit |
| L-05 | No attachments/media in inbox; inbound media shown as "[image received — open the app]" | Agents must check the phone app for media | Phase 4 (Supabase Storage) |
| L-06 | Background job processes all workspaces serially in one request | Will time out with many active tenants (~20+) | Roadmap 2.9 queue fan-out |
| L-07 | TukTuk24 branding hard-coded in page titles, sign-in page, ticket text/domain, quotes, driver/guest message templates, WhatsApp starter templates | Other businesses see TukTuk24 wording in places | Roadmap 2.7 white-labelling |
| L-08 | Tour-specific modules (Tour Calendar, dispatch, tickets) shown to every industry | Confusing for hotels/restaurants | Roadmap 2.8 industry modules |
| L-09 | Workspace switching reloads the page | Brief reload when switching business | Acceptable; safest against data mix-ups |
| L-10 | AI usage counted in requests, not tokens/cost | No money-based AI reporting | Phase 6 |
| L-11 | No MFA recovery codes | Sole admin who loses phone needs platform support | F-13 |
| L-12 | No rate limiting / custom-AI-URL host guard | Abuse risk | F-09, F-10 |
| L-13 | ~4,900 Prettier formatting lint errors (pre-existing) | `npm run lint` fails | Roadmap 1.10 |
| L-14 | `types.ts` extended manually for migrations 0019/0020 | Must regenerate after applying | Deployment §3 |
| L-15 | New UI (onboarding, switcher, billing, platform console, checklist) verified by typecheck/build and a 384px render of public pages only — not exercised against a live database in a browser | Possible UI bugs with real data | Staging E2E (Phase 9) |
| L-16 | Staff scheduling, custom roles, visual automation builder, custom fields, imports, social analytics, Outlook, Telegram, live chat: not built | — | Roadmap phases 4–7 |
| L-17 | No payroll/legal timekeeping compliance is claimed | — | Out of scope until specified |
