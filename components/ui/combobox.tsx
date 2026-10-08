'use client';

import { Check, ChevronsUpDown, Plus, RotateCcw } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  icon?: ReactNode;
  group?: string;
}

interface ComboboxProps {
  id?: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  clearable?: boolean;
  /**
   * Visual treatment of the closed trigger only. 'default' (opaque) is the
   * standard look and must stay the default so existing call sites --
   * especially ones inside modals/dialogs -- are unaffected. 'transparent'
   * uses a subtle dedicated surface for page-level toolbar filters.
   * The popup/listbox content is never affected by this.
   */
  surface?: 'default' | 'transparent';
}

function groupedOptions(options: ComboboxOption[]) {
  return Array.from(
    options.reduce((groups, option) => {
      const group = option.group || '';
      groups.set(group, [...(groups.get(group) || []), option]);
      return groups;
    }, new Map<string, ComboboxOption[]>())
  );
}

function normalizedOptionKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options...',
  emptyText = 'No matching options.',
  ariaLabel,
  ariaDescribedBy,
  className,
  disabled,
  name,
  clearable,
  surface = 'default',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      // Comboboxes are frequently rendered inside a modal Dialog. Keeping the
      // popover non-modal prevents Radix's nested dismissable layers from
      // treating the opening pointer event as an outside interaction and
      // immediately closing the list before the user can select an option.
      modal={false}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverTrigger asChild>
        <Button
          id={id}
          data-slot="combobox-trigger"
          data-caizen-motion-ring="true"
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          className={cn('h-11 w-full justify-between rounded-xl border-border px-3 font-medium shadow-none outline-none focus:border-primary/70 focus:shadow-none focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/60 focus-visible:ring-0', surface === 'transparent' ? 'combobox-trigger-transparent' : 'bg-background', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label || value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={event => event.preventDefault()}
        className="caizen-combobox-popover w-[var(--radix-popover-trigger-width)] min-w-64 max-h-[min(70dvh,var(--cz-vh,100dvh),32rem)] overflow-hidden rounded-2xl border-border bg-popover p-0 shadow-2xl"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groupedOptions(options).map(([group, groupItems]) => <CommandGroup key={group} heading={group || undefined}>
              {groupItems.map(option => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value} ${option.description || ''} ${option.searchText || ''}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="min-h-11 rounded-lg px-3"
                >
                  <Check className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>)}
            {clearable && value && <CommandGroup><CommandItem value="clear selection" onSelect={() => { onChange(''); setOpen(false); }} className="min-h-11 rounded-lg px-3 text-muted-foreground"><RotateCcw className="size-4" />Clear selection</CommandItem></CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface CreatableComboboxProps extends Omit<ComboboxProps, 'emptyText'> {
  createLabel?: (value: string) => string;
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  createLabel = value => `Add "${value}"`,
  ...props
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim();
  const exactMatch = options.some(option =>
    normalizedOptionKey(option.label) === normalizedOptionKey(normalizedQuery) ||
    normalizedOptionKey(option.value) === normalizedOptionKey(normalizedQuery)
  );
  const selected = useMemo(() => options.find(option => option.value === value), [options, value]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={next => { setOpen(next); if (!next) setQuery(''); }}
      modal={false}
    >
      {props.name && <input type="hidden" name={props.name} value={value} />}
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={props.ariaLabel}
          aria-describedby={props.ariaDescribedBy}
          disabled={props.disabled}
          data-caizen-motion-ring="true"
          className={cn('h-11 w-full justify-between rounded-xl border-border px-3 font-medium shadow-none outline-none focus:border-primary/70 focus:shadow-none focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/60 focus-visible:ring-0', props.surface === 'transparent' ? 'combobox-trigger-transparent' : 'bg-background', props.className)}
        >
          <span className={cn('truncate', !selected && !value && 'text-muted-foreground')}>
            {selected?.label || value || props.placeholder || 'Select or create an option'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={event => event.preventDefault()}
        className="caizen-combobox-popover w-[var(--radix-popover-trigger-width)] min-w-64 max-h-[min(70dvh,var(--cz-vh,100dvh),32rem)] overflow-hidden rounded-2xl border-border bg-popover p-0 shadow-2xl"
      >
        <Command shouldFilter>
          <CommandInput value={query} onValueChange={setQuery} placeholder={props.searchPlaceholder || 'Search or create...'} />
          <CommandList>
            <CommandEmpty>{normalizedQuery ? 'Create a new option below.' : 'Start typing to add an option.'}</CommandEmpty>
            {groupedOptions(options).map(([group, groupItems]) => <CommandGroup key={group} heading={group || undefined}>
              {groupItems.map(option => (
                <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => choose(option.value)} className="min-h-11 rounded-lg px-3">
                  <Check className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>)}
            <CommandGroup>
              {normalizedQuery && !exactMatch && (
                <CommandItem value={`create ${normalizedQuery}`} onSelect={() => choose(normalizedQuery)} className="min-h-11 rounded-lg px-3 font-semibold text-primary">
                  <Plus className="size-4" aria-hidden="true" />
                  {createLabel(normalizedQuery)}
                </CommandItem>
              )}
            </CommandGroup>
            {props.clearable && value && <CommandGroup><CommandItem value="clear selection" onSelect={() => choose('')} className="min-h-11 rounded-lg px-3 text-muted-foreground"><RotateCcw className="size-4" />Clear selection</CommandItem></CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
