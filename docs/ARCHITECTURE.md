# Architecture

## Routes and startup

Caizen uses the Next.js App Router. `/` is the public landing page; `/app/` is the profile-based application. `app/layout.tsx` owns global metadata, theme, toasts, and web production analytics. `app/app/page.tsx` composes navigation, dynamically loaded sections/modals, settings, and workspace actions.

`app/app/layout.tsx` mounts `NativeStartupGate`, then `WorkspaceStartupGate`, then application providers. The native gate performs read-only storage discovery and early lifecycle/notification registration. It shows progress or Retry on discovery failure; it does not own a separate Cloud onboarding screen. The shared workspace gate reconciles durable Demo transitions before providers mount. `AppProvider` initializes storage, normalizes loaded profiles, and provides a usable default profile for fresh local setup.

On a Capacitor build, `app/page.tsx` renders the app layout/page at the root instead of landing markup. Native missing routes recover to `/app/`. Deep links, widgets, shortcuts, and notification targets enter `lib/native/startup-route-queue.ts`; the hydrated native shell applies them against the selected profile.

Web PKCE callbacks use `app/auth/callback/page.tsx`. The three server-only API routes are:

- `app/api/music/metadata/route.ts`
- `app/api/games/rawg/route.ts`
- `app/api/health/exercise-media/route.ts`

Normal web builds retain these routes. `scripts/build-android-web.mjs` temporarily parks all three for static export and restores them afterward. `next.config.mjs` selects static export, `out/`, and trailing slashes for `CAPACITOR_BUILD=1`. Android clients call a configured HTTPS web origin for those services.

## Source placement

| Directory/file | Responsibility |
| --- | --- |
| `app/` | Routes, layouts, metadata, and hosted API handlers |
| `components/sections/`, `components/modals/` | Feature views and editors |
| `components/common/`, `components/ui/` | Shared feature patterns and reusable primitives |
| `components/native/` | Native shell and adaptive presentation |
| `components/providers/AppProviders.tsx` | App and music player providers |
| `hooks/` | Interaction, overlay, viewport, and motion hooks |
| `lib/context.tsx`, `lib/types.ts` | Shared application facade and domain/persisted types |
| `lib/storage/` | IndexedDB, migration, media, import, backup, and persistence services |
| `lib/native/` | Guarded Capacitor calls, routing, Back, notifications, and widget projections |
| `android/app/src/main/` | Custom Java bridge, manifest, layouts, resources, and widgets |
| `supabase/migrations/` | Current Cloud tables, RLS, bucket, and Realtime configuration |
| `tests/`, `scripts/` | Retained tests, build wrappers, asset generators, and audits |

Feature UI consumes context actions and pure domain logic. Persistence belongs in repositories/services; custom device behavior belongs behind `lib/native/` and `lib/platform.ts` rather than in generic UI.

## State and data ownership

IndexedDB owns profiles and records. `lib/storage/app-repository.ts` splits profile collections into keyed records, hydrates them, and commits structured state transactionally. `AppProvider` normalizes compatibility fields and schedules persistence after a 350 ms idle window. The persistence controller owns serialization, retries, and storage error events. See [Storage](STORAGE.md).

`lib/music-player.tsx`, `lib/theme.tsx`, and feature preference services retain auxiliary browser preferences. Media metadata and bytes have separate ownership and compensation paths. Cloud is optional, profile-scoped snapshot backup; sign-in does not authorize restore. See [Backup and Cloud](BACKUP-SYNC.md).

Mastery rules live under `lib/mastery/`; reward composition and feedback live under `lib/rewards/` and `lib/feedback/`. Category XP follows the activity category; companion Bond XP goes to the active mastery companion. The legacy Pet Shop remains a separate compatibility system.

Life Hub owns its task/routine schedules and completion history. Linked domains own their records. Links ordinarily provide context/navigation; the narrow Work-task completion and qualifying Health-evidence paths use the canonical Life Hub completion service. Life Hub completion does not mutate its linked Work/Health records. Source owners include `lib/lifehub/linked-context.ts`, `lib/work/lifehub-mirror.ts`, and `lib/health/lifehub-completion.ts`.

## Shared interaction contracts

Radix/Vaul primitives own their existing portal/focus/dismissal behavior. Custom overlays use `hooks/use-overlay-lifecycle.ts` and `lib/native/overlay-stack.ts` for Back/Escape ordering, scroll locks, optional focus containment, and trigger restoration. Avoid duplicate lifecycle registration. Dirty editor close paths share the existing leave/discard guards.

Android Back handles keyboard, top overlay, nested flow, root history, Dashboard, and exit confirmation in order. Native presentation reuses the shared domain components, with safe-area and keyboard-aware layouts.

`SectionTabs` separates navigation (`aria-current`) from Radix tab panels. Search/filter/toolbars use the shared control patterns. Long press accelerates an action also available through a visible control. Existing motion uses OS/app reduced-motion preferences and constrained-performance handling; runtime accessibility and visual coverage are **Unverified** for this copy.

## Assets and offline boundary

Runtime images, icons, pet sprites, Demo assets, and landing screenshots are under `public/`. Original mastery artwork in `assets/mastery-source/` is retained because the generator and `tests/mastery-assets.test.ts` require it. Optimized derivatives under `public/achievements/mastery-runtime/` are required runtime assets and remain included. `assets/logo.png` supports the existing Android asset-generation script.

`artifacts/android-token-baseline.json` is a retained audit comparison input. Historical reports, screenshots, animation reference GIFs, and internal design/tooling folders are excluded; they are not app inputs. The CSS comment referring to the excluded animation reference is historical commentary.

One pre-existing CSS reference, `/assets/ui/game-arcade-texture.png`, has no matching file in the inspected source public tree. Its rendering effect is **Unverified**; the source was preserved without inventing an asset. The landing download path is also intentionally absent until a built APK is supplied, as described in the root README.

`public/manifest.webmanifest` provides standalone presentation and `/app/` entry. There is no service worker providing offline web shell caching. Android packages its shell; Cloud, remote catalogs/media, and external playback still require connectivity.
