'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function NotFound() {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.replace('/app/');
    }, 900);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md rounded-2xl border border-border/60 bg-card p-6">
        <p className="text-label text-muted-foreground">
          Route unavailable
        </p>
        <h1 className="mt-3 text-section-title">Returning to Caizen</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This page does not exist. The application will open automatically.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="/app/"
        >
          Open Caizen
        </Link>
      </div>
    </main>
  );
}
