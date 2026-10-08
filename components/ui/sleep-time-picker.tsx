'use client';

import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  CaizenBottomSheet,
  TimeWheelPicker,
} from '@/components/native/android-design';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { isNativeApp } from '@/lib/platform';
import {
  fromTimeParts,
  isValidTimeValue,
  toTimeParts,
} from '@/lib/native/wheel-date-time';

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
};

function displayTime(value: string) {
  if (!isValidTimeValue(value)) return 'Set time';
  return new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CaizenTimePicker({
  id,
  label,
  value,
  onChange,
  className = '',
  required = false,
  ariaDescribedBy,
  ariaInvalid,
  'aria-describedby': ariaDescribedByAttribute,
  'aria-invalid': ariaInvalidAttribute,
  'aria-required': ariaRequiredAttribute,
}: Props) {
  const isMobile = useIsMobile();
  const native = isNativeApp();
  const describedBy = ariaDescribedByAttribute ?? ariaDescribedBy;
  const invalid = ariaInvalidAttribute ?? ariaInvalid;
  const ariaIsRequired = required || Boolean(ariaRequiredAttribute);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    toTimeParts(isValidTimeValue(value) ? value : '12:00'),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(toTimeParts(isValidTimeValue(value) ? value : '12:00'));
  }, [open, value]);

  const commit = () => {
    onChange(fromTimeParts(draft.hour12, draft.minute, draft.meridiem));
    setOpen(false);
  };

  const clear = () => {
    if (required) return;
    onChange('');
    setOpen(false);
  };

  const picker = (
    <div className="cz-wheel-picker">
      <TimeWheelPicker
        hour12={draft.hour12}
        minute={draft.minute}
        meridiem={draft.meridiem}
        minuteStep={1}
        onChange={(hour12, minute, meridiem) =>
          setDraft({ hour12, minute, meridiem })
        }
      />
      <div className={`caizen-time-picker-actions ${native || isMobile ? 'caizen-time-picker-actions--touch' : ''} mt-3 grid grid-cols-3 gap-2`}>
        <button
          type="button"
          className="cz-wheel-action-clear min-h-10 rounded-xl border px-2 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
          onClick={clear}
          disabled={required}
        >
          Clear
        </button>
        <button
          type="button"
          className="cz-wheel-action-cancel min-h-10 rounded-xl border px-2 text-sm font-extrabold"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="cz-wheel-action-set min-h-10 rounded-xl px-2 text-sm font-extrabold"
          onClick={commit}
        >
          Set
        </button>
      </div>
    </div>
  );

  const trigger = (
    <button
      id={id}
      type="button"
      className={`flex min-h-11 w-full items-center gap-2 rounded-xl border border-border/60 bg-input px-3 text-left font-semibold transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 ${className}`}
      onClick={native ? () => setOpen(true) : undefined}
      aria-label={`${label}${ariaIsRequired ? ', required' : ''}${invalid ? ', invalid' : ''}: ${displayTime(value)}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-describedby={describedBy}
    >
      <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className={isValidTimeValue(value) ? 'text-foreground' : 'text-muted-foreground'}>
        {displayTime(value)}
      </span>
    </button>
  );

  if (native) {
    return (
      <>
        {trigger}
        <CaizenBottomSheet
          open={open}
          title={label}
          onClose={() => setOpen(false)}
        >
          {picker}
        </CaizenBottomSheet>
      </>
    );
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85dvh] rounded-t-2xl border-border bg-background">
          <DrawerHeader className="px-4 pb-0 pt-3 text-left">
            <DrawerTitle>{label}</DrawerTitle>
            <DrawerDescription>
              Select an hour, minute, and AM/PM, then choose Set.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {picker}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        onOpenAutoFocus={event => event.preventDefault()}
        className="w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-border bg-background p-2.5 shadow-md"
      >
        {picker}
      </PopoverContent>
    </Popover>
  );
}

// Preserve the existing SleepTimePicker import while exposing the picker as a
// shared Caizen control for other Health scheduling surfaces.
export const SleepTimePicker = CaizenTimePicker;
export default SleepTimePicker;
