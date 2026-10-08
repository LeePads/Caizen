'use client'

import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { CircleIcon } from 'lucide-react'

import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled'
import { cn } from '@/lib/utils'

const RadioSelectionFeedbackContext = React.createContext({
  revision: 0,
  active: false,
  complete: () => {},
})

function RadioGroup({
  className,
  onValueChange,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  const [feedbackRevision, setFeedbackRevision] = React.useState(0)
  const [feedbackActive, setFeedbackActive] = React.useState(false)
  const motionMode = useCaizenMotionMode()
  const previousMotionMode = React.useRef(motionMode)

  React.useEffect(() => {
    if (previousMotionMode.current === motionMode) return
    previousMotionMode.current = motionMode
    setFeedbackActive(false)
  }, [motionMode])

  const feedback = React.useMemo(() => ({
    revision: feedbackRevision,
    active: feedbackActive,
    complete: () => setFeedbackActive(false),
  }), [feedbackActive, feedbackRevision])

  return (
    <RadioSelectionFeedbackContext.Provider value={feedback}>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        className={cn('grid gap-3', className)}
        {...props}
        onValueChange={next => {
          setFeedbackRevision(revision => revision + 1)
          setFeedbackActive(motionMode === 'full' || motionMode === 'android')
          onValueChange?.(next)
        }}
      />
    </RadioSelectionFeedbackContext.Provider>
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const feedback = React.useContext(RadioSelectionFeedbackContext)

  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'relative border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none after:absolute after:-inset-3 after:content-[""] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        key={feedback.revision}
        data-caizen-selection-feedback={feedback.active ? 'active' : undefined}
        className="relative flex items-center justify-center"
        onAnimationEnd={feedback.complete}
      >
        <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
