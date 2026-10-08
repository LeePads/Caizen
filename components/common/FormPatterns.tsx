'use client';

import { cloneElement, Fragment, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type FormFieldControlBindings = {
  id?: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

type FormFieldProps = {
  label: ReactNode;
  children: ReactNode | ((bindings: FormFieldControlBindings) => ReactNode);
  hint?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  controlId?: string;
  asGroup?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
};

export function FormField({
  label,
  children,
  hint,
  description,
  error,
  required = false,
  controlId,
  asGroup = false,
  disabled = false,
  readOnly = false,
}: FormFieldProps) {
  const generatedId = useId();
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;
  const help = description ?? hint;
  const helpId = help ? descriptionId : undefined;
  const childNode = typeof children === 'function' ? null : children;
  const childElement = isValidElement(childNode) ? childNode : null;
  const childProps = childElement ? childElement.props as Record<string, unknown> : undefined;
  const childId = typeof childProps?.id === 'string' ? childProps.id : undefined;
  const canBindSingleChild = Boolean(childElement && childElement.type !== Fragment);
  const fieldId = controlId || childId || (
    asGroup || (typeof children !== 'function' && !canBindSingleChild)
      ? undefined
      : generatedId
  );
  const existingDescribedBy = typeof childProps?.['aria-describedby'] === 'string'
    ? childProps['aria-describedby'].split(/\s+/)
    : [];
  const describedBy = [...new Set([
    ...existingDescribedBy,
    helpId,
    error ? errorId : undefined,
  ].filter((value): value is string => Boolean(value)))].join(' ') || undefined;
  const bindings: FormFieldControlBindings = {
    id: asGroup ? undefined : fieldId,
    describedBy,
    invalid: Boolean(error),
    required,
  };
  const renderChild = typeof children === 'function'
    ? children as (bindings: FormFieldControlBindings) => ReactNode
    : undefined;
  const field = renderChild
    ? renderChild(bindings)
    : !asGroup && childElement && childElement.type !== Fragment
      ? cloneElement(childElement as ReactElement<Record<string, unknown>>, {
          id: fieldId,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : childProps?.['aria-invalid'],
          'aria-required': required ? true : childProps?.['aria-required'],
        })
      : childNode;
  const labelContent = <>{label}{required ? <><span aria-hidden="true"> *</span><span className="sr-only"> required</span></> : null}</>;
  const stateClass = disabled ? 'opacity-60' : readOnly ? 'opacity-80' : '';

  return (
    asGroup ? (
      <fieldset
        id={controlId || undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required ? true : undefined}
        data-disabled={disabled || undefined}
        data-readonly={readOnly || undefined}
        className={`min-w-0 space-y-1.5 ${stateClass}`}
      >
        <legend className="text-label text-muted-foreground">{labelContent}</legend>
        {field}
        {help ? <p id={descriptionId} className="text-body-sm text-muted-foreground">{help}</p> : null}
        {error ? <p id={errorId} role="alert" className="text-body-sm font-semibold text-destructive">{error}</p> : null}
      </fieldset>
    ) : (
      <div data-disabled={disabled || undefined} data-readonly={readOnly || undefined} className={`min-w-0 space-y-1.5 ${stateClass}`}>
        {fieldId ? <label htmlFor={fieldId} className="text-label text-muted-foreground">{labelContent}</label> : <span className="text-label text-muted-foreground">{labelContent}</span>}
        {field}
        {help ? <p id={descriptionId} className="text-body-sm text-muted-foreground">{help}</p> : null}
        {error ? <p id={errorId} role="alert" className="text-body-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    )
  );
}

export function ModalFooter({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mobile-action-row">
      {children}
    </div>
  );
}

export function CancelButton({
  onClick,
  children = 'Cancel',
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="min-h-11 rounded-xl px-4 sm:min-h-10">
      {children}
    </Button>
  );
}

export function SaveButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" onClick={onClick} className="min-h-11 rounded-xl px-4 sm:min-h-10">
      {children}
    </Button>
  );
}
