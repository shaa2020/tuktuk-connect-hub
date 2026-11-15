# Integration Matrix

Stages: **Implemented** (code exists) → **Configured** (credentials saved) → **Authorized**
(OAuth/consent done) → **Provider-approved** (app review/verification) → **Tested** (a real
message/operation succeeded) → **Live** (used in production). This environment cannot see
production, so only "Implemented" can be confirmed here; the others come from the owner's records
and must be re-checked live (B-OPS-1).

| Integration | Implemented | Who owns credentials | Setup type | Provider approval needed | Notes |
|---|---|---|---|---|---|
| WhatsApp — Lovable connector (operator number) | ✅ | Platform operator (env `LOVABLE_API_KEY`, `WHATSAPP_API_KEY`) | Lovable connector | Meta business verification (done by owner per roadmap) | **Operator workspace only** (tenancy guard). Inbound via durable inbox, templates. |
| WhatsApp Cloud API — BYO Meta app | ✅ | Each business (token per connection, encrypted) | Manual: Meta app, phone number id, token, app secret, verify token | Meta app review for production scale | Webhook `/api/public/webhooks/meta/<workspaceId>` |
| Messenger / Instagram DM — BYO Meta app + one-click Facebook Login | ✅ | Each business (Page tokens per connection) | "Continue with Facebook" after the business saves its Meta App ID/Secret | **Meta App Review** (`pages_messaging`, `instagram_manage_messages`, …) | Not one-click for a SaaS until a single platform Meta app is approved |
| Gmail — Lovable connector | ✅ | Platform operator | Lovable connector | — | **Operator workspace only** |
| Gmail — IMAP/SMTP app password | ✅ | Each business (app password encrypted) | Manual (2-step + app password) | — | Works for any tenant; polling while inbox open + every 5 min |
| Gmail OAuth (per tenant) | ❌ | — | OAuth | **Google OAuth verification + CASA security assessment** for restricted Gmail scopes | Required for a polished SaaS |
| Microsoft Outlook / 365 | ❌ | — | OAuth (Microsoft Entra app) | Publisher verification; admin consent for some tenants | Graph API + change notifications |
| Telegram | ❌ | — | Bot token from @BotFather per business | None | Easiest next channel |
| Website live chat | ❌ | — | Embed snippet | None | Own widget |
| Automation Hub (n8n/Make) | ✅ | Each business (hub key) | Manual | — | Generic bridge for other channels |
| Website API tuktuk24lisbon.com | ✅ | Operator (`WEBSITE_API_KEY`) | Env | — | **Operator only**; tours, business info, booking requests |
| PayPal Reporting (business finance) | ✅ | Each business (Live Client ID/Secret, encrypted) | Manual | PayPal "Transaction Search" permission | Read-only sync + matching |
| AI — Lovable gateway (platform-paid) | ✅ | Platform operator | Env | — | Metered per workspace, plan-capped |
| AI — BYO OpenAI / Anthropic / Gemini / OpenRouter / custom | ✅ | Each business (encrypted key) | Paste key (auto-detect) | — | Metered, not capped |
| Web Push | ✅ | Platform (VAPID keys) | Env | — | |
| Social publishing (Meta, TikTok, LinkedIn, YouTube) | ❌ | — | OAuth | **Meta App Review; TikTok Content Posting API audit; LinkedIn Marketing/Community Management API access; Google OAuth verification (YouTube)** | Planner stores drafts only |
| Stripe Billing (SaaS subscriptions) | ❌ | Platform operator | Env secret + webhook secret | Stripe account activation (KYC) | Phase 3 recommendation |
| Transactional email (invites, receipts) | ❌ | Platform operator | DNS (SPF/DKIM/DMARC) + provider API key | Domain verification | Blocks invite emails |

## Central integration registry (current vs needed)

Today `channel_connections` holds one row per messaging account with `status`, `display_name`,
`account_label`, `last_checked_at`, `last_error`, `config` (non-secret) — shown on
`/integrations` and the Connect Account sheet; daily alerts for broken channels. Missing for the
full registry: `granted_scopes`, `token_expires_at`, `last_success_at` columns and the same table
(or a sibling) for non-messaging providers (social, billing, AI). Planned in Phase 4.

## Setup instructions you will need (summary — full steps in `docs/DEPLOYMENT_GUIDE.md` §7)

* **Meta**: Business portfolio verified → developer app (Business type) → products WhatsApp,
  Messenger, Instagram → webhook URL + verify token → request advanced access + App Review with
  screencasts → for a SaaS, one platform app with "Tech Provider"/embedded signup for WhatsApp.
* **Google**: Cloud project → OAuth consent screen (external) → Gmail API → restricted scopes need
  verification and an annual third-party security assessment.
* **Microsoft**: Entra ID app registration (multi-tenant) → Mail.ReadWrite/Mail.Send delegated →
  publisher verification.
* **TikTok**: developer app → Content Posting API → audit before public posting.
* **Telegram**: each business creates a bot with @BotFather and pastes the token.
* **Stripe**: activate account (company details, bank) → products/prices → webhook endpoint →
  give us the secret key + webhook signing secret via the hosting secret store.
