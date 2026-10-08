'use client';

import {
  type ComponentType,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hapticSelection } from '@/lib/native/haptics';
import { isAndroid } from '@/lib/platform';
import {
  buildTimeWheelMinutes,
  clampDay,
  clampLocalDateValue,
  clampTimeValue,
  daysInMonth,
  fromLocalDateParts,
  fromTimeParts,
  isDateWithinRange,
  isTimeWithinRange,
  isValidLocalDateValue,
  isValidTimeValue,
  minuteStepFromInput,
  getMiddleWheelIndex,
  getWheelLogicalIndex,
  recenterWheelIndex,
  TIME_WHEEL_REPEAT_COUNT,
  toLocalDateParts,
  toTimeParts,
  TIME_WHEEL_HOURS_12,
  type Meridiem,
} from '@/lib/native/wheel-date-time';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { Switch } from '@/components/ui/switch';
import { Combobox, CreatableCombobox } from '@/components/ui/combobox';

type Icon = ComponentType<{ className?: string }>;

export function AndroidTopAppBar({
  title,
  subtitle,
  leading,
  action,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="android-top-app-bar">
      <div className="android-top-app-bar-leading">{leading}</div>
      <div className="android-top-app-bar-copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="android-top-app-bar-action">{action}</div>
    </header>
  );
}

