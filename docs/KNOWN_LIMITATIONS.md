# Known Limitations

| ID | Limitation | Impact | Plan |
|---|---|---|---|
| L-01 | Public signup is OFF until you enable it | New businesses can't register themselves yet | B-AUTH-1 |
| L-02 | Stripe billing is coded but not configured | Plans changed by platform admin until Stripe is set up | B-BIZ-1/2 |
| L-03 | Operator integrations (Lovable Gmail/WhatsApp, website API) are TukTuk24-only by design; other businesses use BYO Meta app, IMAP app password, Telegram, website chat or the Automation Hub | Gmail/Outlook "Sign in with…" not available yet | B-GOOGLE-1, B-MS-1 |
| L-04 | Social publishing works for Facebook Pages and Instagram only, and only after Meta grants publishing permissions; no comments inbox/analytics/media library | | B-META-1, roadmap Phase 5 |
| L-05 | Inbox photos/files work for website chat, Telegram and Meta channels; inbound media from the Lovable WhatsApp connector and email attachments are not imported yet | Agents check the phone/mail app for those | Roadmap |
| L-06 | Website chat uses polling (≈5 s), not websockets | Slight delay | Acceptable; can move to Realtime later |
| L-07 | White-labelling covers names/messages; no logo/colour upload; operator's ticket domain kept for TukTuk24 only | | Roadmap |
| L-08 | Services + online booking page cover slots and nights with capacity; no online payment/deposit at booking time, no per-room inventory (rooms are counted as units) and no customer self-cancel link | Payment is arranged directly; staff cancel in Bookings | Roadmap |
| L-09 | Workspace switching reloads the page | Brief reload | Acceptable (safest) |
| L-10 | AI usage counted in requests, not tokens/money; no document upload for knowledge | | Phase 6 |
| L-11 | Automation workflows are linear (conditions + up to 10 actions); no branching canvas | | Phase 7 |
| L-12 | Attendance is an operational record, not certified legal timekeeping or payroll | | Out of scope until specified |
| L-13 | `types.ts` extended by hand for migrations 0019–0030 | Regenerate after applying | Deployment §3 |
| L-14 | Signed-in UI (onboarding, switcher, billing, platform, schedule, workflows, CRM tools, AI drafts, privacy) verified by typecheck/build/tests only — not clicked through against a real database | Possible UI bugs with real data | B-OPS-2 staging E2E |
| L-15 | Workspace export is one JSON download (max 50k rows/table) | Very large businesses need a background export | Roadmap |
| L-16 | Custom roles not supported (admin / manager / agent) | | Roadmap |
| L-17 | Secrets encryption has no key versioning (F-11) | Key rotation needs a script | Roadmap |
