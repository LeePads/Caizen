'use client';

import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

const suggestionDismissers = new WeakMap<Element, () => void>();

/** Editors consume Escape for their own inline suggestions before closing. */
export function dismissLocalSuggestionEscape(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || !(event.target instanceof Element)) return false;
  const wrapper = event.target.closest('[data-caizen-local-suggestions-open="true"]');
  const dismiss = wrapper && suggestionDismissers.get(wrapper);
  if (!dismiss) return false;
  dismiss();
  return true;
}

type LocalSuggestionInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  candidates: string[];
  onValueChange: (value: string) => void;
};

export function LocalSuggestionInput({ value, candidates, onValueChange, ...props }: LocalSuggestionInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const seen = new Set<string>();
  const query = value.trim().toLowerCase();
  const suggestions = candidates.map(candidate => candidate.trim()).filter(candidate => {
    const key = candidate.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return key !== query && key.includes(query);
  }).slice(0, 8);
  const visible = open && !props.disabled && suggestions.length > 0;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    suggestionDismissers.set(wrapper, () => setOpen(false));
    return () => { suggestionDismissers.delete(wrapper); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [visible]);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !active) return;
    if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
    }
  }, [activeIndex, visible]);

  const choose = (candidate: string) => {
    onValueChange(candidate);
    setOpen(false);
    setActiveIndex(-1);
  };

  return <div ref={wrapperRef} data-caizen-local-suggestions-open={visible ? 'true' : undefined} className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <Input
      {...props}
      value={value}
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={visible}
      aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      onFocus={event => { setOpen(true); setActiveIndex(-1); props.onFocus?.(event); }}
      onChange={event => { onValueChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onKeyDown={event => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
          event.preventDefault();
          setOpen(true);
          setActiveIndex(current => event.key === 'ArrowDown'
            ? (current + 1) % suggestions.length
            : (current <= 0 ? suggestions.length - 1 : current - 1));
        } else if (event.key === 'Enter' && visible && suggestions[activeIndex]) {
          event.preventDefault();
          choose(suggestions[activeIndex]);
        } else if (event.key === 'Escape' && visible) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    />
    {visible && <div ref={listRef} id={listId} role="listbox" aria-label="Saved suggestions" className="absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
      {suggestions.map((candidate, index) => <div
        key={candidate.toLowerCase()}
        id={`${listId}-${index}`}
        role="option"
        aria-selected={index === activeIndex}
        onPointerDown={event => event.preventDefault()}
        onClick={() => choose(candidate)}
        className={`cursor-pointer rounded-lg px-3 py-3 text-sm hover:bg-muted ${index === activeIndex ? 'bg-muted' : ''}`}
      >{candidate}</div>)}
    </div>}
  </div>;
}
