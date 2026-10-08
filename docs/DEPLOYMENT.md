# Deployment and public releases

## Repository and domain ownership

| Surface | Source | Intended URL |
| --- | --- | --- |
| Stable production | CaizenPublic, `LeePads/Caizen`, `main` | `https://caizen.space` |
| Development/staging | Private CaizenManager, `main` | `https://caizenlife.vercel.app` |

CaizenManager is the development source of truth. CaizenPublic is a reviewed release snapshot of the same application, with its own public Git history. Develop fixes in CaizenManager first, then transfer reviewed source changes. Never merge histories, copy `.git`, or add the private repository as a public remote. Public documentation and exclusion rules may be sanitized for distribution; application source must not become a separate implementation.

The 2026-10-08 read-only GitHub inspection confirmed CaizenManager is private, Caizen is public, and both default branches are `main`. Local `origin` URLs match those repositories; CaizenPublic has one initial snapshot commit and its own `.git`. The private GitHub About/homepage URL still points to `https://cai-life-manager.vercel.app`, while the public repository has no homepage configured. Manually set the public About URL to `https://caizen.space` and the private About URL to `https://caizenlife.vercel.app` without changing visibility.

Both deployments serve the landing page at `/`, Caizen at `/app/`, and the hosted API routes below. Android packages the same application and enters the product directly; its API requests use a separately configured hosted origin.

## Manual Vercel configuration

Create or retain two separate Vercel projects. Repository connections, domain assignments, environment values, DNS, and deployment protection are external settings; this document does not assert their current state.

| Setting | Production project | Staging project |
| --- | --- | --- |
| Git repository | `LeePads/Caizen` | Private `LeePads/CaizenManager` |
| Production branch | `main` | `main` (its deployments are staging for the product) |
| Domain | `caizen.space` | Keep `caizenlife.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://caizen.space` | `https://caizenlife.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | `https://caizen.space` | `https://caizenlife.vercel.app` |

