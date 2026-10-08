'use client';

import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ResponsiveControlStrip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const syncScrollState = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const overflowing = strip.scrollWidth > strip.clientWidth + 1;
    setHasOverflow(overflowing);
    setCanScrollForward(
      overflowing && strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1,
    );
  }, []);

  useEffect(() => {
    syncScrollState();
    window.addEventListener('resize', syncScrollState);
    const strip = stripRef.current;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncScrollState)
      : undefined;
    if (strip && observer) observer.observe(strip);

    return () => {
      window.removeEventListener('resize', syncScrollState);
      observer?.disconnect();
    };
  }, [syncScrollState]);

  const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const target = event.target;
    if (!strip || !(target instanceof HTMLElement)) return;

    const stripRect = strip.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const leftDelta = targetRect.left - stripRect.left;
    const rightDelta = targetRect.right - stripRect.right;
    const delta = leftDelta < 0 ? leftDelta : rightDelta > 0 ? rightDelta : 0;
    if (delta) strip.scrollTo({ left: Math.max(0, strip.scrollLeft + delta) });
  };

  return (
    <div className="responsive-control-strip-shell">
      <div
        ref={stripRef}
        data-responsive-control-strip="true"
        role="group"
        aria-label={label}
        aria-describedby={hasOverflow ? hintId : undefined}
        className={cn('responsive-control-strip', className)}
        onScroll={syncScrollState}
        onFocusCapture={handleFocusCapture}
      >
        {children}
      </div>
      {hasOverflow && (
        <>
          <span id={hintId} className="sr-only">
            More {label.toLowerCase()} are available. Scroll horizontally to see them.
          </span>
          {canScrollForward && (
            <div className="responsive-control-strip-hint" aria-hidden="true">
              <span>Scroll for more</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
