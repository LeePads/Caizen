# Caizen

A personal life manager for the web and Android.

Caizen started as a simple project to organize my inventory. Over time, it grew into a workspace for managing everyday life, from tasks and routines to finances, health, work, and personal collections.

The idea is simple: keep the things that matter in one place, without making them harder to manage.

**[Visit Website](https://www.caizen.space)** · **[Open Caizen](https://www.caizen.space/app/)** · **[Android Releases](https://github.com/LeePads/Caizen/releases)**

## What you can do

- **Life Hub** — Manage tasks, routines, and your daily schedule.
- **Money** — Track expenses, budgets, and accounts.
- **Health** — Log workouts, nutrition, sleep, and other health activities.
- **Inventory** — Keep track of your belongings and collections.
- **Entertainment** — Organize games, books, movies, and music.
- **Work Hub** — Manage projects, tasks, and work-related information.
- **Personal Vault** — Keep personal records and important details together.

Caizen works with local profiles, so you can get started without creating an account. Your records are stored on your device, with optional Cloud Backup if you choose to use it.

## Getting started

You can use Caizen directly in your browser or download the Android app from the Releases page when a build is available.

If you'd like to run the project locally, you'll need Node.js 22+ and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` in your browser.

On Windows PowerShell, you can use `pnpm.cmd` instead of `pnpm`.

## Built with

Next.js, React, TypeScript, Tailwind CSS, Capacitor, and Supabase for optional Cloud Backup.

## Documentation

More detailed information is available here:

- [Architecture](docs/ARCHITECTURE.md)
- [Android setup](docs/ANDROID.md)
- [Storage and recovery](docs/STORAGE.md)
- [Backup and Cloud](docs/BACKUP-SYNC.md)

## A note on your data

Caizen is local-first. You can use its core features without an account, and Cloud Backup is optional.

Exported backups may contain personal information and are not encrypted, so keep them somewhere safe. The web app also needs a connection to load when it isn't already available in your browser.

---

Caizen is a personal project that continues to grow and improve.
