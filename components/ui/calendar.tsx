'use client'

import * as React from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  useDayPicker,
} from 'react-day-picker'

import { cn } from '@/lib/utils'
import {
  Button,
  buttonVariants,
} from '@/components/ui/button'
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled'

const CalendarMonthTransitionContext = React.createContext<{
  enabled: boolean;
  direction?: -1 | 0 | 1;
}>({ enabled: true })

function parseCssDuration(value: string, fallback: number) {
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) return fallback
  return value.trim().endsWith('ms') ? amount : amount * 1000
}

function CalendarMonthGrid(props: React.ComponentProps<'table'>) {
  const { months } = useDayPicker()
  const monthTransition = React.useContext(CalendarMonthTransitionContext)
  const { enabled, direction: requestedDirection } = monthTransition
  const motionMode = useCaizenMotionMode()
  const tableRef = React.useRef<HTMLTableElement>(null)
  const month = months[0]?.date
  const monthIndex = month ? month.getFullYear() * 12 + month.getMonth() : null
  const previousMonthIndex = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const previousIndex = previousMonthIndex.current
    previousMonthIndex.current = monthIndex
    if (monthIndex === null || !enabled || requestedDirection === 0 || previousIndex === monthIndex) return
    if (previousIndex === null && !requestedDirection) return
    if (motionMode === 'reduced' || motionMode === 'constrained') return

    const table = tableRef.current
    if (!table || typeof table.animate !== 'function') return

    const direction = requestedDirection ?? (previousIndex !== null && monthIndex > previousIndex ? 1 : -1)
    const horizontalOffset = motionMode === 'full' ? direction * 8 : 0
    const styles = getComputedStyle(document.documentElement)
    const duration = parseCssDuration(styles.getPropertyValue('--motion-micro').trim(), 140)
    const easing = styles.getPropertyValue('--ease-caizen').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)'
    const animation = table.animate(
      [
        { opacity: 0, transform: `translateX(${horizontalOffset}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration, easing },
    )

    return () => animation.cancel()
  }, [enabled, monthIndex, motionMode, requestedDirection])

  return <table {...props} ref={tableRef} />
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  hideCaptionLabel = false,
  animateMonthChanges = true,
  monthTransitionDirection,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  hideCaptionLabel?: boolean
  animateMonthChanges?: boolean
  monthTransitionDirection?: -1 | 0 | 1
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <CalendarMonthTransitionContext.Provider value={{
      enabled: animateMonthChanges,
      direction: monthTransitionDirection,
    }}>
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks
      captionLayout={captionLayout}
      className={cn(
        'group/calendar bg-background p-1.5 [--cell-size:2.75rem]',
        '[[data-slot=card-content]_&]:bg-transparent',
        '[[data-slot=popover-content]_&]:bg-transparent',
        String.raw`rtl:**:[.rdp-button_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button_previous>svg]:rotate-180`,
        className,
      )}
      formatters={{
        formatMonthDropdown: date =>
          date.toLocaleString('default', {
            month: 'short',
          }),
        ...formatters,
      }}
      classNames={{
        root: cn(
          'w-fit',
          defaultClassNames.root,
        ),

        months: cn(
          'relative flex flex-col gap-1.5 md:flex-row',
          defaultClassNames.months,
        ),

        month: cn(
          'flex w-full flex-col gap-1.5',
          defaultClassNames.month,
        ),

        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between',
          defaultClassNames.nav,
        ),

        button_previous: cn(
          buttonVariants({
            variant: buttonVariant,
          }),
          'size-[var(--cell-size)] p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),

        button_next: cn(
          buttonVariants({
            variant: buttonVariant,
          }),
          'size-[var(--cell-size)] p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),

        month_caption: cn(
          'flex h-[var(--cell-size)] w-full items-center justify-center px-[var(--cell-size)]',
          defaultClassNames.month_caption,
        ),

        dropdowns: cn(
          'flex h-[var(--cell-size)] w-full items-center justify-center gap-1 text-[0.7rem] font-medium',
          defaultClassNames.dropdowns,
        ),

        dropdown_root: cn(
          'caizen-date-picker-select-shell relative rounded-md border border-input shadow-xs has-focus:border-ring',
          defaultClassNames.dropdown_root,
        ),

        dropdown: cn(
          'absolute inset-0 bg-popover opacity-0',
          defaultClassNames.dropdown,
        ),

        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label'
            ? 'text-[0.7rem]'
            : 'flex h-6 items-center gap-1 rounded-md px-1.5 text-[0.7rem] [&>svg]:size-3 [&>svg]:text-muted-foreground',
          hideCaptionLabel && 'invisible',
          defaultClassNames.caption_label,
        ),

        month_grid: cn(
          'w-full border-collapse',
          defaultClassNames.month_grid,
        ),

        weekdays: cn(
          'flex w-full',
          defaultClassNames.weekdays,
        ),

        weekday: cn(
          'flex size-[var(--cell-size)] shrink-0 items-center justify-center',
          'select-none rounded-md text-center text-[0.65rem] font-medium text-muted-foreground',
          defaultClassNames.weekday,
        ),

        week: cn(
          'mt-0.5 flex w-full',
          defaultClassNames.week,
        ),

        week_number_header: cn(
          'flex size-[var(--cell-size)] shrink-0 items-center justify-center select-none',
          defaultClassNames.week_number_header,
        ),

        week_number: cn(
          'flex size-[var(--cell-size)] shrink-0 items-center justify-center',
          'select-none text-[0.65rem] text-muted-foreground',
          defaultClassNames.week_number,
        ),

        day: cn(
          'group/day relative size-[var(--cell-size)] shrink-0 p-0 text-center select-none',
          defaultClassNames.day,
        ),

        range_start: cn(
          'rounded-l-md bg-accent',
          defaultClassNames.range_start,
        ),

        range_middle: cn(
          'rounded-none',
          defaultClassNames.range_middle,
        ),

        range_end: cn(
          'rounded-r-md bg-accent',
          defaultClassNames.range_end,
        ),

        today: cn(
          'rounded-md bg-accent text-accent-foreground',
          defaultClassNames.today,
        ),

        outside: cn(
          'text-muted-foreground/60',
          defaultClassNames.outside,
        ),

        disabled: cn(
          'text-muted-foreground opacity-40',
          defaultClassNames.disabled,
        ),

        hidden: cn(
          'invisible',
          defaultClassNames.hidden,
        ),

        ...classNames,
      }}
      components={{
        Root: ({
          className,
          rootRef,
          ...rootProps
        }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(className)}
            {...rootProps}
          />
        ),

        Chevron: ({
          className,
          orientation,
          ...chevronProps
        }) => {
          if (orientation === 'left') {
            return (
              <ChevronLeftIcon
                className={cn(
                  'size-3',
                  className,
                )}
                {...chevronProps}
              />
            )
          }

          if (orientation === 'right') {
            return (
              <ChevronRightIcon
                className={cn(
                  'size-3',
                  className,
                )}
                {...chevronProps}
              />
            )
          }

          return (
            <ChevronDownIcon
              className={cn(
                'size-3',
                className,
              )}
              {...chevronProps}
            />
          )
        },

        DayButton: CalendarDayButton,

        WeekNumber: ({
          children,
          ...weekNumberProps
        }) => (
          <td {...weekNumberProps}>
            <div className="flex size-[var(--cell-size)] items-center justify-center text-center">
              {children}
            </div>
          </td>
        ),

        MonthGrid: CalendarMonthGrid,

        ...components,
      }}
      {...props}
    />
    </CalendarMonthTransitionContext.Provider>
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames =
    getDefaultClassNames()

  const ref =
    React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus()
    }
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={
        modifiers.range_start
      }
      data-range-end={
        modifiers.range_end
      }
      data-range-middle={
        modifiers.range_middle
      }
      className={cn(
        'flex size-[var(--cell-size)] min-w-[var(--cell-size)]',
        'flex-col items-center justify-center',
        'rounded-md text-[0.7rem] font-medium leading-none',

        'data-[selected-single=true]:bg-primary',
        'data-[selected-single=true]:text-primary-foreground',

        'data-[range-start=true]:bg-primary',
        'data-[range-start=true]:text-primary-foreground',

        'data-[range-end=true]:bg-primary',
        'data-[range-end=true]:text-primary-foreground',

        'data-[range-middle=true]:rounded-none',
        'data-[range-middle=true]:bg-accent',
        'data-[range-middle=true]:text-accent-foreground',

        'group-data-[focused=true]/day:relative',
        'group-data-[focused=true]/day:z-10',
        'group-data-[focused=true]/day:border-ring',
        'group-data-[focused=true]/day:ring-2',
        'group-data-[focused=true]/day:ring-ring/50',

        'dark:hover:text-accent-foreground',

        defaultClassNames.day_button,
        className,
      )}
      {...props}
    />
  )
}

export {
  Calendar,
  CalendarDayButton,
}
