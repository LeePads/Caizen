'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Caizen route error.', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-bold">Caizen hit an unexpected problem</h1>
        <p className="mt-2 text-sm text-muted-foreground">
            Try again or reload Caizen. Avoid clearing site data while recovering access to your local records.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
