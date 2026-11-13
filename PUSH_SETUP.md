# DailyPep Web Push setup

DailyPep uses standards-based Web Push. The browser stores the user-entered workspace locally; Supabase receives only reminder timing, protocol IDs, device subscriptions and delivery state. It does not receive peptide names, doses, notes or container data for push delivery.

## Architecture

1. A signed-in user explicitly enables reminders in Settings.
2. The installed PWA creates a VAPID-backed `PushSubscription`.
3. `register_dailypep_push` stores the encrypted subscription keys for that user.
4. `sync_dailypep_reminders` stores timing-only schedules and calculates `next_fire_at` in the plan's IANA time zone.
5. Supabase Cron invokes `send-reminders` every minute with a named secret API key.
6. The function atomically claims due rows, sends a generic notification, advances the schedule and removes expired endpoints.
7. Tapping the notification focuses or opens `#today`.

The server may retry a transient failure. A stable Web Push topic coalesces the same occurrence at the push service, reducing duplicate visible notifications.

## Hosted status

The production project was configured on 13 November 2026: the migration is
applied, both Edge Functions are active, the VAPID pair is stored as function
secrets, the cron credential is encrypted in Vault, and
`dailypep-send-push-reminders` runs every minute. The first verified production
invocation returned HTTP 200.

The steps below are the recovery and redeployment procedure.

## Deployment procedure

### 1. Authenticate and link the Supabase CLI

```sh
npx supabase login
npx supabase link --project-ref tgqcyfviukurtovtxphy --yes
```

### 2. Apply the database migration

```sh
npx supabase db push --remote --yes
```

This applies `supabase/migrations/202611130001_push_reminders.sql`, including private tables, validation, RLS boundaries, timing functions and atomic claim/advance RPCs.

### 3. Configure VAPID secrets

A VAPID pair has been generated once for this deployment:

- The public key is committed as `VITE_VAPID_PUBLIC_KEY`.
- The private pair is stored only in the ignored, mode-600 file `.vapid-secrets.local.json`.
- Never commit that file or put the private key in a `VITE_` variable.

Set these Edge Function secrets in the Supabase dashboard or CLI:

```text
VAPID_PUBLIC_KEY=<publicKey from .vapid-secrets.local.json>
VAPID_PRIVATE_KEY=<privateKey from .vapid-secrets.local.json>
VAPID_SUBJECT=https://br0hansen.github.io/dailypep/
```

### 4. Deploy the functions

```sh
npx supabase functions deploy send-reminders --remote=tgqcyfviukurtovtxphy --yes
npx supabase functions deploy test-push --remote=tgqcyfviukurtovtxphy --yes
```

Deploy sequentially. Parallel deploys can race in the hosted function registry.

`test-push` requires a signed-in user JWT. `send-reminders` has `verify_jwt = false` at the gateway because it authenticates a named Supabase secret key through `@supabase/server`.

### 5. Create the cron credential and job

In Supabase **Settings → API keys**, create a secret key named `automations`. It must never enter the browser build.

In **Vault → Secrets**, add these values:

- `dailypep_project_url`: `https://tgqcyfviukurtovtxphy.supabase.co`
- `dailypep_automations_key`: the full `automations` secret key

Then create the cron job from **Cron → Jobs**, or run
`supabase/cron/setup_push_cron.sql.example`. The checked-in SQL references Vault
by name and never contains the credential itself.

## User requirements

- The user must be signed in.
- Notification permission must be granted from the explicit Enable button.
- On iPhone/iPad, DailyPep must first be added to the Home Screen and opened from its icon.
- The last device that syncs a changed plan sets that plan's IANA time zone. Opening the app refreshes the time zone and schedule.

## Verification

1. Sign in to the production PWA.
2. Install it to the Home Screen on iPhone/iPad, or install/open it in a supported desktop/Android browser.
3. Open Settings → Push reminders → Enable reminders.
4. Send a test notification and verify the generic lock-screen text.
5. Tap it and verify DailyPep opens on Today.
6. Create a plan a few minutes ahead and verify one delivery.
7. Pause, edit and delete plans and confirm `next_fire_at` changes or disappears.
8. Verify a denied permission, offline device, expired subscription, two devices and a daylight-saving boundary.

Useful operational queries:

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'dailypep-send-push-reminders';
select status, count(*) from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'dailypep-send-push-reminders') group by status;
select count(*) as subscriptions from public.dailypep_push_subscriptions where enabled;
select count(*) as due_or_late from public.dailypep_reminder_schedules where next_fire_at <= now();
```
