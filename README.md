# Caizen

A local-first personal life manager for the web and Android. Caizen brings planning, money, health, collections, entertainment, work, and reflection into one workspace with separate local profiles. Local use requires no account; Supabase authentication and Cloud Backup are optional.

The public landing page is at `/`; the application is at `/app/`. Android packages the same application with Capacitor and opens the product directly.

## Stack

| Layer | Current configuration |
| --- | --- |
| Application | Next.js 16.2.6 App Router, React 19.2.8, TypeScript 5.7.3 |
| Interface | Tailwind CSS 4.3.3, Radix/shadcn-style primitives, Vaul, Framer Motion 12.43.0 |
| Local data | IndexedDB; auxiliary localStorage and native preferences |
| Optional Cloud | Supabase Auth, Postgres, and private Storage |
| Android | Capacitor 8.4.2, Java 21, Android Gradle Plugin 8.13.0, Gradle 8.14.3; SDK minimum/compile/target 24/36/36 |
| Tests | Vitest 3.2.4, fake-indexeddb; separate browser/device audit scripts |

JavaScript versions above are resolved by `pnpm-lock.yaml`; native values come from the Android Gradle files.

## Local setup

Use Node.js 22 or newer and pnpm 10 or newer. Node 22 satisfies the included Capacitor CLI requirement; pnpm 10 is the setup recommendation. Use the existing lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000/app/` for Caizen or `http://localhost:3000/` for the landing page. The app offers local setup, a Demo workspace, and explicit backup restore. Next.js recreates the excluded `next-env.d.ts` during development/build.

For a production web server:

```sh
pnpm build
pnpm start
```

## Optional configuration

No environment file is required for core local records. To enable integrations, copy `.env.example` to `.env.local` and fill only the values you need. The example contains empty values, not credentials.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for optional authentication and Cloud Backup |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous client key; requires the supplied owner-scoped RLS policies |
| `NEXT_PUBLIC_TMDB_API_KEY` | Optional entertainment catalog lookup; visible to clients |
| `RAWG_API_KEY` | Server-only game catalog credential |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Server-only music metadata credentials |
| `NEXT_PUBLIC_APP_URL` | Credential-free HTTPS origin hosting the game, music, and exercise-media API routes for Android |
| `CAIZEN_REQUIRE_CLOUD=1` | Optional Android configuration gate requiring public Cloud configuration |

Never put service-role keys or server credentials in `NEXT_PUBLIC_*` variables. Android has no Next.js server: its hosted API features require a separately deployed web origin. Manual records remain available when optional services are unavailable.

For Cloud, apply the current SQL migrations in `supabase/migrations/` and configure the needed email/Google providers and redirect allow-list. Web uses `/auth/callback`; Android uses `caizen://auth/callback`. See [Backup and Cloud setup](docs/BACKUP-SYNC.md) for the deployment and recovery boundaries.

## Android

Install JDK 21 and the Android SDK with platform 36. Set `JAVA_HOME` and configure SDK discovery through `ANDROID_HOME` or a local `android/local.properties` file. These machine-specific files and release signing materials are excluded.

```sh
pnpm cap:sync
pnpm android:debug
```

`cap:sync` runs the Android web build and then `cap sync android`, recreating exported web assets, plugin wiring, and Capacitor configuration. Run it before opening/building this fresh native copy. Debug output is `android/app/build/outputs/apk/debug/app-debug.apk`. See [Android setup](docs/ANDROID.md) for release tasks, signing, and safe update installation.

Built APKs are excluded, including `public/downloads/caizen-android.apk`. The unchanged landing page references that download path; it will be unavailable until a separately built APK is placed there for deployment.

## Retained tests and scripts

The existing `tests/` directory, `vitest.config.ts`, Vitest dependencies, and all package scripts are retained. Run unit/source-contract tests from the repository root:

```sh
pnpm test
pnpm test -- tests/achievement-system.test.ts
```

Vitest uses a Node environment, `tests/setup.ts`, and `TZ=Asia/Manila`. Android/browser audit scripts are separate from Vitest and may require an exported build, an installed Chromium browser, or a connected device. Their existing platform assumptions remain in source.

Other retained commands include `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the full `pnpm validate` sequence. No tests, lint, typecheck, builds, browser/device checks, or deployment checks were run while preparing this public copy.

## Data and source guide

Profiles and records live in IndexedDB. Web managed media uses IndexedDB blobs; Android media uses app-private files. JSON exports omit media bytes; complete `.caizen` archives include available managed media and are not encrypted. Cloud is profile-scoped snapshot backup and restore, with separate managed-media transfer. It does not provide record-level two-way synchronization.

Local data can be used after the app loads without Cloud. The web manifest does not provide service-worker caching, so offline web cold-start/reload is not guaranteed. Android includes its application shell; remote services still need connectivity.

- [Architecture and source layout](docs/ARCHITECTURE.md)
- [Android setup and native boundaries](docs/ANDROID.md)
- [Storage, compatibility, and recovery](docs/STORAGE.md)
- [Backup, import, and optional Cloud](docs/BACKUP-SYNC.md)

This copy contains current application source and runtime assets, without private Git history, credentials, development tooling, generated builds, or internal release records. Hosted services, production Supabase configuration, builds, and physical-device behavior are **Unverified** for this copy.