export function AndroidBackButton({
  onClick,
  label = 'Back',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="android-icon-button"
      onClick={onClick}
      aria-label={label}
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

export function AndroidSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="android-section-heading">
      <div className="min-w-0">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AndroidListRow({
  icon: IconComponent,
  title,
  summary,
  value,
  onClick,
  trailing,
  destructive = false,
}: {
  icon?: Icon;
  title: string;
  summary?: string;
  value?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}) {
  const content = (
    <>
      {IconComponent && (
        <span className="android-list-row-icon">
          <IconComponent className="h-5 w-5" />
        </span>
      )}
      <span className="android-list-row-copy">
        <span className="android-list-row-title">{title}</span>
        {summary && <span className="android-list-row-summary">{summary}</span>}
      </span>
      {value && <span className="android-list-row-value">{value}</span>}
      {trailing ?? (onClick ? <ChevronRight className="h-5 w-5" /> : null)}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="android-list-row"
        data-destructive={destructive || undefined}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="android-list-row"
      data-destructive={destructive || undefined}
    >
      {content}
    </div>
  );
}

export function AndroidStatisticGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="android-stat-grid">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function AndroidSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label = 'View',
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="android-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Android dialogs use a touchable scrim; the web keeps the authored inert
 * scrim so desktop dialog dismissal remains unchanged. Close handlers are
 * passed through the owning modal so dirty forms retain their existing guard.
 */
export function AndroidDismissibleBackdrop({
  onClose,
  ariaLabel,
  className,
}: {
  onClose: () => void;
  ariaLabel: string;
  className: string;
}) {
  if (isAndroid()) {
    return (
      <button
        type="button"
        className={`border-0 p-0 ${className}`}
        data-caizen-overlay-backdrop="true"
        aria-label={ariaLabel}
        onClick={onClose}
      />
    );
  }

  return <div className={className} data-caizen-overlay-backdrop="true" aria-hidden="true" />;
}

/** Keep existing web checkboxes, while using the shared Life Hub Switch on Android. */
export function AndroidBooleanControl({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
} & Pick<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'disabled' | 'aria-label'>) {
  if (isAndroid()) {
    return <Switch checked={checked} onCheckedChange={onCheckedChange} {...props} />;
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onCheckedChange(event.target.checked)}
      className={className}
      {...props}
    />
  );
}

export function CaizenBottomSheet({
  open,
  title,
  description,
  onClose,
  onRequestClose,
  children,
  fullHeight = false,
  initialFocusSelector,
  dismissOnBackdrop = true,
  onEscapeKeyDown,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onRequestClose?: () => boolean | void;
  children: ReactNode;
  fullHeight?: boolean;
  initialFocusSelector?: string;
  dismissOnBackdrop?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => boolean;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { close, isClosing } = useAnimatedOverlayClose({
    isOpen: open,
    onClose,
  });
  const requestClose = useCallback(() => {
    if (onRequestClose && onRequestClose() === false) return;
    close();
  }, [close, onRequestClose]);

  useEffect(() => setPortalReady(true), []);
  useOverlayLifecycle(open, requestClose, {
    containerRef: panelRef,
    initialFocusRef: initialFocusSelector ? undefined : panelRef,
    initialFocusSelector,
    onEscapeKeyDown,
  });

  if (!open || !portalReady) return null;

  return createPortal(
    <div
      className="caizen-sheet-root"
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      {dismissOnBackdrop ? (
        <button
          type="button"
          className="caizen-sheet-backdrop"
          aria-label={`Close ${title}`}
          onClick={requestClose}
        />
      ) : (
        <div
          className="caizen-sheet-backdrop"
          aria-hidden="true"
        />
      )}
      <section
        ref={panelRef}
        tabIndex={-1}
        className="caizen-sheet-panel"
        data-full-height={fullHeight || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="caizen-sheet-handle" aria-hidden="true" />
        <div className="caizen-sheet-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="android-icon-button"
            onClick={requestClose}
            aria-label={`Close ${title}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="caizen-sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export type CaizenSelectionOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
};

export type NormalizedAdaptiveSelectionOption = CaizenSelectionOption & {
  sourceValue: string;
};

/**
 * Adapt legacy/native-friendly option values to Radix's stricter contract.
 * Empty values remain selectable as the empty string at the caller boundary,
 * but never reach SelectItem.
 */
export function normalizeAdaptiveSelectionOptions(
  options: CaizenSelectionOption[],
): NormalizedAdaptiveSelectionOption[] {
  const seen = new Set<string>();
  return options.reduce<NormalizedAdaptiveSelectionOption[]>((result, option, index) => {
    const sourceValue = typeof option.value === 'string' ? option.value : '';
    const sourceKey = sourceValue.trim() ? sourceValue : '__caizen_empty_source__';
    const rawValue = sourceValue.trim()
      ? sourceValue
      : `__caizen_empty_option_${index}`;
    if (seen.has(sourceKey)) return result;
    seen.add(sourceKey);
    result.push({ ...option, value: rawValue, sourceValue });
    return result;
  }, []);
}

export function CaizenSelectionSheet({
  open,
  title,
  value,
  options,
  onChange,
  onClose,
  searchable = false,
  fullHeight,
  creatable = false,
  createLabel = value => `Add "${value}"`,
}: {
  open: boolean;
  title: string;
  value?: string;
  options: CaizenSelectionOption[];
  onChange: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
  fullHeight?: boolean;
  creatable?: boolean;
  createLabel?: (value: string) => string;
}) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!list || !selected) return;

      // Keep scrolling inside the sheet list. scrollIntoView() is allowed to
      // scroll the page containing the portal, which caused Android option
      // menus to jump the underlying section toward the bottom.
      const listTop = list.scrollTop;
      const listBottom = listTop + list.clientHeight;
      const selectedTop = selected.offsetTop;
      const selectedBottom = selectedTop + selected.offsetHeight;
      if (selectedTop < listTop) {
        list.scrollTo({ top: selectedTop, behavior: 'auto' });
      } else if (selectedBottom > listBottom) {
        list.scrollTo({
          top: selectedBottom - list.clientHeight,
          behavior: 'auto',
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, value]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [options, query]);
  const normalizedQuery = query.trim();
  const hasExactMatch = options.some(option =>
    option.label.trim().toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ||
    option.value.trim().toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase(),
  );

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex(option => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filtered, open, value]);

  const selectOption = (option: CaizenSelectionOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    onClose();
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!filtered.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(current => (current + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => (current - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  };

  return (
    <CaizenBottomSheet
      open={open}
      title={title}
      onClose={onClose}
      fullHeight={fullHeight ?? (searchable || options.length > 8)}
      initialFocusSelector={searchable ? '.android-selection-search input' : '[role="listbox"]'}
    >
      {searchable && (
        <label className="android-selection-search" data-caizen-focus-shell="true">
          <Search className="h-5 w-5" />
          <input
            data-caizen-focus-inner="true"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            aria-label={`Search ${title.toLowerCase()}`}
          />
        </label>
      )}
      <div
        ref={listRef}
        id={listId}
        className="android-selection-list"
        role="listbox"
        aria-label={title}
        tabIndex={0}
        aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        onKeyDown={handleListKeyDown}
      >
        {filtered.length === 0 ? (
          <div className="android-selection-empty" role="status">
            No matching options.
          </div>
        ) : (
          filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              id={`${listId}-${index}`}
              tabIndex={index === activeIndex ? 0 : -1}
              aria-selected={option.value === value}
              data-selected={option.value === value || undefined}
              onFocus={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              {option.icon}
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {option.value === value && <Check className="h-5 w-5" />}
            </button>
            ))
        )}
        {creatable && normalizedQuery && !hasExactMatch ? (
          <button
            type="button"
            className="android-selection-create"
            onClick={() => selectOption({ value: normalizedQuery, label: createLabel(normalizedQuery) })}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>{createLabel(normalizedQuery)}</span>
          </button>
        ) : null}
      </div>
    </CaizenBottomSheet>
  );
}

function AndroidAdaptiveComboboxBase({
  id,
  label,
  value,
  options,
  onChange,
  className = '',
  wrapperClassName = '',
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options...',
  emptyText = 'No matching options.',
  disabled = false,
  ariaDescribedBy,
  clearable = false,
  creatable = false,
  createLabel,
}: {
  id?: string;
  label: string;
  value: string;
  options: CaizenSelectionOption[];
  onChange: (value: string) => void;
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  ariaDescribedBy?: string;
  clearable?: boolean;
  creatable?: boolean;
  createLabel?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);

  return (
    <>
      <div className={`android-adaptive-web-combobox ${wrapperClassName}`}>
        {creatable ? (
          <CreatableCombobox
            id={id}
            value={value}
            options={options}
            onChange={onChange}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            ariaLabel={label}
            ariaDescribedBy={ariaDescribedBy}
            className={className}
            disabled={disabled}
            clearable={clearable}
            createLabel={createLabel}
          />
        ) : (
          <Combobox
            id={id}
            value={value}
            options={options}
            onChange={onChange}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            ariaLabel={label}
            ariaDescribedBy={ariaDescribedBy}
            className={className}
            disabled={disabled}
            clearable={clearable}
          />
        )}
      </div>
      <button
        id={id ? `${id}-android` : undefined}
        type="button"
        className="android-only android-adaptive-select"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`${label}: ${selected?.label ?? (value || placeholder)}`}
        aria-describedby={ariaDescribedBy}
      >
        <span>
          <small>{label}</small>
          <strong>{selected?.label ?? (value || placeholder)}</strong>
        </span>
        <ChevronRight className="h-5 w-5" />
      </button>
      <CaizenSelectionSheet
        open={open}
        title={label}
        value={value}
        options={options}
        searchable
        creatable={creatable}
        createLabel={createLabel}
        fullHeight
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Keep existing web comboboxes while presenting Android choices as sheets. */
export function AndroidAdaptiveCombobox(props: Omit<Parameters<typeof AndroidAdaptiveComboboxBase>[0], 'creatable'>) {
  return <AndroidAdaptiveComboboxBase {...props} />;
}

/** Keep existing web creatable comboboxes while presenting Android choices as sheets. */
export function AndroidAdaptiveCreatableSelect(
  props: Omit<Parameters<typeof AndroidAdaptiveComboboxBase>[0], 'creatable'>,
) {
  return <AndroidAdaptiveComboboxBase {...props} creatable />;
}

export function SearchableSelectionScreen(
  props: Omit<Parameters<typeof CaizenSelectionSheet>[0], 'searchable'>,
) {
  return <CaizenSelectionSheet {...props} searchable />;
}

export function AndroidAdaptiveSelect({
  id,
  label,
  value,
  options,
  onChange,
  className = '',
  searchable = false,
  disabled = false,
  autoFocus = false,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  'aria-describedby': ariaDescribedByAttribute,
  'aria-invalid': ariaInvalidAttribute,
  'aria-required': ariaRequiredAttribute,
  sheetFullHeight,
}: {
  id?: string;
  label: string;
  value: string;
  options: CaizenSelectionOption[];
  onChange: (value: string) => void;
  className?: string;
  searchable?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  sheetFullHeight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const describedBy = ariaDescribedByAttribute ?? ariaDescribedBy;
  const invalid = ariaInvalidAttribute ?? ariaInvalid;
  const ariaIsRequired = ariaRequiredAttribute ?? ariaRequired;
  const selected = options.find((option) => option.value === value);

  // Radix Select reserves the empty string for its placeholder and throws
  // when an item is rendered with value="". Native selects do not have that
  // restriction, and several existing optional fields intentionally use an
  // empty value (for example Wishlist's "Any wallet" filter). Keep the
  // persisted value unchanged while translating only the web primitive's
  // internal option value.
  const webOptions = useMemo(() => normalizeAdaptiveSelectionOptions(options), [options]);
  const webValue = webOptions.find(option => option.sourceValue === value)?.value;

  return (
    <>
      <Select
        value={webValue}
        onValueChange={nextValue => {
          const option = webOptions.find(item => item.value === nextValue);
          onChange(option?.sourceValue ?? '');
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          autoFocus={autoFocus && !isAndroid()}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={ariaIsRequired || undefined}
          className={`android-adaptive-native-select w-full ${className}`}
        >
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {webOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                {option.icon}
                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        id={id ? `${id}-android` : undefined}
        type="button"
        className="android-only android-adaptive-select"
        autoFocus={autoFocus && isAndroid()}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`${label}: ${selected?.label ?? 'Choose'}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={ariaIsRequired || undefined}
      >
        <span>
          <small>{label}</small>
          <strong>{selected?.label ?? 'Choose'}</strong>
        </span>
        <ChevronRight className="h-5 w-5" />
      </button>
      <CaizenSelectionSheet
        open={open}
        title={label}
        value={value}
        options={options}
        searchable={searchable}
        fullHeight={sheetFullHeight}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEMS = 5;

/**
 * One scrollable wheel column (month, day, year, hour, minute, or AM/PM).
 *
 * Uses native CSS scroll-snap rather than manual drag physics: the browser
 * handles the actual snap/settle motion (and honors prefers-reduced-motion
 * automatically), so this component only has to read back which item ended
 * up centered once scrolling settles, via a debounced scroll listener.
 */
function WheelColumn<T>({
  items,
  selectedIndex,
  onSelect,
  ariaLabel,
  renderItem,
  cyclic = false,
}: {
  items: T[];
  selectedIndex: number;
  // `meta.delta` is the signed number of logical positions this update moved
  // by (not wrapped to the item count), so a caller that needs to know how
  // many times a cyclic wheel crossed its wrap boundary - e.g. hour 12<->1 -
  // can derive that directly, including for multi-step momentum scrolls.
  onSelect: (index: number, meta: { delta: number }) => void;
  ariaLabel: string;
  renderItem: (item: T) => ReactNode;
  cyclic?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const settleSequence = useRef(0);
  const pointerDrag = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const listId = useId();
  const smoothSelectionIndex = useRef<number | null>(null);
  const safeLogicalIndex = Math.max(
    0,
    Math.min(Math.max(0, items.length - 1), selectedIndex),
  );
  const safeSelectedIndex = cyclic
    ? getMiddleWheelIndex(safeLogicalIndex, items.length, TIME_WHEEL_REPEAT_COUNT)
    : safeLogicalIndex;
  const repeatedItems = cyclic
    ? Array.from({ length: TIME_WHEEL_REPEAT_COUNT }, () => items).flat()
    : items;
  const lastReportedIndex = useRef(safeLogicalIndex);

  const clearSettleTimer = useCallback(() => {
    settleSequence.current += 1;
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = undefined;
    }
  }, []);

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const element = containerRef.current;
    if (!element || items.length === 0) return;

    const safeIndex = cyclic
      ? Math.max(0, Math.min(repeatedItems.length - 1, index))
      : Math.max(0, Math.min(items.length - 1, index));
    const targetTop = safeIndex * WHEEL_ITEM_HEIGHT;

    // Avoid generating another scroll cycle when the wheel is already centered.
    if (Math.abs(element.scrollTop - targetTop) < 1) return;

    element.scrollTo({
      top: targetTop,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [cyclic, items.length, repeatedItems.length]);

  const commitCenteredIndex = useCallback(() => {
    const element = containerRef.current;
    if (!element || items.length === 0) return;

    const virtualIndex = Math.max(
      0,
      Math.min(repeatedItems.length - 1, Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT)),
    );
    const index = cyclic
      ? getWheelLogicalIndex(virtualIndex, items.length)
      : virtualIndex;
    const centeredIndex = cyclic
      ? recenterWheelIndex(virtualIndex, items.length, TIME_WHEEL_REPEAT_COUNT)
      : index;

    // Align the final resting point exactly to the selected row. This avoids
    // fractional WebView scroll positions being interpreted as a neighboring
    // date on the next open.
    scrollToIndex(centeredIndex, false);

    // The baseline is derived from the logical index last reported, mapped
    // back into the same (virtual) coordinate space `virtualIndex` was read
    // from. Comparing the two - rather than only the wrapped logical index -
    // captures the true number of steps moved even across a drag/momentum
    // gesture that crosses the wrap boundary more than once.
    const baselineVirtual = cyclic
      ? getMiddleWheelIndex(lastReportedIndex.current, items.length, TIME_WHEEL_REPEAT_COUNT)
      : lastReportedIndex.current;
    const delta = virtualIndex - baselineVirtual;

    if (delta !== 0) {
      lastReportedIndex.current = index;
      onSelect(index, { delta });
      void hapticSelection().catch(() => undefined);
    }
  }, [cyclic, items.length, onSelect, repeatedItems.length, scrollToIndex]);

  useEffect(() => {
    clearSettleTimer();
    lastReportedIndex.current = safeLogicalIndex;
    if (smoothSelectionIndex.current === safeLogicalIndex) {
      smoothSelectionIndex.current = null;
      return;
    }
    scrollToIndex(safeSelectedIndex, false);
  }, [clearSettleTimer, safeLogicalIndex, safeSelectedIndex, scrollToIndex]);

  useEffect(() => () => {
    clearSettleTimer();
  }, [clearSettleTimer]);

  const selectIndex = (index: number, deltaOverride?: number) => {
    clearSettleTimer();
    // `index` and `safeSelectedIndex` are always expressed in the same
    // coordinate space by callers below (both logical for non-cyclic wheels,
    // both virtual/repeated-list positions for cyclic ones), so the plain
    // difference is the number of steps moved. `deltaOverride` lets a caller
    // (Home/End) opt out of reporting a step count for an absolute jump.
    const delta = deltaOverride ?? index - safeSelectedIndex;
    const safeIndex = cyclic
      ? getMiddleWheelIndex(index, items.length, TIME_WHEEL_REPEAT_COUNT)
      : Math.max(0, Math.min(items.length - 1, index));
    const logicalIndex = cyclic ? getWheelLogicalIndex(index, items.length) : safeIndex;
    lastReportedIndex.current = logicalIndex;
    smoothSelectionIndex.current = logicalIndex;
    scrollToIndex(safeIndex, true);
    onSelect(logicalIndex, { delta });
    void hapticSelection().catch(() => undefined);
  };

  const handleScroll = () => {
    clearSettleTimer();
    const sequence = settleSequence.current;

    // Keep a fallback for engines without scrollend. Desktop trackpads can
    // pause briefly between momentum frames, so do not commit too early.
    settleTimer.current = window.setTimeout(() => {
      if (sequence !== settleSequence.current) return;
      settleTimer.current = undefined;
      commitCenteredIndex();
    }, 260);
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Chromium/WebView exposes scrollend, which is more reliable than a
    // timeout for desktop wheel and trackpad momentum. The timeout above
    // remains the fallback for older WebViews.
    const handleScrollEnd = () => {
      clearSettleTimer();
      commitCenteredIndex();
    };

    element.addEventListener('scrollend', handleScrollEnd);
    return () => element.removeEventListener('scrollend', handleScrollEnd);
  }, [clearSettleTimer, commitCenteredIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectIndex(safeSelectedIndex + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      selectIndex(safeSelectedIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectIndex(0, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectIndex(items.length - 1, 0);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    clearSettleTimer();
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    pointerDrag.current = {
      startY: event.clientY,
      startTop: containerRef.current?.scrollTop || 0,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = pointerDrag.current;
    const element = containerRef.current;
    if (!drag || !element || event.pointerType !== 'mouse') return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 3 && !drag.moved) {
      drag.moved = true;
      // Do not capture the pointer on pointerdown: capturing every press can
      // retarget a normal desktop click away from the wheel button. Capture
      // only after the gesture is unambiguously a drag.
      element.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    element.scrollTop = drag.startTop - delta;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const drag = pointerDrag.current;
    if (drag?.moved) {
      suppressClick.current = true;
      // A captured drag may not dispatch a click in every browser. Clear the
      // guard on the next frame so the next intentional value click is never
      // swallowed by stale drag state.
      window.requestAnimationFrame(() => {
        suppressClick.current = false;
      });
    }
    pointerDrag.current = null;
    if (containerRef.current?.hasPointerCapture(event.pointerId)) {
      containerRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const padding = (WHEEL_ITEM_HEIGHT * (WHEEL_VISIBLE_ITEMS - 1)) / 2;

  return (
    <div
      ref={containerRef}
      className="cz-wheel-column"
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-activedescendant={`${listId}-${safeSelectedIndex}`}
      style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      <div style={{ height: padding }} aria-hidden="true" />
      {repeatedItems.map((item, index) => (
        <button
          key={index}
          id={`${listId}-${index}`}
          type="button"
          className="cz-wheel-item"
          data-active={index === safeSelectedIndex || undefined}
          role="option"
          tabIndex={-1}
          aria-selected={index === safeSelectedIndex}
          style={{
            height: WHEEL_ITEM_HEIGHT,
            minHeight: WHEEL_ITEM_HEIGHT,
            flex: `0 0 ${WHEEL_ITEM_HEIGHT}px`,
          }}
          onClick={event => {
            if (suppressClick.current) {
              suppressClick.current = false;
              event.preventDefault();
              return;
            }
            selectIndex(index);
          }}
        >
          {renderItem(item)}
        </button>
      ))}
      <div style={{ height: padding }} aria-hidden="true" />
    </div>
  );
}

function WheelHighlightFrame() {
  return <div className="cz-wheel-highlight" aria-hidden="true" style={{ height: WHEEL_ITEM_HEIGHT }} />;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Caizen wheel-style date picker: month/day/year columns in a compact
 * bottom sheet, replacing the full calendar-grid sheet. The day wheel is
 * recomputed (and the selection re-clamped) whenever month or year changes,
 * so an invalid date like Feb 31 can never be produced.
 */
function DateWheelPicker({
  year,
  month,
  day,
  min,
  max,
  onChange,
}: {
  year: number;
  month: number;
  day: number;
  min?: string;
  max?: string;
  onChange: (year: number, month: number, day: number) => void;
}) {
  const years = useMemo(() => {
    const minYear = min && isValidLocalDateValue(min)
      ? toLocalDateParts(min).year
      : Math.min(1900, year);
    const maxYear = max && isValidLocalDateValue(max)
      ? toLocalDateParts(max).year
      : Math.max(2100, year);
    const start = Math.min(minYear, maxYear);
    const end = Math.max(minYear, maxYear);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [max, min, year]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [year, month],
  );

  return (
    <div className="cz-wheel-row">
      <WheelColumn
        items={MONTH_LABELS}
        selectedIndex={month - 1}
        ariaLabel="Month"
        onSelect={(index) =>
          onChange(year, index + 1, clampDay(year, index + 1, day))
        }
        renderItem={(label) => label.slice(0, 3)}
      />
      <WheelColumn
        items={days}
        selectedIndex={clampDay(year, month, day) - 1}
        ariaLabel="Day"
        onSelect={(index) => onChange(year, month, index + 1)}
        renderItem={(value) => value}
      />
      <WheelColumn
        items={years}
        selectedIndex={Math.max(0, years.indexOf(year))}
        ariaLabel="Year"
        onSelect={(index) => {
          const nextYear = years[index] ?? year;
          onChange(nextYear, month, clampDay(nextYear, month, day));
        }}
        renderItem={(value) => value}
      />
      <WheelHighlightFrame />
    </div>
  );
}

const MERIDIEMS: Meridiem[] = ['AM', 'PM'];

export function TimeWheelPicker({
  hour12,
  minute,
  meridiem,
  minuteStep = 1,
  onChange,
}: {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
  minuteStep?: number;
  onChange: (hour12: number, minute: number, meridiem: Meridiem) => void;
}) {
  const minutes = useMemo(
    () => buildTimeWheelMinutes(minuteStep, minute),
    [minute, minuteStep],
  );

  return (
    <div className="cz-wheel-row">
      <WheelColumn
        items={TIME_WHEEL_HOURS_12}
        selectedIndex={Math.max(0, TIME_WHEEL_HOURS_12.indexOf(hour12))}
        ariaLabel="Hour"
        cyclic
        onSelect={(index, meta) => {
          // A plain hour-wheel step never changes AM/PM on its own. Whether it
          // should - and in which direction - depends on how many times the
          // 12<->1 boundary was crossed to get here, which `meta.delta` (the
          // signed step count from WheelColumn) already captures. Routing the
          // shift through the canonical 24h conversion (rather than special-
          // casing "12 -> 1") makes this correct for multi-hour momentum
          // scrolls too: e.g. 10 AM scrolled forward 5 steps lands on 3 PM.
          if (meta.delta === 0) {
            onChange(TIME_WHEEL_HOURS_12[index] ?? 12, minute, meridiem);
            return;
          }
          const currentValue = fromTimeParts(hour12, minute, meridiem);
          const currentHour24 = Number(currentValue.slice(0, 2));
          const nextHour24 = ((currentHour24 + meta.delta) % 24 + 24) % 24;
          const nextValue = `${String(nextHour24).padStart(2, '0')}${currentValue.slice(2)}`;
          const next = toTimeParts(nextValue);
          onChange(next.hour12, minute, next.meridiem);
        }}
        renderItem={(value) => value}
      />
      <WheelColumn
        items={minutes}
        selectedIndex={Math.max(0, minutes.indexOf(minute))}
        ariaLabel="Minute"
        cyclic
        onSelect={(index) => onChange(hour12, minutes[index] ?? 0, meridiem)}
        renderItem={(value) => String(value).padStart(2, '0')}
      />
      <WheelColumn
        items={MERIDIEMS}
        selectedIndex={meridiem === 'AM' ? 0 : 1}
        ariaLabel="AM or PM"
        onSelect={(index) => onChange(hour12, minute, MERIDIEMS[index] ?? 'AM')}
        renderItem={(value) => value}
      />
      <WheelHighlightFrame />
    </div>
  );
}

export function AndroidAdaptiveDateInput({
  id,
  label,
  value,
  onChange,
  onOpenChange,
  className = '',
  min,
  max,
  required = false,
  disabled = false,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  'aria-describedby': ariaDescribedByAttribute,
  'aria-invalid': ariaInvalidAttribute,
  'aria-required': ariaRequiredAttribute,
  clearable = true,
  placeholder = 'Not set',
  name,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  clearable?: boolean;
  placeholder?: string;
  name?: string;
}) {
  const describedBy = ariaDescribedByAttribute ?? ariaDescribedBy;
  const invalid = ariaInvalidAttribute ?? ariaInvalid;
  const ariaIsRequired = required || Boolean(ariaRequiredAttribute ?? ariaRequired);
  const today = new Date();
  const fallback = clampLocalDateValue(
    fromLocalDateParts(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    min,
    max,
  );
  const hasSelectedValue = isDateWithinRange(value, min, max);
  const selectedValue = hasSelectedValue ? value : fallback;
  const selected = new Date(`${selectedValue}T12:00:00`);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => toLocalDateParts(selectedValue));

  useEffect(() => {
    if (!open) return;
    const next = isDateWithinRange(value, min, max) ? value : fallback;
    setDraft(toLocalDateParts(next));
  }, [fallback, max, min, open, value]);

  const updateDraft = (year: number, month: number, day: number) => {
    const next = clampLocalDateValue(
      fromLocalDateParts(year, month, day),
      min,
      max,
    );
    setDraft(toLocalDateParts(next));
  };

  const canClear = clearable && !ariaIsRequired;
  const openPicker = () => {
    setOpen(true);
    onOpenChange?.(true);
  };
  const closePicker = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  return (
    <>
      <input
        id={id}
        type="date"
        name={name}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={hasSelectedValue ? value : ''}
        min={min}
        max={max}
        required={ariaIsRequired}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`android-adaptive-native-select ${className}`}
      />
      <button
        id={id ? `${id}-android` : undefined}
        type="button"
        className={`android-only android-adaptive-date ${className}`}
        onClick={openPicker}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={ariaIsRequired || undefined}
        aria-label={`${label}: ${hasSelectedValue ? selected.toLocaleDateString() : 'Not set'}`}
      >
        <CalendarDays className="h-4 w-4" />
        <span>
          {hasSelectedValue
            ? selected.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : placeholder}
        </span>
      </button>
      <CaizenBottomSheet open={open} title={label} onClose={closePicker}>
        <div className="cz-wheel-picker">
          <DateWheelPicker
            year={draft.year}
            month={draft.month}
            day={draft.day}
            min={min}
            max={max}
            onChange={updateDraft}
          />
          <div
            className="cz-wheel-actions"
            data-action-count={canClear ? 3 : 2}
          >
            {canClear ? (
              <button
                type="button"
                className="cz-wheel-action-clear"
                onClick={() => {
                  onChange('');
                  closePicker();
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="cz-wheel-action-today"
              onClick={() => setDraft(toLocalDateParts(fallback))}
            >
              Today
            </button>
            <button
              type="button"
              className="cz-wheel-action-cancel"
                onClick={closePicker}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cz-wheel-action-set"
              onClick={() => {
                onChange(
                  clampLocalDateValue(
                    fromLocalDateParts(draft.year, draft.month, draft.day),
                    min,
                    max,
                  ),
                );
                closePicker();
              }}
            >
              Done
            </button>
          </div>
        </div>
      </CaizenBottomSheet>
    </>
  );
}

export function AndroidAdaptiveTimeInput({
  label,
  value,
  onChange,
  className = '',
  min,
  max,
  step,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: number | string;
  required?: boolean;
  disabled?: boolean;
}) {
  const fallback = clampTimeValue('12:00', min, max);
  const selectedValue = isTimeWithinRange(value, min, max) ? value : fallback;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => toTimeParts(selectedValue));
  const minuteStep = minuteStepFromInput(step);

  useEffect(() => {
    if (!open) return;
    const next = isTimeWithinRange(value, min, max) ? value : fallback;
    setDraft(toTimeParts(next));
  }, [fallback, max, min, open, value]);

  const displayLabel = value && isValidTimeValue(value)
    ? new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not set';

  return (
    <>
      <input
        type="time"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`android-adaptive-native-select ${className}`}
      />
      <button
        type="button"
        className={`android-only android-adaptive-date ${className}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`${label}: ${displayLabel}`}
      >
        <CalendarDays className="h-4 w-4" />
        <span>{displayLabel}</span>
      </button>
      <CaizenBottomSheet open={open} title={label} onClose={() => setOpen(false)}>
        <div className="cz-wheel-picker">
          <TimeWheelPicker
            hour12={draft.hour12}
            minute={draft.minute}
            meridiem={draft.meridiem}
            minuteStep={minuteStep}
            onChange={(hour12, minute, meridiem) =>
              setDraft({ hour12, minute, meridiem })
            }
          />
          <div className="cz-wheel-actions">
            <button
              type="button"
              className="cz-wheel-action-clear"
              disabled={required}
              onClick={() => {
                if (required) return;
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="cz-wheel-action-cancel"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cz-wheel-action-set"
              onClick={() => {
                onChange(
                  clampTimeValue(
                    fromTimeParts(draft.hour12, draft.minute, draft.meridiem),
                    min,
                    max,
                  ),
                );
                setOpen(false);
              }}
            >
              Set
            </button>
          </div>
        </div>
      </CaizenBottomSheet>
    </>
  );
}

export function AndroidFormScreen({
  title,
  subtitle,
  onClose,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel = 'Cancel',
  destructiveAction,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  destructiveAction?: ReactNode;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const screenRef = useRef<HTMLElement>(null);
  useEffect(() => setPortalReady(true), []);

  /*
    Previously registered no back-handling at all: no overlay-stack entry, no
    `data-caizen-overlay`/`data-caizen-nested-flow` attribute. decideAndroidBackAction
    checks a DOM query for those attributes before deciding to close an
    overlay, so with neither set, Android hardware Back on an open full-screen
    form (e.g. Add Routine) fell through to navigate-history/navigate-dashboard
    /open-exit-dialog instead of closing the form.
  */
  useOverlayLifecycle(true, onClose, { containerRef: screenRef });

  if (!portalReady) return null;

  return createPortal((
    <section
      ref={screenRef}
      tabIndex={-1}
      className="android-form-screen"
      data-android-form="true"
      data-caizen-overlay="open"
      data-caizen-nested-flow="open"
    >
      <AndroidTopAppBar
        title={title}
        subtitle={subtitle}
        leading={<AndroidBackButton onClick={onClose} label={`Close ${title}`} />}
      />
      <div className="android-form-content">{children}</div>
      <div className="android-sticky-form-actions">
        {destructiveAction && (
          <div className="android-form-destructive">{destructiveAction}</div>
        )}
        <button type="button" className="android-form-cancel" onClick={onClose}>
          {secondaryLabel}
        </button>
        <button
          type="button"
          className="android-form-primary"
          onClick={onPrimary}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </button>
      </div>
    </section>
  ), document.body);
}

export function CompactState({
  kind,
  title,
  message,
  action,
}: {
  kind: 'empty' | 'loading' | 'error';
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="android-compact-state" data-kind={kind} role="status">
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function AndroidSettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="android-settings-group">
      {title && <h2>{title}</h2>}
      <div>{children}</div>
    </section>
  );
}

export function AndroidSettingsRow(
  props: Parameters<typeof AndroidListRow>[0],
) {
  return <AndroidListRow {...props} />;
}

/**
 * Keeps semantic HTML selects on web while replacing Android's unthemeable
 * grey option window with the established Caizen selection sheet. New raw
 * selects receive the same behavior automatically; adaptive selects opt out
 * because they already own a sheet.
 */
export function CaizenSelectInterceptor() {
  const [target, setTarget] = useState<HTMLSelectElement | null>(null);
  const pointerRef = useRef<{
    select: HTMLSelectElement;
    pointerId: number;
    x: number;
    y: number;
    startedAt: number;
    moved: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    if (!isAndroid()) return;

    const selectFor = (node: EventTarget | null) => {
      const element = node instanceof Element ? node.closest('select') : null;
      if (!(element instanceof HTMLSelectElement)) return null;
      if (element.disabled || element.multiple || element.dataset.nativeSelect === 'true') return null;
      if (element.classList.contains('android-adaptive-native-select')) return null;
      return element;
    };

    const openForKeyboard = (event: KeyboardEvent) => {
      const select = selectFor(event.target);
      if (!select) return;
      if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setTarget(select);
    };

    const startPointer = (event: PointerEvent) => {
      const select = selectFor(event.target);
      if (!select || event.button !== 0) return;

      // Prevent the WebView from opening its native select immediately. The
      // replacement sheet is opened on pointerup only after the gesture has
      // proven to be a short, stationary tap.
      event.preventDefault();
      pointerRef.current = {
        select,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
        moved: false,
      };
    };

    const trackPointer = (event: PointerEvent) => {
      const pending = pointerRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 9) {
        pending.moved = true;
      }
    };

    const finishPointer = (event: PointerEvent) => {
      const pending = pointerRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      pointerRef.current = null;
      suppressClickUntilRef.current = performance.now() + 550;

      if (pending.moved || performance.now() - pending.startedAt > 420) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setTarget(pending.select);
    };

    const cancelPointer = (event: PointerEvent) => {
      if (pointerRef.current?.pointerId === event.pointerId) pointerRef.current = null;
    };

    const interceptClick = (event: MouseEvent) => {
      const select = selectFor(event.target);
      if (!select) return;
      if (performance.now() < suppressClickUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      // Preserve assistive-technology activation, which arrives without a
      // pointer sequence.
      if (event.detail === 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setTarget(select);
      }
    };

    document.addEventListener('pointerdown', startPointer, true);
    document.addEventListener('pointermove', trackPointer, true);
    document.addEventListener('pointerup', finishPointer, true);
    document.addEventListener('pointercancel', cancelPointer, true);
    document.addEventListener('click', interceptClick, true);
    document.addEventListener('keydown', openForKeyboard, true);
    return () => {
      document.removeEventListener('pointerdown', startPointer, true);
      document.removeEventListener('pointermove', trackPointer, true);
      document.removeEventListener('pointerup', finishPointer, true);
      document.removeEventListener('pointercancel', cancelPointer, true);
      document.removeEventListener('click', interceptClick, true);
      document.removeEventListener('keydown', openForKeyboard, true);
    };
  }, []);

  if (!target) return null;

  const labelledBy = target.getAttribute('aria-labelledby');
  const wrappingLabel = target.labels?.[0];
  const label = target.getAttribute('aria-label')
    || (labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() : '')
    || wrappingLabel?.querySelector(':scope > span')?.textContent?.trim()
    || wrappingLabel?.textContent?.trim()
    || target.name
    || 'Choose an option';
  const options = Array.from(target.options)
    .filter(option => !option.disabled)
    .map(option => ({ value: option.value, label: option.label || option.text }));

  const commit = (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    setTarget(null);
  };

  return (
    <CaizenSelectionSheet
      open
      title={label}
      value={target.value}
      options={options}
      searchable={options.length > 10}
      onChange={commit}
      onClose={() => setTarget(null)}
    />
  );
}

/**
 * Global date/time picker interceptor for Capacitor Android.
 *
 * Individual forms kept reaching the system calendar dialog because each one
 * had to opt in to AndroidAdaptiveDateInput, and ~15 raw
 * `input[type=date|time]` controls across Life Hub, Work Hub, Health, Personal
 * Vault, and several modals never did. Converting them one by one leaves the
 * next new form free to regress the same way.
 *
 * This intercepts activation of any native date/time input while running
 * inside the Android app and presents the Caizen wheel sheet instead, so
 * coverage is structural rather than per-form. The value is written back
 * through the native setter and an input event is dispatched, so React
 * controlled inputs see a normal change.
 *
 * Opt out for a control that genuinely wants the system dialog with
 * `data-native-picker="true"`. On web the inputs are left completely alone,
 * keeping the accessible desktop experience.
 */
export function CaizenDateTimeInterceptor() {
  const [target, setTarget] = useState<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<'date' | 'time'>('date');
  const activeTargetRef = useRef<HTMLInputElement | null>(null);
  const activationRef = useRef<{ input: HTMLInputElement; pointerId?: number } | null>(null);

  useEffect(() => {
    if (!isAndroid()) return;

    const isInterceptable = (node: EventTarget | null) => {
      if (!(node instanceof HTMLInputElement)) return null;
      if (node.dataset.nativePicker === 'true') return null;
      if (node.disabled || node.readOnly) return null;
      if (node.type !== 'date' && node.type !== 'time') return null;
      // AndroidAdaptiveDateInput/TimeInput already render their own sheet and
      // hide the raw input on Android; leave those alone.
      if (node.classList.contains('android-adaptive-native-select')) return null;
      return node;
    };

    const intercept = (event: Event) => {
      const input = isInterceptable(event.target);
      if (!input) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const pointerId = event instanceof PointerEvent ? event.pointerId : undefined;
      const activation = activationRef.current;
      if (
        activation?.input === input &&
        (event.type === 'click' || event.type === 'focus' || activation.pointerId === pointerId)
      ) {
        return;
      }

      activationRef.current = { input, pointerId };

      // Blur so the platform does not show its own picker behind the sheet.
      if (document.activeElement === input) input.blur();

      activeTargetRef.current = input;
      setKind(input.type === 'time' ? 'time' : 'date');
      setTarget(input);
    };

    // Capture phase on pointerdown covers touch activation before the
    // platform opens its dialog; click covers keyboard and accessibility
    // activation without reopening a picker when focus is restored on close.
    document.addEventListener('pointerdown', intercept, true);
    document.addEventListener('click', intercept, true);

    return () => {
      document.removeEventListener('pointerdown', intercept, true);
      document.removeEventListener('click', intercept, true);
    };
  }, []);

  const closePicker = useCallback(() => {
    activeTargetRef.current = null;
    activationRef.current = null;
    setTarget(null);
  }, []);

  const commit = (value: string) => {
    const input = activeTargetRef.current;
    if (!input) return;

    // React tracks the previous value on the DOM node, so assigning `.value`
    // directly would be swallowed. Going through the prototype setter and
    // dispatching one bubbling input event makes React's onChange fire once.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;

    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    closePicker();
  };

  if (!target) return null;

  return kind === 'date' ? (
    <InterceptedDateSheet
      value={target.value}
      min={target.min || undefined}
      max={target.max || undefined}
      required={target.required}
      onCommit={commit}
      onClose={closePicker}
    />
  ) : (
    <InterceptedTimeSheet
      value={target.value}
      min={target.min || undefined}
      max={target.max || undefined}
      step={target.step || undefined}
      required={target.required}
      onCommit={commit}
      onClose={closePicker}
    />
  );
}

function InterceptedDateSheet({
  value,
  min,
  max,
  required,
  onCommit,
  onClose,
}: {
  value: string;
  min?: string;
  max?: string;
  required: boolean;
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const fallback = clampLocalDateValue(
    fromLocalDateParts(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    min,
    max,
  );
  const initial = isDateWithinRange(value, min, max) ? value : fallback;
  const [draft, setDraft] = useState(() => toLocalDateParts(initial));

  const updateDraft = (year: number, month: number, day: number) => {
    const next = clampLocalDateValue(
      fromLocalDateParts(year, month, day),
      min,
      max,
    );
    setDraft(toLocalDateParts(next));
  };

  return (
    <CaizenBottomSheet open title="Select date" onClose={onClose}>
      <div className="cz-wheel-picker">
        <DateWheelPicker
          year={draft.year}
          month={draft.month}
          day={draft.day}
          min={min}
          max={max}
          onChange={updateDraft}
        />
        <div className="cz-wheel-actions">
          <button
            type="button"
            className="cz-wheel-action-clear"
            disabled={required}
            onClick={() => {
              if (!required) onCommit('');
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="cz-wheel-action-today"
            onClick={() => setDraft(toLocalDateParts(fallback))}
          >
            Today
          </button>
          <button
            type="button"
            className="cz-wheel-action-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cz-wheel-action-set"
            onClick={() =>
              onCommit(
                clampLocalDateValue(
                  fromLocalDateParts(draft.year, draft.month, draft.day),
                  min,
                  max,
                ),
              )
            }
          >
            Done
          </button>
        </div>
      </div>
    </CaizenBottomSheet>
  );
}

function InterceptedTimeSheet({
  value,
  min,
  max,
  step,
  required,
  onCommit,
  onClose,
}: {
  value: string;
  min?: string;
  max?: string;
  step?: string;
  required: boolean;
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  const fallback = clampTimeValue('12:00', min, max);
  const initial = isTimeWithinRange(value, min, max) ? value : fallback;
  const [draft, setDraft] = useState(() => toTimeParts(initial));
  const minuteStep = minuteStepFromInput(step);

  return (
    <CaizenBottomSheet open title="Select time" onClose={onClose}>
      <div className="cz-wheel-picker">
        <TimeWheelPicker
          hour12={draft.hour12}
          minute={draft.minute}
          meridiem={draft.meridiem}
          minuteStep={minuteStep}
          onChange={(hour12, minute, meridiem) =>
            setDraft({ hour12, minute, meridiem })
          }
        />
        <div className="cz-wheel-actions">
          <button
            type="button"
            className="cz-wheel-action-clear"
            disabled={required}
            onClick={() => {
              if (!required) onCommit('');
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="cz-wheel-action-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cz-wheel-action-set"
            onClick={() =>
              onCommit(
                clampTimeValue(
                  fromTimeParts(draft.hour12, draft.minute, draft.meridiem),
                  min,
                  max,
                ),
              )
            }
          >
            Set
          </button>
        </div>
      </div>
    </CaizenBottomSheet>
  );
}
