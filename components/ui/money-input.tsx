import type { ChangeEvent, InputHTMLAttributes } from 'react';
import { getCurrencySymbol, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { CurrencyCode } from '@/lib/types';

type MoneyInputProps = InputHTMLAttributes<HTMLInputElement> & {
  currency?: CurrencyCode;
  prefix?: string;
};

/** Keep an accidental paste from widening a money field or losing precision. */
export const DEFAULT_MONEY_INPUT_MAX_LENGTH = 24;

/** A single money field with a quiet inline currency prefix. */
export function MoneyInput({
  className,
  currency,
  prefix,
  maxLength,
  onChange,
  ...props
}: MoneyInputProps) {
  const symbol = prefix ?? getCurrencySymbol(getEffectiveMoneyInputCurrency(currency));
  const effectiveMaxLength = maxLength ?? DEFAULT_MONEY_INPUT_MAX_LENGTH;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Reject overlong input instead of truncating it. This keeps the controlled
    // value and the persisted value aligned while preserving signs/decimals.
    if (
      effectiveMaxLength !== undefined &&
      event.currentTarget.value.length > effectiveMaxLength
    ) {
      return;
    }

    onChange?.(event);
  };

  return (
    <span data-caizen-focus-shell="true" className="money-input-shell grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden rounded-xl border border-border/70 bg-input transition-[border-color,box-shadow]">
      <span aria-hidden="true" className="money-input-prefix pointer-events-none select-none border-0 bg-transparent pl-3 text-sm font-semibold text-muted-foreground">
        {symbol}
      </span>
      <input
        {...props}
        data-caizen-motion-ring="true"
        data-caizen-focus-inner="true"
        maxLength={effectiveMaxLength}
        onChange={handleChange}
        className={cn('money-input-field h-11 min-w-0 w-full appearance-none !border-0 bg-transparent pl-2 pr-3 text-sm !shadow-none outline-none placeholder:text-muted-foreground/70 focus:!border-0 focus:!outline-none focus:!ring-0 sm:h-10', className)}
      />
    </span>
  );
}
