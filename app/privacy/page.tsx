import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacy & data' };

export default function PrivacyPage() {
  return <main className="min-h-dvh bg-background px-5 py-10 text-foreground sm:py-16">
    <article className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Caizen home</Link>
        <h1 className="text-page-title">Privacy &amp; your data</h1>
        <p className="text-body text-muted-foreground">Start with a local profile. Cloud Backup is optional, and you can use the main workspace without an account.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-section-title">Records on this device</h2>
        <p className="text-body">Caizen stores profile records primarily in IndexedDB, with some preferences in browser or native storage. Local profiles separate your workspaces; they are not separate encrypted accounts. Personal Vault is a reference workspace, not a password manager.</p>
        <p className="text-body">Clearing browser site data or uninstalling the Android app can remove local records and media. Keep a backup you control before changing devices or clearing storage.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-section-title">Optional Cloud Backup</h2>
        <p className="text-body">Cloud accounts use Supabase authentication. Cloud Backup stores profile snapshots and managed media in Supabase. Automatic Cloud Backup is off by default and applies to the profile where you enable it. It is not live collaboration or real-time record sync.</p>
        <p className="text-body">Signing in does not automatically replace your local profiles. Review restore choices and media coverage before restoring a snapshot.</p>
        <p className="text-body">Google can sign you in to your optional Cloud Backup account. Google shares basic account information, such as your email, name, and profile image metadata, with Supabase for authentication. Signing in does not give Google access to your local Caizen records or replace your local profile. Previously enabled Automatic Cloud Backup settings still apply.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-section-title">External services</h2>
        <p className="text-body">Catalog searches, remote artwork, exercise media, music links, and other online features contact their respective services. Loading remote images or media sends a request to the host, which can receive your IP address and request information.</p>
        <p className="text-body">The production website on Vercel loads Vercel Analytics. Capacitor builds do not mount that analytics component. Local-first storage does not mean every online feature runs without external requests.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-section-title">Backups and removal</h2>
        <p className="text-body">A data-only export contains structured records, not local media files. A complete .caizen backup includes available media. Cloud snapshots have their own media coverage. Review the backup summary before relying on it.</p>
        <p className="text-body">Local deletion, Recently Deleted, recovery copies, and Cloud Backup are separate. Read the scope shown by each removal action; deleting a local record does not promise removal of every backup copy.</p>
      </section>
      <Link href="/app/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Open Caizen</Link>
    </article>
  </main>;
}
