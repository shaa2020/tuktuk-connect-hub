# Blockers — things only the owner can unblock

| ID | Blocker | Why it needs you | What to do | Unblocks |
|---|---|---|---|---|
| B-GIT-1 | **GitHub push access denied (403)** for this Claude session | Repository/App permission | Install the Claude GitHub App on `shaa2020/tuktuk-connect-hub` (https://github.com/apps/claude/installations/select_target) or reconnect GitHub at https://claude.ai/connect-github, then ask Claude to push the branch | Publishing this work, PR review |
| B-DEPLOY-1 | Approve applying migrations 0019 + 0020 to production and publishing | Production change | Review the PR; follow `DEPLOYMENT_GUIDE.md` §5 (backup first) | All Phase 1/2 protections going live |
| B-AUTH-1 | Enable public signup | Business decision; production auth setting | When ready: Supabase → Authentication → Sign In / Providers → allow new users to sign up, keep "Confirm email" ON; set `VITE_PUBLIC_SIGNUP=true`; publish | Self-service registration |
| B-BIZ-1 | Set plan prices and confirm limits | Commercial decision | Decide monthly/annual prices per plan; Claude updates the `plans` rows | Billing |
| B-BIZ-2 | Choose billing provider + create account | Contract/KYC | Recommended: Stripe. Create and activate a Stripe account; provide secret key + webhook secret via the hosting secret store (never in chat) | Phase 3 |
| B-EMAIL-1 | Transactional email sending domain | DNS + provider account | Pick provider (Postmark/Resend/SES), add SPF/DKIM/DMARC records for your domain | Invite emails, receipts, reminders by email |
| B-META-1 | Meta platform app + App Review | Meta account, business verification, screencasts | See `INTEGRATION_MATRIX.md`; one platform app for all tenants | Instagram/Messenger/WhatsApp one-click for tenants; social publishing |
| B-GOOGLE-1 | Google OAuth verification (Gmail restricted scopes, annual security assessment) | Google account + cost of assessment | Create Google Cloud project, OAuth consent screen | Gmail OAuth for tenants, YouTube |
| B-MS-1 | Microsoft Entra app + publisher verification | Microsoft Partner account | Register multi-tenant app | Outlook channel |
| B-TIKTOK-1 / B-LI-1 | TikTok Content Posting audit; LinkedIn API access | Partner approvals | Apply via developer portals | Social publishing on those networks |
| B-LEGAL-1 | Terms, privacy policy, DPA, sub-processor list | Legal | Engage a lawyer (EU/GDPR) | Commercial launch |
| B-OPS-1 | Live verification of existing integrations (WhatsApp, Gmail, website, PayPal, AI Operator) | Needs production access/phone | Run the smoke checklist in `TESTING_STRATEGY.md` after deploy | Moving 🟡 → ✅ in the inventory |
| B-OPS-2 | Staging Supabase project | Account/cost decision (~€25/month) | Create a second Supabase project for staging | Browser E2E tests, safe migration rehearsal |
| B-T8 | Second invited account for agent-role live test (from old roadmap) | Real account | Invite a test agent | Live role verification |
