# Blockers — things only the owner can unblock

| ID | Blocker | What to do | Unblocks |
|---|---|---|---|
| ~~B-GIT-1~~ | ~~GitHub push access~~ | Resolved 2026-11-15 | — |
| B-DEPLOY-1 | Approve applying migrations 0019–0030 and publishing | Review PR #1; follow `DEPLOYMENT_GUIDE.md` §5 (backup first, staging first) | Everything in this PR going live |
| B-AUTH-1 | Enable public signup | Supabase → Authentication → allow new sign-ups, keep "Confirm email" ON; set `VITE_PUBLIC_SIGNUP=true` | Self-service registration |
| B-BIZ-1 | Plan prices / limits | Decide monthly & annual prices; Claude updates `plans` (and `stripe_price_*`) | Billing page prices, checkout |
| B-BIZ-2 | Stripe account | Activate Stripe; create products/prices; webhook to `/api/public/webhooks/stripe` (events: checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed); add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to hosting secrets; enable Stripe Tax if selling across the EU | Paid subscriptions |
| B-EMAIL-1 | Transactional email domain | Choose provider; add SPF/DKIM/DMARC | Invite emails, receipts |
| B-META-1 | Meta app + App Review | Business verification; request `pages_messaging`, `instagram_manage_messages`, `pages_manage_posts`, `instagram_content_publish` | Messenger/IG DMs at scale, social publishing |
| B-GOOGLE-1 | Google OAuth verification | Cloud project, consent screen, restricted-scope verification + security assessment | Gmail OAuth for tenants, YouTube |
| B-MS-1 | Microsoft Entra app | Multi-tenant app, publisher verification | Outlook channel |
| B-TIKTOK-1 / B-LI-1 | TikTok Content Posting audit; LinkedIn API access | Apply via developer portals | Publishing on those networks |
| B-LEGAL-1 | Terms, privacy policy, DPA, sub-processor list | EU/GDPR lawyer | Commercial launch |
| B-OPS-1 | Live verification of integrations | After deploy, run the smoke checklist in `LAUNCH_CHECKLIST.md` | 🟡 → ✅ in inventory |
| B-OPS-2 | Staging Supabase project (~€25/month — check price) | Create a second project | Browser E2E of signed-in flows, safe migration rehearsal |
| B-T8 | Second invited account for agent-role live test | Invite a test agent | Live role verification |
