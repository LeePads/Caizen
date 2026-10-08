'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary. This replaces the whole document, so it cannot rely on
 * the app's theme provider or stylesheet tokens being available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Caizen fatal error.', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          boxSizing: 'border-box',
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#07111f',
          color: '#e6edf7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '22rem' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Caizen could not start</h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.75, marginTop: '0.5rem' }}>
            Try opening Caizen again. Avoid clearing site data while recovering access to your local records.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1rem',
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#f59e0b',
              color: '#1a1205',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
