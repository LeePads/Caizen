# Android setup

## Configuration and prerequisites

The app uses Capacitor 8.4.2 with ID `app.caizen.life`, name `Caizen`, and web directory `out`. Native Gradle source specifies version name/code `1.0.0`/`22`, Java 21, Android Gradle Plugin 8.13.0, Gradle wrapper 8.14.3, and SDK minimum/compile/target `24`/`36`/`36`.

Install Node.js 22+, pnpm, JDK 21, and the Android SDK with platform 36. Set `JAVA_HOME`. For SDK discovery, set `ANDROID_HOME` or create an untracked `android/local.properties` containing `sdk.dir` for your installation. The Gradle wrapper script also checks the conventional Windows SDK location. Android Studio is useful for SDK management and `pnpm android:open`.

## First build and regeneration

From the project root, after dependency installation:

```sh
pnpm cap:sync
pnpm android:debug
```

`pnpm cap:sync` runs `pnpm build:android:web` (including the existing configuration check) before `cap sync android`. It recreates generated web assets, Capacitor JSON/XML, Cordova plugin scaffolding, `android/capacitor.settings.gradle`, and `android/app/capacitor.build.gradle`. Those generated files are excluded from this public copy. Sync before invoking Gradle or opening the fresh native project.

For separate inspection of the export, `pnpm build:android:web` produces `out/`; `pnpm check:android-export-boundary` checks the route/configuration boundary without building. `pnpm check:android-env` checks app configuration, not the installed JDK/SDK or device behavior. Native Java/XML changes remain under `android/app/src/main/`; copied web assets are never the source of app behavior.

The export wrapper parks the music metadata, RAWG, and exercise-media API routes and restores them after the child build. Normal web builds retain them. Configure `NEXT_PUBLIC_APP_URL` as a credential-free HTTPS origin with those routes deployed if Android should use their online services. RAWG and Spotify credentials remain on that web server. Core manual records do not require those endpoints.

## Application entry and integrations

Android enters the Caizen application directly, with `/app/` as the product route and no public landing experience. The export root renders the application shell, and missing native routes recover to `/app/`. Native storage discovery and the shared Demo recovery gate precede provider hydration. Cold-start navigation is queued until the native shell has hydrated profile state.

The custom bridge and native resources provide calendar intents, Save As, privacy-screen control, widget snapshots, shortcuts, and external activity handling. Official Capacitor plugins supply camera/filesystem, local notifications, sharing, preferences, and other integrations. The four registered widgets are Calendar, Routines, Today, and Work Tasks. They consume sanitized projections and queued actions; IndexedDB remains authoritative.

The source manifest includes Internet, camera, and notification permissions, optional camera hardware, single-task entry, `caizen://` intents, a non-exported FileProvider, disabled Android backup, and disabled cleartext traffic. Plugin manifests can add merged declarations. Delivery timing, process restoration, launchers, keyboard behavior, and native permission flows require device verification.

## Release tasks and signing

```sh
pnpm android:release:apk
pnpm android:release:aab
```

Both release scripts perform web build and sync before Gradle. Signing reads an untracked `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`, or these existing environment variables:

- `CAIZEN_RELEASE_STORE_FILE`
- `CAIZEN_RELEASE_STORE_PASSWORD`
- `CAIZEN_RELEASE_KEY_ALIAS`
- `CAIZEN_RELEASE_KEY_PASSWORD`

No signing keys or signing properties are supplied. Configure your own signing identity outside version control. Without complete signing configuration, a release APK may be unsigned.

| Artifact | Expected path |
| --- | --- |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Signed release APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Release AAB | `android/app/build/outputs/bundle/release/app-release.aab` |

All built APK/AAB files are ignored. The landing page's `/downloads/caizen-android.apk` link needs a separately supplied deployment artifact.

## Updates and retained checks

Back up existing data before device work. An update install uses:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

An update requires matching package ID and signing identity. Uninstalling or clearing app data removes profiles, preferences, widget state, and app-private media. This public copy does not include the original signing identity, so a newly signed build cannot be assumed to update an existing installation.

`pnpm test` runs retained Vitest tests. `pnpm test:android-static` checks initial/reload/missing-route entry after an export. Other retained audit scripts cover responsive presentation, tokens, keyboard, calendar, and device scenarios; their browser/device prerequisites remain as implemented in `scripts/`.

No build, sync, APK installation, signing, browser audit, or device check was run while preparing this copy. Buildability, production endpoints/auth callbacks, and physical-device behavior are **Unverified**.
