'use client'

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  formatLocalDateInput as formatLocalDate,
  parseLocalDateInputOrUndefined as parseLocalDate,
} from '@/lib/date-utils'
import { AndroidAdaptiveDateInput } from '@/components/native/android-design'
import { isNativeApp } from '@/lib/platform'

function displayDate(value: string) {
  const date = parseLocalDate(value)

  return date?.toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  )
}

function displayMonth(value: string) {
  const date = parseLocalDate(value)

  return date?.toLocaleDateString(
    undefined,
    {
      month: 'long',
      year: 'numeric',
    },
  )
}

const MONTH_LABELS = Array.from(
  { length: 12 },
  (_, index) =>
    new Date(
      2000,
      index,
      1,
    ).toLocaleString('default', {
      month: 'long',
    }),
)

function YearPickerList({
  selectedYear,
  min,
  max,
  onSelectYear,
}: {
  selectedYear: number
  min?: string
  max?: string
  onSelectYear: (year: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const minYear = parseLocalDate(min || '')?.getFullYear() ?? 1900
  const maxYear = parseLocalDate(max || '')?.getFullYear() ?? 2100
  const years = Array.from(
    { length: Math.max(1, maxYear - minYear + 1) },
    (_, index) => minYear + index,
  )

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-selected-year="true"]')
      ?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Select year"
      className="max-h-72 overflow-y-auto py-2"
    >
      {years.map(year => {
        const isSelected = year === selectedYear
        return (
          <button
            key={year}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-selected-year={isSelected || undefined}
            onClick={() => onSelectYear(year)}
            className={cn(
              'block w-full py-2.5 text-center text-lg font-bold transition-colors',
              isSelected
                ? 'text-2xl font-black text-primary'
                : 'text-foreground hover:bg-muted',
            )}
          >
            {year}
          </button>
        )
      })}
    </div>
  )
}


