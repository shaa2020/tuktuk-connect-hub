# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and
choose **Report a vulnerability**. Include:

- what is affected (page, endpoint or function) and the impact you observed;
- steps to reproduce, with any proof-of-concept;
- whether customer data or another business's data could be exposed.

We aim to acknowledge reports within 3 business days and to share a remediation plan within
10 business days. Please give us a reasonable time to fix the issue before any disclosure.

## Scope

In scope: this application, its public endpoints (`/api/public/*`, the website chat widget,
the booking page and ticket pages) and its database policies.

Out of scope: third-party platforms (Supabase, Cloudflare, Meta, Google, Telegram, Stripe,
PayPal) — report those to the vendor — and findings that need a compromised device or account.

## How the platform protects data

- Business data is isolated per workspace by database-level Row Level Security and
  same-workspace triggers.
- Integration credentials are encrypted with AES-GCM and never returned to browsers.
- All accounts use mandatory two-factor authentication.
- Public endpoints are rate-limited, and provider webhooks are signature-verified.

The full review and its findings are in
[docs/architecture/security-audit.md](docs/architecture/security-audit.md).
