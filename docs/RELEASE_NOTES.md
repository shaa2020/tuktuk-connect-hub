# Release Notes

## Unreleased — SaaS foundations (branch `claude/tuktuk-connect-hub-saas-3awos9`)

**For TukTuk24 (no change in daily use expected)**
* Your Gmail, WhatsApp number and website stay connected exactly as before; they are now locked to
  your workspace so no future customer business can ever reach them.
* Social Planner now states clearly that posts are not published automatically yet.

**New**
* Businesses can be created from `/onboarding` (public signup still off until you enable it).
* People in several businesses can switch between them from the account menu.
* "Plan & usage" page for admins/managers shows limits and this month's usage.
* Platform console: search businesses, change plans, suspend/reactivate (all audited), monthly usage.
* Setup checklist on the dashboard for new businesses.

**Security**
* Workspace admins can no longer change their own plan or limits through the API.
* Records can't be linked across businesses, even by server code.
* Suspended businesses are locked at the database level.
* AI requests are counted per business and capped by plan for platform-paid AI.

**Database**: migrations 0019, 0020 (idempotent, non-destructive). Regenerate types after applying.
