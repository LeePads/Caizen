# Storage and compatibility

## Ownership

Web and Capacitor share the IndexedDB database `caizen-life-manager`, version `1`, defined in `lib/storage/schema.ts`.

| Store | Purpose |
| --- | --- |
| `profiles` | Profile core and non-split fields |
| `records` | Individually keyed profile/health collection records |
| `media` | Managed-media metadata |
| `mediaBlobs` | Web full/thumbnail blobs |
| `settings` | Current profile, revisions, operation markers, and recovery state |
| `meta` | Migration markers |
| `backupHistory` | Reserved/listable history store; current backup creation does not populate full history |

`lib/types.ts` defines domain/persisted shapes. `lib/storage/app-repository.ts` splits/hydrates collections using keys of the form `<profile-id>:<collection>:<record-id>`. Existing split records take precedence over legacy inline collections. `lib/context.tsx` and the normalization services supply dates/defaults for loaded profiles; import preparation has its own validation boundary.

Auxiliary state also exists in localStorage, sessionStorage legacy drafts, Capacitor Preferences, and Android SharedPreferences. Current onboarding drafts and the Demo session journal use IndexedDB settings. Native media bytes use app-private files. Widget SharedPreferences are sanitized projections, not a second profile database.

## Persistence and legacy recovery

The provider schedules the newest state after a 350 ms idle window. The persistence controller serializes saves, retries failed writes, and surfaces storage errors. `saveAppState()` commits profile cores, split records, deletions, current profile, and local modification metadata in one IndexedDB transaction.

`lib/storage/localstorage-migration.ts` imports `asset-planning-app-data` when appropriate, preserves its exact JSON in `caizen-legacy-recovery-v1`, verifies the written profiles, and marks `legacy-localstorage-v1`. It retains the original legacy data and recovery copy. Initialization retains a legacy fallback after an IndexedDB initialization error.

Local persistence is not protection against quota eviction, corruption, device loss, or uninstall. Use portable backups for recovery outside the installation.

## Managed media

`lib/storage/media-storage.ts` is the platform boundary:

- Web stores full and thumbnail blobs in IndexedDB.
- Android stores files under `media/<profile-id>/<asset-id>/` in Capacitor `Directory.Data`.
- Domain records reference asset IDs; metadata records owner/profile, MIME type, size, paths, checksums, and transfer status.

Current validation limits each file to 25 MiB and each owner to 20 assets. It accepts JPEG, PNG, WebP, PDF, and plain text after filename/type/signature checks; executable-looking files, HTML, JavaScript, and SVG are rejected. Images are resized/re-encoded with thumbnails.

Saving writes bytes before metadata and compensates on metadata failure. Deletion removes metadata before best-effort byte cleanup. Durable reference-aware cleanup protects referenced assets and retries pending work. Profile deletion, import, and media operations span different stores/filesystems and must not be described as one atomic transaction.

Complete-backup restored bytes are authoritative local-only media with no remote path. Cloud cache eviction targets remote-backed caches and preserves local-only files. Account/session fences prevent late media work from committing into a different Cloud session.

## Import, deletion, and Demo

Imports validate and normalize before writing, retain pre-import structured recovery state, verify committed state, and attempt rollback on failure. JSON and `.caizen` coverage differ; see [Backup and Cloud](BACKUP-SYNC.md).

Profile deletion removes that profile's structured records and attempts managed-media cleanup; Cloud snapshots are separately managed. Trash covers selected domains and retains items with a 30-day expiry. It is not a universal recycle bin for every module.

The Demo session journal retains the original workspace checkpoint and verifies restoration before clearing recovery protection. `WorkspaceStartupGate` reconciles it before providers mount. Unknown/inconsistent recovery state blocks hydration. Workspace generation assertions and operation locks fence stale tabs, Cloud/import operations, and media cleanup. Preferences and media require compensation outside the structured-state transaction.

Progression totals, processed reward claims, companion selection, and feedback preferences are persisted. Derived rank/eligibility/display values are computed. Compatibility normalization must not replay rewards during hydration.

## Changing persisted data

Trace changes through `lib/types.ts`, schema/repositories, provider normalization, import validation, backups, and existing tests. Keep older data readable through explicit migrations or compatible defaults. Preserve the legacy and pre-import recovery paths. Widget shapes require coordinated TypeScript/Java compatibility.

Android uninstall or app-data clearing removes IndexedDB, localStorage, native preferences, widget state, and app-private media. Matching-identity update installs normally preserve these stores, but this copy's update behavior has not been exercised. Exported files outside app-private storage are separate.

Existing storage, migration, media, import, and rollback tests remain under `tests/`; run them with `pnpm test`. No tests or device durability checks were run for this public copy.
