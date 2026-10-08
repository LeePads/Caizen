'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { CheckIcon } from 'lucide-react'

import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled'
import { cn } from '@/lib/utils'

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
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
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none after:absolute after:-inset-3 after:content-[""] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rootProps}
      onCheckedChange={next => {
        setFeedbackRevision(revision => revision + 1);
        setFeedbackActive(motionMode === 'full' || motionMode === 'android');
        onCheckedChange?.(next);
      }}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        key={feedbackRevision}
        data-caizen-selection-feedback={feedbackActive ? 'active' : undefined}
        className="flex items-center justify-center text-current transition-none"
        onAnimationEnd={() => setFeedbackActive(false)}
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
