# Going live through GitHub → Lovable

When you merge a pull request into `main`, Lovable pulls the **code** automatically. The
**database changes** (migrations) are a separate step — make sure they are applied, or the new
screens will show errors like "relation does not exist".

## Step by step

1. **Backup**: Lovable → Cloud → Database → Backups (or ask Lovable: "create a database backup").
2. **Merge** the pull request on GitHub. Wait until the code appears in the Lovable editor.
3. **Apply the database migrations**: in the Lovable chat, write:

   > Apply the pending database migrations from drizzle/migrations (0019 to 0030) to the Cloud
   > database, then regenerate the Supabase types. Do not change the SQL.

   **If Lovable can't do that**, open Cloud → Database → SQL editor, paste the whole file
   `drizzle/manual/0019-0030_combined.sql` and run it once. It is safe to run again; it only adds
   what is missing.

4. **Publish** the app in Lovable.
5. **Check** (5 minutes): sign in (two-step code) → Inbox loads → open Settings (you should see
   "Industry", "Custom contact fields", "Data & privacy", "Support access", "Recovery codes") →
   Automations shows "Workflows" → Plan & usage shows your plan "Internal (operator)".
6. Send yourself a WhatsApp message and reply from the inbox. Then run the TukTuk24 smoke test in
   `docs/operations/launch-checklist.md`.

## Secrets

No new secrets are required for the app to work. Existing ones stay as they are
(`CREDENTIALS_ENCRYPTION_KEY`, `LOVABLE_API_KEY`, `WHATSAPP_API_KEY`, `GOOGLE_MAIL_API_KEY`,
`WEBSITE_API_KEY`, `VAPID_PRIVATE_KEY`). Optional, only when you are ready:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — turns on online plan purchases.
- `VITE_PUBLIC_SIGNUP=true` — shows "Create a business account" (also enable sign-ups in Supabase Auth).

## What was verified before handing over

- All 31 migrations applied with Drizzle's own migrator (`drizzle-kit migrate`) on a fresh database; a second run applied nothing.
- **Upgrade simulation**: old schema (0000–0018) + realistic TukTuk24-style data → new migrations
  → the operator workspace keeps its Gmail/WhatsApp/website access, plan mapped, messages,
  bookings, website tombstones, invitations, background job and AI Operator kick all still work;
  re-running the combined file is a no-op. (`npm run test:upgrade`, also in CI.)

## If something goes wrong

- New screens error but old ones work → migrations not applied yet (step 3).
- Gmail / WhatsApp / website stop working for TukTuk24 → check in SQL editor:
  `select name, platform_connectors from workspaces;` — TukTuk24 must be `true`. If not:
  `update workspaces set platform_connectors = true where name = 'Tuk Tuk 24 Lisbon';`
- Roll back: Lovable → version history → restore the previous version. The migrations only add
  things, so the old version keeps working with them.
