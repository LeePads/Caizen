'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';
import { cn } from '@/lib/utils';

/** Animates only a resolved, changed value. Callers keep content and privacy semantics. */
export function AnimatedMetricValue({
  valueKey,
  ready,
  children,
  className,
}: {
  valueKey: string | number;
  ready: boolean;
  children: ReactNode;
  className?: string;
}) {
  const motionMode = useCaizenMotionMode();
  const previousValueRef = useRef<string | number | undefined>(undefined);
  const [animationCycle, setAnimationCycle] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const previousValue = previousValueRef.current;
    previousValueRef.current = valueKey;
    if (Object.is(previousValue, valueKey) || motionMode === 'reduced' || motionMode === 'constrained') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    setAnimationCycle(current => current + 1);
  }, [motionMode, ready, valueKey]);

  return (
    <span
      key={animationCycle || 'static'}
      className={cn(animationCycle > 0 && 'caizen-summary-spring-roll', className)}
      data-caizen-metric-value="true"
    >
      {children}
    </span>
  );
}