Use the Next.js framework preset, repository root, Node.js 22+, install command `pnpm install --frozen-lockfile`, and build command `pnpm build`. Leave the output-directory override unset. Do not set `CAPACITOR_BUILD=1` or `NEXT_PUBLIC_CAPACITOR_BUILD=1` on either web project, and do not deploy `out/`: the static Android export omits hosted API handlers. No `vercel.json` is required by the current source. Vercel supports Next.js and its route handlers directly ([Vercel Next.js documentation](https://vercel.com/docs/frameworks/full-stack/nextjs)).

Assign the apex domain only to the public project and use the DNS records Vercel displays. If `www.caizen.space` is retained, redirect it to the apex production domain ([Vercel domain documentation](https://vercel.com/docs/domains/working-with-domains/add-a-domain)). Do not redirect staging to production.

`NEXT_PUBLIC_SITE_URL` controls metadata, the landing canonical URL, and whether indexing is allowed. It accepts only a credential-free HTTPS origin and defaults to `https://caizen.space`. Configure staging explicitly; non-production origins and Vercel Preview deployments receive `noindex, nofollow`. Configure Preview environment values separately if previews should advertise a different URL. `NEXT_PUBLIC_APP_URL` independently controls Android's hosted APIs, not web authentication redirects or website metadata. Public variables are embedded at build time, so redeploy after changing them.

Keep `RAWG_API_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` server-only in each project's environment. Optional public client configuration is `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_TMDB_API_KEY`; never supply a Supabase service-role key to clients. Use separate staging service configuration where possible. Keep Vercel project bindings under ignored `.vercel/`, outside snapshot transfers.

The production site and Android's production API origin must be accessible without a Vercel login. Staging protection is a separate choice; an Android build pointed at protected staging APIs cannot use those services without an appropriate supported access mechanism.

## Hosted routes and authentication

The public source retains these Node.js route handlers and their imports:

- `/api/music/metadata`: Spotify credentials are optional server configuration; manual music entry remains usable.
- `/api/games/rawg`: configure `RAWG_API_KEY` for game catalog lookup.
- `/api/health/exercise-media`: exercise-media proxy; it uses the existing upstream provider without a new secret.

Web clients use their own site's API routes. Packaged Android clients use `NEXT_PUBLIC_APP_URL`; public release APKs must be built with `https://caizen.space`, while development APKs may use the staging origin. The current API CORS rules already allow Capacitor's known localhost origins; no broad cross-domain CORS change is needed.

For optional Cloud, apply the retained `supabase/migrations/` and preserve owner-scoped RLS/private Storage. Set the Supabase production Site URL to `https://caizen.space`. Allow the current callback destinations `https://caizen.space/auth/callback`, `https://caizenlife.vercel.app/auth/callback`, and `caizen://auth/callback` in the relevant project(s). Web auth uses the browser's current origin, so staging stays on staging. Allow Preview/local callback URLs only when needed. See [Backup and Cloud](BACKUP-SYNC.md).

Local web profiles and sessions are scoped to each browser origin. Moving from staging or `www` to the apex domain does not automatically move IndexedDB records. Users can explicitly export and restore their existing backups; the deployment change does not migrate or delete local data.

## Android download contract

The landing page's View on GitHub action always targets [LeePads/Caizen](https://github.com/LeePads/Caizen). Both repository copies check the unauthenticated GitHub latest-release endpoint at page load. Only a published stable release with an uploaded, nonempty asset named **`caizen-android.apk`** enables Download Android APK. The link uses that asset's `browser_download_url`, including its release tag, instead of a guessed local path. GitHub documents both the [latest-release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) and [release download links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).

No release, or a latest release missing the asset, produces a disabled download control and a truthful explanation. Network failures, timeouts, and rate limits report that availability could not be checked and offer View public releases. Older APKs are not silently substituted. The lookup happens in the browser, needs no GitHub token or server route, and picks up new releases without rebuilding the landing page. API availability and browser/network policy can still prevent the lookup.

As of source inspection on **2026-10-08**, the public GitHub Releases page had no releases. There was no published asset name to verify; `caizen-android.apk` is the explicit contract for the first and subsequent releases. The disabled state is therefore expected until a matching asset is published.

Manually prepare a signed release APK in CaizenManager using the existing private signing identity and package ID `app.caizen.life`. Set the production API origin at APK build time and increment `versionCode` for subsequent releases. Rename the distribution copy of `android/app/build/outputs/apk/release/app-release.apk` to `caizen-android.apk`; renaming the file does not change package identity or signing. Do not distribute an unsigned/debug replacement as an update.

After reviewing the public snapshot, manually commit/push it, create a release tag in **LeePads/Caizen**, upload `caizen-android.apk` as a Release asset, publish the stable release, and select it as Latest. Do not leave it as a draft or prerelease for the stable download. Upload APKs to Releases only, never to the source tree. Keep keystores, signing properties, passwords, and service secrets private. See [Android](ANDROID.md) for the existing build/signing boundaries.

## Safe snapshot updates

1. Make and review application changes in CaizenManager. Choose the intended release state explicitly, including whether any uncommitted changes are ready; do not blindly copy a dirty development tree. Keep repository remotes and visibility unchanged.
2. Prepare a temporary, non-Git snapshot outside both repositories. Start with the reviewed public tracked-file list as the transfer allow-list. Copy corresponding source files from CaizenManager; individually review new paths before adding them and review removed paths before deleting their public counterparts. Copy file contents, never Git metadata or a private commit archive containing all tracked material.
3. Preserve public-safe root files and documentation. Runtime source directories are `app/`, `components/`, `hooks/`, `lib/`, `styles/`, runtime `public/` assets, and `assets/`. Retain `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, and `components.json`. The public snapshot also retains `capacitor.config.ts`, original Android source/Gradle/wrapper files, `supabase/` configuration/migrations, tests, and required build-script source. Exclude generated native inputs; `pnpm cap:sync` recreates them when building Android. Keep the public README, `.gitignore`, `.env.example`, and sanitized architecture/storage/backup/Android docs; transfer this deployment guide alongside source corrections.
4. Never include `.git/`, real `.env*` values, `.vercel/`, signing materials, SDK/local properties, `node_modules/`, `.next*/`, `out/`, native build/assets/plugin output, APK/AAB files, personal exports, internal agent/design directories, private handoffs/release/audit records, design references, or `public/Attachments/`. The retained `artifacts/android-token-baseline.json` is source input, not generated audit output. `.gitignore` does not protect files already tracked or inspect their contents, so review the candidate file list and contents as well.
5. Copy only the reviewed candidate files into CaizenPublic, preserving its existing `.git` and independent public history. Inspect `git status --short`, `git diff`, and `git diff --check` there. Confirm landing/release behavior and runtime source match CaizenManager. Resolve application fixes in the private source first; avoid maintaining public-only app patches.
6. Before actual shipping, manually run the appropriate validation when authorized, inspect source for secrets/personal content, verify hosted APIs/auth, and verify the APK's signature/update behavior. Then manually commit/push from CaizenPublic and publish the public release. Do not push CaizenManager history to the public remote or cherry-pick/merge private commits.

No automated publisher is introduced. An allow-list and reviewed file-content transfer keeps public release history independent and avoids transferring private Git history. Large directory mirrors and copy-everything-then-delete workflows make exclusions harder to review.

## Inspection boundary

The 2026-10-08 review found the public runtime source, lockfile, and web/Capacitor configuration present and matching the corresponding private working-tree files before these shared corrections. Omitted runtime-directory paths were the three private reference GIFs and the APK; no active source reference to those GIF paths was found. Public tracked files excluded credentials, signing keys, private tooling, generated web/native builds, internal release records, and personal exports. Source-oriented filename/content inspection found no credential payloads; this is not a guarantee that every asset is suitable for public distribution.

Buildability and deployed behavior remain **Unverified**: no tests, lint, typecheck, builds, automation, sync, APK signing/install, release publication, or Vercel changes were performed in this review. The existing public screenshot assets were retained; the inspected captures show the John demo workspace and catalog/task content without visible credentials. Asset provenance and consent are not established by source inspection. Live Vercel project/domain/environment settings require manual confirmation.
