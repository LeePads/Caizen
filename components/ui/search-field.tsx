'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SearchFieldProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  deferred?: boolean | number;
  surface?: 'page' | 'solid';
  onClear?: () => void;
  wrapperClassName?: string;
};

/** Shared search composition; deferred mode retains the 140ms idle update and blur flush. */
export function SearchField({
  value,
  onChange,
  deferred = false,
  surface = 'page',
  onClear,
  className,
  wrapperClassName,
  placeholder = 'Search…',
  'aria-label': ariaLabel = 'Search',
  onBlur,
  ...inputProps
}: SearchFieldProps) {
  const [draft, setDraft] = React.useState(value);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const delay = typeof deferred === 'number' ? deferred : 140;

  React.useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  React.useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    latestValueRef.current = value;
    setDraft(value);
  }, [value]);
  React.useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const commit = (nextValue: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    onChangeRef.current(nextValue);
  };

  const handleChange = (nextValue: string) => {
    latestValueRef.current = nextValue;
    setDraft(nextValue);
    if (!deferred) {
      commit(nextValue);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commit(nextValue), delay);
  };

  const clear = () => {
    latestValueRef.current = '';
    setDraft('');
    commit('');
    onClear?.();
  };

  return (
    <div
      data-slot="search-field"
      data-caizen-focus-shell="true"
      className={cn(
        'caizen-search-field relative flex h-11 min-w-0 items-center rounded-xl border border-input bg-input transition-colors',
        surface === 'solid' && 'bg-card',
        className,
        wrapperClassName,
      )}
    >
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 z-[1] size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...inputProps}
        data-search-field-input="true"
        data-caizen-focus-inner="true"
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={event => handleChange(event.target.value)}
        onBlur={event => {
          if (deferred) commit(latestValueRef.current);
          onBlur?.(event);
        }}
        className={cn(
          'h-full min-w-0 flex-1 rounded-xl border-0 bg-transparent pl-10 pr-11 text-sm shadow-none outline-none transition-none focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0',
        )}
      />
      {draft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          onClick={clear}
          className="absolute right-1 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
