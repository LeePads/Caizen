'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { resolveMedia } from '@/lib/storage/media-resolver';
import { ResilientImage } from '@/components/media/ResilientImage';

type Props = {
  assetId: string;
  profileId: string;
  alt: string;
  className?: string;
  variant?: 'thumbnail' | 'full';
  fallback?: ReactNode;
};

export function MediaAssetImage({ assetId, profileId, alt, className, variant = 'thumbnail', fallback }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    setUrl(null);
    setMissing(false);
    void resolveMedia(assetId, {
      variant,
      purpose: variant === 'full' ? 'explicit-open' : 'display',
      expectedProfileId: profileId,
    }).then((resolved) => {
      if (!active) {
        resolved.release?.();
        return;
      }
      release = resolved.release;
      if (resolved.url) setUrl(resolved.url);
      else setMissing(true);
    }).catch(() => active && setMissing(true));
    return () => {
      active = false;
      release?.();
    };
  }, [assetId, profileId, variant]);

  if (missing) {
    if (fallback) return <>{fallback}</>;
    return (
      <div role="img" aria-label={`${alt || 'Image'} is missing`} className={`grid place-items-center bg-muted text-muted-foreground ${className ?? ''}`}>
        <ImageOff className="size-5" aria-hidden="true" />
      </div>
    );
  }
  if (!url) return fallback ? <>{fallback}</> : <div role="status" aria-live="polite" aria-label="Loading image" className={`animate-pulse bg-muted ${className ?? ''}`} />;
  return <ResilientImage src={url} alt={alt} className={className} loading="lazy" decoding="async" fallback={fallback} />;
}
