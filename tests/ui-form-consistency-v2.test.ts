import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormField } from '@/components/common/FormPatterns';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

const renderField = (
  props: Omit<ComponentProps<typeof FormField>, 'children'>,
  child: ComponentProps<typeof FormField>['children'],
) => renderToStaticMarkup(createElement(FormField, props as ComponentProps<typeof FormField>, child as unknown as ReactNode));

describe('Caizen form consistency foundation', () => {
  it('binds ordinary labels, merges help and error descriptions, and exposes render bindings', () => {
    const markup = renderField(
      {
        label: 'Email address',
        hint: 'Used for reminders.',
        error: 'Enter a valid email.',
        required: true,
      },
      createElement('input', { type: 'email', 'aria-describedby': 'external-description' }),
    );
    const controlId = markup.match(/<label for="([^"]+)"/)?.[1];

    expect(controlId).toBeTruthy();
    expect(markup).toContain(`id="${controlId}"`);
    expect(markup).toContain(`aria-describedby="external-description ${controlId}-description ${controlId}-error"`);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-required="true"');
    expect(markup).toContain(`id="${controlId}-description"`);
    expect(markup).toContain('role="alert"');

    const groupMarkup = renderField(
      {
        label: 'Preferences',
        asGroup: true,
        hint: 'Choose any that apply.',
      },
      createElement('input', { type: 'checkbox' }),
    );
    expect(groupMarkup).toContain('<fieldset');
    expect(groupMarkup).toContain('<legend');

    const compositeMarkup = renderField(
      {
        label: 'Start date',
        hint: 'Choose a date.',
        error: 'A date is required.',
        required: true,
      },
      ({ id, describedBy, invalid, required }) => createElement('button', {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': invalid,
        'aria-required': required,
      }, 'Choose date'),
    );
    const compositeId = compositeMarkup.match(/<label for="([^"]+)"/)?.[1];
    expect(compositeMarkup).toContain(`id="${compositeId}"`);
    expect(compositeMarkup).toContain(`aria-describedby="${compositeId}-description ${compositeId}-error"`);
    expect(compositeMarkup).toContain('aria-invalid="true"');
    expect(compositeMarkup).toContain('aria-required="true"');
  });

  it('keeps dialog height configurable while retaining close focus and caller body layouts', () => {
    const sectionKit = source('components/ui/section-kit.tsx');

    expect(sectionKit).toContain('maxHeightClass?: string');
    expect(sectionKit).toContain('maxHeightClass ||');
    expect(sectionKit).toContain('initialFocusSelector?: string');
    expect(sectionKit).toContain('initialFocusSelector,');
    expect(sectionKit).toContain('mobile-modal-body min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(sectionKit).toContain('id={descriptionId || generatedDescriptionId}');
  });

  it('maps standard ARIA props to adaptive native/composite controls', () => {
    const adaptive = source('components/native/android-design.tsx');
    const datePicker = source('components/ui/date-picker.tsx');
    const timePicker = source('components/ui/sleep-time-picker.tsx');

    expect(adaptive).toContain("'aria-describedby': ariaDescribedByAttribute");
    expect(adaptive).toContain('aria-describedby={describedBy}');
    expect(adaptive).toContain("'aria-required': ariaRequiredAttribute");
    expect(adaptive).toContain('aria-required={ariaIsRequired || undefined}');
    expect(datePicker).toContain("props['aria-describedby'] ?? props.ariaDescribedBy");
    expect(datePicker).toContain("props['aria-invalid'] ?? props.ariaInvalid");
    expect(datePicker).toContain("props['aria-required'] ?? props.ariaRequired");
    expect(timePicker).toContain("'aria-describedby': ariaDescribedByAttribute");
    expect(timePicker).toContain('id={id}');
  });
});
