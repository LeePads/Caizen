'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StorageMigrationNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setMessage(detail || 'Caizen storage needs attention.');
    };
    window.addEventListener('caizen-storage-error', onError);
    return () => window.removeEventListener('caizen-storage-error', onError);
  }, []);

  if (!message) return null;

  return (
    <aside
      role="alert"
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1000] mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-amber-500/40 bg-background/95 p-4 shadow-xl backdrop-blur"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          <span className="web-copy">Local storage needs attention</span>
          <span className="android-copy">On-device storage needs attention</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your legacy recovery copy has not been deleted.
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Retry storage initialization"
        onClick={() => window.location.reload()}
      >
        <RotateCcw className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={() => setMessage(null)}>
        <X className="size-4" />
      </Button>
    </aside>
  );
}
