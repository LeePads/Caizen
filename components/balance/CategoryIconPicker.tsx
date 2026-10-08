'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { CaizenSelectionSheet } from '@/components/native/android-design';
import { CategoryIcon, categoryIconOption } from '@/components/balance/CategoryIcon';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { isAndroid } from '@/lib/platform';
import {
  FINANCIAL_ICON_CATALOG,
  getFinancialIconDefinition,
  suggestFinancialIcons,
} from '@/lib/finance/category-icons';

type CategoryIconPickerProps = {
  id?: string;
  label: string;
  value?: string;
  categoryName?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function CategoryIconPicker({
  id,
  label,
  value = '',
  categoryName = '',
  onChange,
  disabled = false,
}: CategoryIconPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = getFinancialIconDefinition(value);
  const suggestions = useMemo(
    () => suggestFinancialIcons(categoryName).filter(icon => icon.id !== selected?.id),
    [categoryName, selected?.id],
  );
  const options = useMemo<ComboboxOption[]>(
    () => FINANCIAL_ICON_CATALOG.map(icon => ({
      value: icon.id,
      label: icon.label,
      description: icon.group,
      searchText: icon.keywords.join(' '),
      group: icon.group,
      icon: categoryIconOption(icon),
    })),
    [],
  );
  const androidOptions = useMemo(
    () => options.map(option => ({
      value: option.value,
      label: option.label,
      description: `${option.description || ''} · ${option.searchText || ''}`,
      icon: option.icon,
    })),
    [options],
  );

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <span className="text-label text-muted-foreground">{label}</span>
      {isAndroid() ? (
        <>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="h-11 w-full justify-between rounded-xl border-border bg-background px-3 font-medium shadow-none"
            aria-label={`${label}: ${selected?.label || 'General'}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CategoryIcon iconId={selected?.id} size="sm" containerClassName="h-7 w-7 rounded-lg" />
              <span className="truncate">{selected?.label || 'General'}</span>
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
          <CaizenSelectionSheet
            open={open}
            title={label}
            value={value}
            options={androidOptions}
            searchable
            fullHeight
            onChange={choose}
            onClose={() => setOpen(false)}
          />
        </>
      ) : (
        <Combobox
          id={id}
          value={value}
          options={options}
          onChange={onChange}
          placeholder="Choose an icon"
          searchPlaceholder="Search icons..."
          emptyText="No matching icons."
          ariaLabel={label}
          disabled={disabled}
          className="h-11"
        />
      )}
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Suggested icons">
          <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Suggested</span>
          {suggestions.map(icon => (
            <button
              key={icon.id}
              type="button"
              disabled={disabled}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              onClick={() => choose(icon.id)}
              aria-label={`Use ${icon.label} icon`}
            >
              <CategoryIcon iconId={icon.id} size="xs" containerClassName="h-5 w-5 rounded-md" />
              {icon.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