function MonthOnlyPicker({
  visibleMonth,
  draft,
  onMonthChange,
  onMonthYearChange,
  min,
  max,
}: {
  visibleMonth: Date
  draft?: Date
  onMonthChange: (date: Date) => void
  onMonthYearChange: (date: Date) => void
  min?: string
  max?: string
}) {
  const year = visibleMonth.getFullYear()
  const minDate = parseLocalDate(min || '')
  const maxDate = parseLocalDate(max || '')
  const previousYearEnd = new Date(year - 1, 11, 31)
  const nextYearStart = new Date(year + 1, 0, 1)

  const isMonthDisabled = (month: number) => {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    return Boolean(
      (minDate && monthEnd < minDate) ||
      (maxDate && monthStart > maxDate),
    )
  }

  return (
    <div className="w-[19.25rem] max-w-[calc(100vw-1.5rem)] p-3 sm:w-[19.25rem]">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-xl"
          disabled={Boolean(minDate && previousYearEnd < minDate)}
          onClick={() => onMonthChange(new Date(year - 1, visibleMonth.getMonth(), 1))}
          aria-label="Previous year"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="text-sm font-black tabular-nums">{year}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-xl"
          disabled={Boolean(maxDate && nextYearStart > maxDate)}
          onClick={() => onMonthChange(new Date(year + 1, visibleMonth.getMonth(), 1))}
          aria-label="Next year"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {MONTH_LABELS.map((label, month) => {
          const selected = draft?.getFullYear() === year && draft?.getMonth() === month
          const disabled = isMonthDisabled(month)
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onMonthYearChange(new Date(year, month, 1))}
              className={cn(
                'min-h-10 rounded-xl px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
                selected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {label.slice(0, 3)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  clearable?: boolean
  name?: string
  min?: string
  max?: string
  required?: boolean
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  ariaRequired?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  monthOnly?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DatePicker({
  id,
  value,
  onChange,
  label = 'Date',
  placeholder = 'Choose a date',
  className,
  disabled = false,
  clearable = true,
  required = false,
  min,
  max,
  name,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  'aria-describedby': ariaDescribedByAttribute,
  'aria-invalid': ariaInvalidAttribute,
  'aria-required': ariaRequiredAttribute,
  monthOnly = false,
}: DatePickerProps) {
  const describedBy = ariaDescribedByAttribute ?? ariaDescribedBy;
  const invalid = ariaInvalidAttribute ?? ariaInvalid;
  const ariaIsRequired = required || Boolean(ariaRequiredAttribute ?? ariaRequired);
  const isMobile = useIsMobile()
  const nativeApp = isNativeApp()

  const [open, setOpen] =
    useState(false)

  const [animateMonthChanges, setAnimateMonthChanges] = useState(false)
  const [monthTransitionDirection, setMonthTransitionDirection] = useState<-1 | 0 | 1>(0)

  const [view, setView] =
    useState<'calendar' | 'year'>('calendar')

  const [draft, setDraft] =
    useState<Date | undefined>(() =>
      parseLocalDate(value),
    )

  const [
    visibleMonth,
    setVisibleMonth,
  ] = useState<Date>(
    () =>
      parseLocalDate(value) ||
      new Date(),
  )

  const setOpenState = (
    next: boolean,
  ) => {
    if (next) {
      const selected =
        parseLocalDate(value)

      setDraft(selected)
      setVisibleMonth(
        selected || new Date(),
      )
      setAnimateMonthChanges(false)
      setMonthTransitionDirection(0)
    }

    setView('calendar')
    setOpen(next)
  }

  // Calendar navigation changes the displayed month. Explicit month/year
  // selection also updates the pending date so Done commits the year/month
  // the user chose, even when they do not click a day afterward.
  const changeVisibleMonth = (
    nextMonth: Date,
  ) => {
    const currentIndex = visibleMonth.getFullYear() * 12 + visibleMonth.getMonth()
    const nextIndex = nextMonth.getFullYear() * 12 + nextMonth.getMonth()
    setAnimateMonthChanges(true)
    setMonthTransitionDirection(nextIndex === currentIndex ? 0 : nextIndex > currentIndex ? 1 : -1)
    setVisibleMonth(nextMonth)
  }

  const changeSelectedMonth = (nextMonth: Date) => {
    const source = draft || visibleMonth
    const lastDay = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth() + 1,
      0,
    ).getDate()
    const nextDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(source.getDate(), lastDay),
    )
    const minDate = parseLocalDate(min || '')
    const maxDate = parseLocalDate(max || '')
    const boundedDate =
      minDate && nextDate < minDate
        ? minDate
        : maxDate && nextDate > maxDate
          ? maxDate
          : nextDate

    setDraft(boundedDate)
    changeVisibleMonth(boundedDate)
  }

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      disabled={disabled}
      aria-required={
        ariaIsRequired || undefined
      }
      aria-label={`${label}: ${
        (monthOnly ? displayMonth(value) : displayDate(value)) ||
        'not set'
      }`}
      aria-describedby={
        describedBy
      }
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full justify-start rounded-xl bg-background px-3 text-left font-medium',
        !value &&
          'text-muted-foreground',
        className,
      )}
    >
      <CalendarDays
        className="mr-2 size-4 shrink-0"
        aria-hidden="true"
      />

      <span className="truncate">
        {(monthOnly ? displayMonth(value) : displayDate(value)) ||
          placeholder}
      </span>
    </Button>
  )

  const selectedYear = (draft ?? visibleMonth).getFullYear()

  const picker = (
    <div className={cn(
      monthOnly ? 'w-full min-w-0' : isMobile ? 'w-[20rem] max-w-[calc(100vw-1.5rem)]' : 'w-full min-w-0',
      nativeApp && 'android-balance-date-picker-content',
    )}>
      {!monthOnly ? (
        <div className="border-b border-border bg-muted/40 px-3.5 py-1.5">
          <button
            type="button"
            onClick={() => setView(current => current === 'year' ? 'calendar' : 'year')}
            aria-expanded={view === 'year'}
            aria-label={`${view === 'year' ? 'Close' : 'Open'} year picker, currently ${selectedYear}`}
            className="rounded-md text-[0.7rem] font-bold uppercase leading-none tracking-wide text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selectedYear}
          </button>
          <p className="truncate text-base font-black leading-tight">
            {draft
              ? draft.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
              : 'Select a date'}
          </p>
        </div>
      ) : null}
      {monthOnly ? (
        <MonthOnlyPicker
          visibleMonth={visibleMonth}
          draft={draft}
          onMonthChange={changeVisibleMonth}
          onMonthYearChange={changeSelectedMonth}
          min={min}
          max={max}
        />
      ) : view === 'year' ? (
        <YearPickerList
          selectedYear={selectedYear}
          min={min}
          max={max}
          onSelectYear={year => {
            changeSelectedMonth(new Date(year, visibleMonth.getMonth(), 1))
            setView('calendar')
          }}
        />
      ) : (
        <Calendar
          mode="single"
          selected={draft}
          onSelect={date => {
            setDraft(date)

            if (date) {
              setAnimateMonthChanges(false)
              setMonthTransitionDirection(0)
              setVisibleMonth(date)
            }
          }}
          month={visibleMonth}
          onMonthChange={
            changeVisibleMonth
          }
          animateMonthChanges={animateMonthChanges}
          monthTransitionDirection={monthTransitionDirection}
          startMonth={
            parseLocalDate(
              min || '',
            ) || new Date(1900, 0)
          }
          endMonth={
            parseLocalDate(
              max || '',
            ) ||
            new Date(2100, 11)
          }
          disabled={date =>
            Boolean(
              (min &&
                formatLocalDate(date) <
                  min) ||
                (max &&
                  formatLocalDate(date) >
                    max),
            )
          }
          className="caizen-form-date-picker-calendar mx-auto bg-background px-1.5 pt-0 pb-0.5 [--cell-size:2.5rem]"
          classNames={{
            month_caption: 'flex h-8 w-full items-center justify-center px-9 text-sm font-black',
            caption_label: 'text-sm font-black',
            button_previous: 'size-7 rounded-full',
            button_next: 'size-7 rounded-full',
            weekdays: 'flex w-full',
            weekday: 'flex h-6 w-[var(--cell-size)] shrink-0 items-center justify-center text-[0.7rem] font-bold text-muted-foreground',
            week: 'mt-0 flex w-full',
          }}
        />
      )}

      <div
        className={cn('grid w-full min-w-0 gap-1 border-t border-border p-1', clearable && !ariaIsRequired ? 'grid-cols-[repeat(4,minmax(0,1fr))]' : 'grid-cols-[repeat(3,minmax(0,1fr))]', view === 'year' && 'hidden', nativeApp && 'android-balance-date-actions')}
        data-action-count={nativeApp ? (clearable && !ariaIsRequired ? '4' : '3') : undefined}
      >
        {clearable && !ariaIsRequired ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 min-w-0 whitespace-nowrap px-1.5 text-xs sm:h-7"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            Clear
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 min-w-0 whitespace-nowrap px-1.5 text-xs sm:h-7"
          onClick={() => {
            const today = new Date()

            const todayValue =
              formatLocalDate(today)

            const next =
              min &&
              todayValue < min
                ? parseLocalDate(min)
                : max &&
                    todayValue > max
                  ? parseLocalDate(
                      max,
                    )
                  : today

            if (next) {
              setDraft(next)
              changeVisibleMonth(next)
            }
          }}
        >
          {monthOnly ? 'This month' : 'Today'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 min-w-0 whitespace-nowrap px-1.5 text-xs sm:h-7"
          onClick={() =>
            setOpen(false)
          }
        >
          Cancel
        </Button>

        <Button
          type="button"
          size="sm"
          className="h-11 min-w-0 whitespace-nowrap px-1.5 text-xs sm:h-7"
          disabled={
            !draft ||
            Boolean(
              draft &&
                ((min &&
                  formatLocalDate(
                    draft,
                  ) < min) ||
                  (max &&
                    formatLocalDate(
                      draft,
                    ) > max)),
            )
          }
          onClick={() => {
            if (draft) {
              onChange(
                monthOnly
                  ? formatLocalDate(draft).slice(0, 7)
                  : formatLocalDate(draft),
              )
            }

            setOpen(false)
          }}
        >
          Done
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value}
        />
      ) : null}
      {isMobile ? (
        <Drawer
          open={open}
          onOpenChange={setOpenState}
        >
          <DrawerTrigger asChild>
            {trigger}
          </DrawerTrigger>

          <DrawerContent className={cn('max-h-[85dvh] rounded-t-2xl border-border bg-background', nativeApp && 'android-balance-date-picker-sheet')}>
            <DrawerHeader className="px-4 pb-0 pt-3 text-left">
              <DrawerTitle>
                {label}
              </DrawerTitle>

              <DrawerDescription>
                Select a date, then
                choose Done.
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {picker}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover
          open={open}
          onOpenChange={setOpenState}
          // DatePicker is commonly rendered inside Caizen's custom modal
          // shell. Keep the nested picker non-modal so Radix does not treat
          // the parent dialog as an outside interaction and immediately
          // dismiss the picker after the trigger gesture.
          modal={false}
        >
          <PopoverTrigger asChild>
            {trigger}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            // The parent modal owns focus trapping. The picker stays
            // interactive through its portalled content without stealing
            // focus into a second modal layer.
            onOpenAutoFocus={event => event.preventDefault()}
            // Nested pickers that portal their own listbox to document.body
            // (marked with data-caizen-nested-popover) would otherwise be
            // treated as outside interactions by Radix's dismissable layer,
            // closing this picker mid-selection. Recognize that portal via
            // its marker attribute and let it through.
            onInteractOutside={event => {
              const target = event.target
              if (
                target instanceof Element &&
                target.closest('[data-caizen-nested-popover]')
              ) {
                event.preventDefault()
              }
            }}
            className={cn(!monthOnly && 'caizen-form-date-picker', 'w-auto overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl')}
          >
            {picker}
          </PopoverContent>
        </Popover>
      )}
    </>
  )
}

export function AdaptiveDatePicker(
  props: DatePickerProps,
) {
  if (isNativeApp()) {
    return (
      <AndroidAdaptiveDateInput
        id={props.id}
        label={
          props.label || 'Date'
        }
        value={props.value}
        onChange={props.onChange}
        onOpenChange={props.onOpenChange}
        className={props.className}
        clearable={
          props.clearable
        }
        disabled={props.disabled}
        min={props.min}
        max={props.max}
        required={props.required}
        ariaDescribedBy={
          props['aria-describedby'] ?? props.ariaDescribedBy
        }
        ariaInvalid={props['aria-invalid'] ?? props.ariaInvalid}
        ariaRequired={props['aria-required'] ?? props.ariaRequired}
        placeholder={props.placeholder}
        name={props.name}
      />
    )
  }

  return <DatePicker {...props} />
}

export {
  formatLocalDate,
  parseLocalDate,
}
