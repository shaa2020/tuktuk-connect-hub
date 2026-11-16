# Documentation

Everything about the platform, grouped by who it is for. Start with the
[architecture overview](architecture/overview.md) if you are new to the codebase.

## Product

| Document                                          | What it covers                                        |
| ------------------------------------------------- | ----------------------------------------------------- |
| [Roadmap](product/roadmap.md)                     | Phased plan from internal tool to multi-business SaaS |
| [Feature inventory](product/feature-inventory.md) | Every feature with its verified status                |
| [Known limitations](product/known-limitations.md) | What the product deliberately does not do yet         |
| [Product brief (v1)](product/product-brief.md)    | Original requirements used to scope version 1         |
| [Roadmap (v1)](product/roadmap-v1.md)             | First roadmap, kept for history                       |

## Architecture

| Document                                                   | What it covers                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| [Overview](architecture/overview.md)                       | Building blocks, tenancy model, data flow, background jobs    |
| [Security audit](architecture/security-audit.md)           | Findings, fixes and the tenant-isolation model                |
| [Integrations](architecture/integrations.md)               | Every channel/provider, who owns credentials, approval needed |
| [Database migrations](architecture/database-migrations.md) | One line per migration                                        |
| [RLS check](architecture/rls-check.sql)                    | SQL to list tables and their row-level-security policies      |

## Operations

| Document                                           | What it covers                                             |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [Deployment](operations/deployment.md)             | Environments, applying migrations, backups, cost estimates |
| [Go-live](operations/go-live.md)                   | Step-by-step production release with the current hosting   |
| [Launch checklist](operations/launch-checklist.md) | Everything to confirm before inviting paying customers     |
| [Performance](operations/performance.md)           | Bundle sizes, query patterns and limits                    |

## Guides

| Document                                             | Audience                                    |
| ---------------------------------------------------- | ------------------------------------------- |
| [Admin manual](guides/admin-manual.md)               | Business admins running their workspace     |
| [Customer onboarding](guides/customer-onboarding.md) | New businesses setting up channels and team |

## Development

| Document                           | What it covers                                           |
| ---------------------------------- | -------------------------------------------------------- |
| [Testing](development/testing.md)  | Unit, database-policy and end-to-end testing strategy    |
| [Contributing](../CONTRIBUTING.md) | Local setup, conventions, pull requests                  |
| [Architecture rules](../AGENTS.md) | Binding rules for anyone (or any tool) changing the code |

## Project tracking

| Document                                            | What it covers                                          |
| --------------------------------------------------- | ------------------------------------------------------- |
| [Status](project/status.md)                         | Current state of the project                            |
| [Blockers](project/blockers.md)                     | Decisions and external approvals the team is waiting on |
| [Implementation log](project/implementation-log.md) | Chronological engineering log                           |
| [Changelog](../CHANGELOG.md)                        | Release-by-release changes                              |

## Where did a document go?

Older commits, migration comments and external links may use the previous names:

| Previous name                       | New location                               |
| ----------------------------------- | ------------------------------------------ |
| `README.md` (product brief)         | `docs/product/product-brief.md`            |
| `roadmap.md`                        | `docs/product/roadmap-v1.md`               |
| `docs/SAAS_ROADMAP.md`              | `docs/product/roadmap.md`                  |
| `docs/FEATURE_INVENTORY.md`         | `docs/product/feature-inventory.md`        |
| `docs/KNOWN_LIMITATIONS.md`         | `docs/product/known-limitations.md`        |
| `docs/MASTER_ARCHITECTURE.md`       | `docs/architecture/overview.md`            |
| `docs/SECURITY_AUDIT.md`            | `docs/architecture/security-audit.md`      |
| `docs/INTEGRATION_MATRIX.md`        | `docs/architecture/integrations.md`        |
| `docs/migrations.md`                | `docs/architecture/database-migrations.md` |
| `docs/rls-check.sql`                | `docs/architecture/rls-check.sql`          |
| `docs/DEPLOYMENT_GUIDE.md`          | `docs/operations/deployment.md`            |
| `docs/GO_LIVE_WITH_LOVABLE.md`      | `docs/operations/go-live.md`               |
| `docs/LAUNCH_CHECKLIST.md`          | `docs/operations/launch-checklist.md`      |
| `docs/PERFORMANCE_REPORT.md`        | `docs/operations/performance.md`           |
| `docs/ADMIN_MANUAL.md`              | `docs/guides/admin-manual.md`              |
| `docs/CUSTOMER_ONBOARDING_GUIDE.md` | `docs/guides/customer-onboarding.md`       |
| `docs/TESTING_STRATEGY.md`          | `docs/development/testing.md`              |
| `docs/PROJECT_STATUS.md`            | `docs/project/status.md`                   |
| `docs/BLOCKERS.md`                  | `docs/project/blockers.md`                 |
| `docs/IMPLEMENTATION_LOG.md`        | `docs/project/implementation-log.md`       |
| `docs/RELEASE_NOTES.md`             | `CHANGELOG.md`                             |
