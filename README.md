# DailyPep web

React + TypeScript PWA, developed beside the original iOS app. User-entered
plans and records are kept in IndexedDB on the device. Supabase is optional.
The app organizes information supplied by the user; it does not recommend
peptides, doses or protocols, or interpret measurements.

## Run

Requires Node.js 22.12+ or a supported newer version and npm.

```sh
cd web
npm install
npm run dev
```

The development server prints its local URL. The service worker is disabled in
development so source changes are not hidden by old cached builds.

```sh
npm test
npm run build
npm run preview
```

The production output is `dist/`. Serve that directory over HTTPS (or localhost
for testing). It can be hosted at the domain root or a subdirectory. Open the
production site once while online so its app files can be cached. You can then
add it to the home screen through the browser's install/share menu.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build, PWA
check, then publishes `dist/` to https://br0hansen.github.io/dailypep/.
The production build reads the public Supabase URL and publishable key from
`.env.production`.

## Data and cloud backup

The local database is separate for the local profile and each signed-in
account. Use JSON export/import for a portable copy. Browser storage can be
cleared by the user or the operating system, so export important records.

See [SETUP.md](SETUP.md) for Supabase configuration and the SQL migration in
`supabase/`. Only the project URL and public anon/publishable key belong in the
browser build. Never place a service-role or secret key in a `VITE_` variable.

Cloud backup and restore are explicit actions. This first version does not
claim automatic background synchronization between devices. A revision check
protects against silently replacing a newer cloud backup from another device.
Authentication and Supabase API responses are never cached by the service
worker; only the static application shell is cached.

## PWA updates and push reminders

A new app version waits until the user chooses to reload. Finish or save open
forms before applying an update. The shell listens to `dailypep:update-ready`
and can invoke `event.detail.update()` after the user accepts.

Standards-based Web Push is implemented through Supabase Cron and Edge
Functions. It requires the one-time hosted setup in [PUSH_SETUP.md](PUSH_SETUP.md),
a signed-in account and explicit browser permission. On iPhone/iPad the PWA
must be added to the Home Screen first. Notifications are generic and do not
put peptide names or doses on the lock screen. Native iOS widgets and biometric
app locking are not provided by this web version.

The SwiftData database is not imported automatically. Existing native records
need an explicit export/migration path before the iOS app is retired.

## Preview the existing build without installing packages

From this repository's root:

```sh
python3 -m http.server 3000 --bind localhost --directory web/dist
```

Then open http://localhost:3000. This serves the already-built app, including its
production service worker. Stop with Ctrl+C. For source development, use the npm
commands above; run `npm install` first.

## Verification on 8 November 2026

- Full TypeScript check and Vite production build passed.
- 26 tests passed: scheduling/calendar dates, unit math, import validation and
  cloud revision/account isolation. Three IndexedDB tests await `fake-indexeddb`
  installation; the registry is unreachable from the current execution sandbox.
- `npm run check:pwa` checks the generated worker's static precache, cache
  isolation, offline navigation fallback, API exclusion and explicit updates.
- Manifest and icon dimensions validated.
- Browser interaction, real email login, signed-in cloud backup/restore, and
  offline installation still need browser verification. Starting the local
  preview server was blocked by the execution sandbox (listen EPERM).
- Tests/build used cached dependencies and an existing installed Supabase SDK.
  Run a normal `npm install` for an independent dependency installation.
- Native Swift checks were attempted but blocked by sandbox/CoreSimulator
  access. Native source files were not changed in this migration.

The web version does not automatically import native SwiftData records,
provide native widgets, or continuously synchronize workspaces between devices.
