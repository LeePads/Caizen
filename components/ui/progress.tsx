'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled'
import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const max = typeof props.max === 'number' && Number.isFinite(props.max) && props.max > 0
    ? props.max
    : 100;
  const normalizedValue = value == null
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(0, value))
      : 0;
  const visualValue = normalizedValue == null ? 0 : normalizedValue / max;
  const motionMode = useCaizenMotionMode();
  const previousMotionMode = React.useRef(motionMode);
  const [fill, setFill] = React.useState(() => ({
    from: visualValue,
    to: visualValue,
    revision: 0,
    animating: false,
  }));

  React.useLayoutEffect(() => {
    setFill(current => current.to === visualValue
      ? current
      : {
        from: current.to,
        to: visualValue,
        revision: current.revision + 1,
        animating: motionMode === 'full' || motionMode === 'android',
      });
  }, [motionMode, visualValue]);
  React.useEffect(() => {
    if (previousMotionMode.current === motionMode) return;
    previousMotionMode.current = motionMode;
    setFill(current => current.animating ? { ...current, animating: false } : current);
  }, [motionMode]);
  const overshootValue = fill.to >= fill.from
    ? Math.min(1, fill.to + 0.018)
    : Math.max(0, fill.to - 0.018);

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={normalizedValue}
      className={cn(
        'bg-primary/15 relative h-2.5 w-full overflow-hidden rounded-full shadow-inner',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        key={fill.revision}
        data-caizen-progress-fill={fill.animating && normalizedValue != null ? 'spring' : 'static'}
        className="caizen-progress-fill bg-gradient-to-r from-primary via-primary/80 to-primary h-full w-full flex-1 rounded-full shadow-[0_0_14px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
        onAnimationEnd={() => setFill(current => current.animating ? { ...current, animating: false } : current)}
        style={{
          '--caizen-progress-from': fill.from,
          '--caizen-progress-to': fill.to,
          '--caizen-progress-overshoot': overshootValue,
        } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
