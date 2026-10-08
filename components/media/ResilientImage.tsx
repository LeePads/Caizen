/* eslint-disable @next/next/no-img-element -- catalog and local media URLs need native error/fallback handling without remote image configuration. */
'use client';

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode, type SyntheticEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src?: string | null;
  alt: string;
  fallback?: ReactNode;
  fallbackClassName?: string;
};

/** An external or managed image that degrades to a quiet, accessible placeholder. */
export function ResilientImage({
  src,
  alt,
  className,
  fallback,
  fallbackClassName,
  onError,
  referrerPolicy,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    if (fallback) return <>{fallback}</>;

    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt ? `${alt} unavailable` : undefined}
        aria-hidden={alt ? undefined : true}
        className={cn('grid place-items-center bg-muted text-muted-foreground', fallbackClassName || className)}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        {alt ? <span className="sr-only">{alt} unavailable</span> : null}
      </div>
    );
  }

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    setFailed(true);
    onError?.(event);
  };

  return <img {...props} src={src} alt={alt} className={className} referrerPolicy={referrerPolicy ?? 'no-referrer'} onError={handleError} />;
}
