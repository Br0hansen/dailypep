# DailyPep web: storage and Supabase

The app saves each change to IndexedDB before marking it saved. A failed write is shown as an error. The signed-out local workspace and each signed-in account use separate records. Signing in never uploads, merges, or overwrites data automatically. Signing out returns to the local workspace; account data remains cached on the device for the same account.

Cloud support in this first version is **explicit backup and restore**, not automatic live synchronization. A backup contains the entire workspace, including any measurement images. A restore replaces the selected account's local workspace only after confirmation. Export JSON before replacing a workspace if you need both versions.

## Configure Supabase

1. Open the DailyPep project: https://supabase.com/dashboard/project/tgqcyfviukurtovtxphy
2. Run `supabase/migrations/202611080001_backups.sql` once in the SQL editor. It creates a table, per-user row-level security, and an atomic revision-checked save function.
3. Copy `.env.example` to `.env.local`. Add the project's **public anon or publishable key** to `VITE_SUPABASE_ANON_KEY`. Never use a `service_role`/secret key. The project URL is already filled in.
4. Enable email sign-in in Authentication. Set the Site URL to the deployed app URL and allow that exact URL under redirect URLs. For local testing, allow the development URL too.
5. Restart the development server or rebuild the app after changing environment variables. Without both values, local saving and JSON backups still work.

## Backup conflicts

The initial cloud save passes revision `0`, which creates a backup only if none exists. An existing backup must be fetched before it can be replaced. Later saves pass the last reviewed revision; the database rejects the write if another device has saved a newer revision. Fetch and review that backup before choosing which copy to retain. The app never assumes that the most recent login has the newest data.

## Push reminders

Push reminders use separate, timing-only tables and do not depend on the manual backup being current. Follow [PUSH_SETUP.md](PUSH_SETUP.md) to apply the migration, configure VAPID secrets, deploy the two Edge Functions and create the Supabase Cron job.

## Boundaries

- The push scheduler is an optional Supabase deployment. Apple widgets, HealthKit integration and SwiftData import are not included in the web storage layer.
- JSON imports validate types, dates, numeric values, record references, duplicate logs and schema version before saving anything.
- The web JSON format is versioned and separate from the native app's SwiftData database.
- Browser storage is a cache, not a guaranteed backup. Use JSON export or cloud backup for recovery. Clearing site data removes the local cache and session.
- Images currently travel inside the private account snapshot. There is no public image bucket. For larger image collections, migrate images to a private Supabase Storage bucket with per-account policies.
- RLS and the SQL function must be verified on the deployed Supabase project before describing cloud backup as production ready.

Official references: [Email OTP API](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions).

## This checkout (8 November 2026)

The backup table, RLS policies and revision-checked save function have been applied to the DailyPep project via its dashboard (SQL result: success). The existing public publishable key and project URL are configured in ignored `.env.local`. No secret/service-role key was accessed. Supabase currently has its default Site URL `http://localhost:3000`; development and preview use that address. Configure the production URL before hosting. Live email login and signed-in backup/restore have not yet been verified.
