'use client';

import { useState } from 'react';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import { FormField } from '@/components/common/FormPatterns';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import type { WorkCustomFieldDefinition, WorkCustomFieldValue } from '@/lib/types';

export default function WorkCustomFieldRenderer({
  fields,
  values,
  errors = {},
  onChange,
}: {
  fields: readonly WorkCustomFieldDefinition[];
  values: Record<string, WorkCustomFieldValue>;
  errors?: Record<string, string>;
  onChange: (fieldId: string, value: WorkCustomFieldValue | undefined) => void;
}) {
  const active = fields.filter(field => !field.archived);
  const archived = fields.filter(field => field.archived && Object.hasOwn(values, field.id));
  return (
    <div className="@container/custom-fields min-w-0">
    <div className="grid min-w-0 gap-4 @min-[28rem]/custom-fields:grid-cols-2">
      {active.map(field => <div key={field.id} className={field.width === 'full' ? 'min-w-0 @min-[28rem]/custom-fields:col-span-2' : 'min-w-0'}>
        <WorkCustomFieldControl field={field} value={values[field.id]} error={errors[field.id]} onChange={value => onChange(field.id, value)} />
      </div>)}
      {archived.length ? (
        <details className="min-w-0 @min-[28rem]/custom-fields:col-span-2 border-t border-border/55 pt-4">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Archived field values ({archived.length})</summary>
          <div className="mt-3 grid min-w-0 gap-4 @min-[28rem]/custom-fields:grid-cols-2">
            {archived.map(field => <div key={field.id} className={field.width === 'full' ? 'min-w-0 @min-[28rem]/custom-fields:col-span-2' : 'min-w-0'}>
              <WorkCustomFieldControl field={field} value={values[field.id]} error={errors[field.id]} onChange={value => onChange(field.id, value)} archived />
            </div>)}
          </div>
        </details>
      ) : null}
    </div>
    </div>
  );
}

function WorkCustomFieldControl({
  field,
  value,
  error,
  onChange,
  archived = false,
}: {
  field: WorkCustomFieldDefinition;
  value: WorkCustomFieldValue | undefined;
  error?: string;
  onChange: (value: WorkCustomFieldValue | undefined) => void;
  archived?: boolean;
}) {
  const [optionQuery, setOptionQuery] = useState('');
  const label = archived ? `${field.label} · Archived` : field.label;
  const fieldOptions = field.options || [];
  const selectOptions = [
    { value: '', label: 'Choose…' },
    ...(typeof value === 'string' && !fieldOptions.some(option => option.id === value)
      ? [{ value, label: 'Saved option no longer available' }]
      : []),
    ...fieldOptions.map(option => ({
      value: option.id,
      label: `${option.label}${option.archived ? ' · Archived' : ''}`,
      disabled: Boolean(option.archived && option.id !== value),
    })),
  ];

  if (field.type === 'long-text') {
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
        {({ id, describedBy, invalid, required }) => (
          <FormattedTextarea
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
            placeholder={field.placeholder || ''}
            minRows={4}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            aria-required={required}
          />
        )}
      </FormField>
    );
  }

  if (field.type === 'number') {
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            type="number"
            step="any"
            inputMode="decimal"
            value={typeof value === 'number' ? value : ''}
            onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
            placeholder={field.placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            aria-required={required}
          />
        )}
      </FormField>
    );
  }

  if (field.type === 'date') {
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
        {({ id, describedBy, invalid, required }) => (
          <AdaptiveDatePicker
            id={id}
            label={label}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
            className="w-full"
            required={required}
            ariaDescribedBy={describedBy}
            ariaInvalid={invalid}
          />
        )}
      </FormField>
    );
  }

  if (field.type === 'select') {
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
        {({ id, describedBy, invalid, required }) => (
          <AndroidAdaptiveSelect
            id={id}
            label={label}
            value={typeof value === 'string' ? value : ''}
            onChange={next => onChange(next || undefined)}
            options={selectOptions}
            searchable={fieldOptions.length > 8}
            className="w-full"
            ariaDescribedBy={describedBy}
            ariaRequired={required}
            ariaInvalid={invalid}
          />
        )}
      </FormField>
    );
  }

  if (field.type === 'multi-select') {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived} asGroup>
        {({ describedBy, invalid }) => (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-background p-2" role="group" aria-label={label} aria-describedby={describedBy}>
            <p className="px-2 pb-1 text-xs text-muted-foreground" aria-live="polite">{selectedValues.length} selected</p>
            {fieldOptions.length > 8 ? <Input value={optionQuery} onChange={event => setOptionQuery(event.target.value)} placeholder="Find an option…" aria-label={`Search options for ${field.label}`} /> : null}
            {fieldOptions.length > 8 && !fieldOptions.some(option => option.label.toLocaleLowerCase().includes(optionQuery.trim().toLocaleLowerCase())) ? <p className="px-2 py-2 text-body-sm text-muted-foreground">No matching options. Clear the search to see all choices.</p> : null}
            {fieldOptions.filter(option => fieldOptions.length <= 8 || option.label.toLocaleLowerCase().includes(optionQuery.trim().toLocaleLowerCase())).map(option => {
              const selected = selectedValues.includes(option.id);
              return <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted/50">
                <Checkbox checked={selected} disabled={option.archived && !selected} aria-invalid={invalid || undefined} aria-label={`${field.label}: ${option.label}`} aria-describedby={describedBy} onCheckedChange={checked => {
                  onChange(checked ? [...new Set([...selectedValues, option.id])] : selectedValues.filter(id => id !== option.id));
                }} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}{option.archived ? ' · Archived' : ''}</span>
              </label>;
            })}
            {selectedValues.filter(id => !fieldOptions.some(option => option.id === id)).map(id => <span key={id} className="block px-2 py-1 text-xs text-muted-foreground">Saved option no longer available · {id}</span>)}
          </div>
        )}
      </FormField>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
        {({ id, describedBy, invalid }) => (
          <span className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background px-3" aria-invalid={invalid || undefined}>
            <Checkbox id={id} checked={typeof value === 'boolean' ? value : false} onCheckedChange={checked => onChange(Boolean(checked))} aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
            <span className="text-sm font-semibold">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : 'Not set'}</span>
          </span>
        )}
      </FormField>
    );
  }

  return (
    <FormField label={label} hint={field.helpText} error={error} required={field.required && !archived}>
      {({ id, describedBy, invalid, required }) => (
        <Input
          id={id}
          type={field.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={event => onChange(event.target.value || undefined)}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={required}
        />
      )}
    </FormField>
  );
}
