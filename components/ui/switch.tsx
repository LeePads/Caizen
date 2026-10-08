'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const [feedbackRevision, setFeedbackRevision] = React.useState(0);
  const [feedbackActive, setFeedbackActive] = React.useState(false);
  const motionMode = useCaizenMotionMode();
  const previousMotionMode = React.useRef(motionMode);
  const { onCheckedChange, ...rootProps } = props;

  React.useEffect(() => {
    if (previousMotionMode.current === motionMode) return;
    previousMotionMode.current = motionMode;
    setFeedbackActive(false);
  }, [motionMode]);

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Track 36x20px, thumb 16px — a compact native-looking switch. The
        // after:-inset pseudo-element keeps the tappable hit area comfortable
        // even though the visual track itself is small.
        'peer relative inline-flex h-6 min-h-6 w-11 min-w-11 shrink-0 items-center rounded-full border border-border/70 bg-muted shadow-inner outline-none transition-[background-color,border-color] after:absolute after:-inset-3 after:content-[\"\"] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:border-primary/45 data-[state=checked]:bg-primary',
        className,
      )}
      {...rootProps}
      onCheckedChange={next => {
        setFeedbackRevision(revision => revision + 1);
        setFeedbackActive(motionMode === 'full' || motionMode === 'android');
        onCheckedChange?.(next);
      }}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        key={feedbackRevision}
        data-caizen-selection-feedback={feedbackActive ? 'active' : undefined}
        className="pointer-events-none ml-0.5 block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        onAnimationEnd={() => setFeedbackActive(false)}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
