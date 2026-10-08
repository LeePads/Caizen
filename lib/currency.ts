import { useSyncExternalStore } from 'react';

import { roundMoney } from './money';
import type { CurrencyCode } from './types';

/**
 * Every code here must be one Frankfurter/ECB reference rates actually
 * publishes - the exchange-rate provider below has no fallback for a code
 * outside that fixed list. `flag` is a display-only Unicode region emoji
 * (or a shared marker like the EU flag for EUR); it carries no meaning for
 * conversion. Symbols are intentionally not duplicated here - `getCurrencySymbol()`
 * (Intl-based) stays the single source of truth for those.
 */
export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string; flag: string }[] = [
  { code: 'PHP', label: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'USD', label: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', label: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', label: 'British Pound', flag: '🇬🇧' },
  { code: 'JPY', label: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'AUD', label: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CAD', label: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'SGD', label: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'CHF', label: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CNY', label: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'INR', label: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'KRW', label: 'South Korean Won', flag: '🇰🇷' },
  { code: 'MXN', label: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'NZD', label: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'HKD', label: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'SEK', label: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', label: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', label: 'Danish Krone', flag: '🇩🇰' },
  { code: 'THB', label: 'Thai Baht', flag: '🇹🇭' },
  { code: 'ZAR', label: 'South African Rand', flag: '🇿🇦' },
  { code: 'BRL', label: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'PLN', label: 'Polish Zloty', flag: '🇵🇱' },
];

export type CurrencyRateStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'stale'
  | 'error';

export type CurrencyRuntimeState = {
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  fetchedAt?: string;
  status: CurrencyRateStatus;
  error?: string;
};

type CachedRate = {
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  fetchedAt: string;
};

const CACHE_PREFIX = 'caizen-currency-rate-v2';
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
const USABLE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

let runtimeState: CurrencyRuntimeState = {
  baseCurrency: 'PHP',
  displayCurrency: 'PHP',
  rate: 1,
  status: 'ready',
};

let inFlightKey: string | null = null;
let requestSerial = 0;
let activeRequest: AbortController | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach(listener => listener());
};

const updateRuntimeState = (updates: Partial<CurrencyRuntimeState>) => {
  runtimeState = { ...runtimeState, ...updates };
  emit();
};

const cacheKey = (base: CurrencyCode, display: CurrencyCode) =>
  `${CACHE_PREFIX}:${base}:${display}`;

const readCachedRate = (
  baseCurrency: CurrencyCode,
  displayCurrency: CurrencyCode,
): CachedRate | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(cacheKey(baseCurrency, displayCurrency));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedRate>;
    const rate = Number(parsed.rate);
    const fetchedAt = parsed.fetchedAt ? new Date(parsed.fetchedAt) : null;

    if (
      parsed.baseCurrency !== baseCurrency ||
      parsed.displayCurrency !== displayCurrency ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !fetchedAt ||
      Number.isNaN(fetchedAt.getTime())
    ) {
      return null;
    }

    return {
      baseCurrency,
      displayCurrency,
      rate,
      rateDate: parsed.rateDate,
      fetchedAt: fetchedAt.toISOString(),
    };
  } catch {
    return null;
  }
};

const writeCachedRate = (value: CachedRate) => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      cacheKey(value.baseCurrency, value.displayCurrency),
      JSON.stringify(value),
    );
  } catch {
    // Currency conversion remains usable for the current session if storage is full.
  }
};

const getCacheAge = (cached: CachedRate) =>
  Date.now() - new Date(cached.fetchedAt).getTime();

const isSupportedCurrency = (value: unknown): value is CurrencyCode =>
  SUPPORTED_CURRENCIES.some(currency => currency.code === value);

export const subscribeCurrencyState = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCurrencyState = () => runtimeState;

export const useCurrencyState = () =>
  useSyncExternalStore(
    subscribeCurrencyState,
    getCurrencyState,
    getCurrencyState,
  );

export const getBaseCurrency = () => runtimeState.baseCurrency;

export const getActiveCurrency = () => runtimeState.displayCurrency;

export const setCurrencyContext = (
  baseCurrency?: CurrencyCode,
  displayCurrency?: CurrencyCode,
) => {
  const nextBase = isSupportedCurrency(baseCurrency) ? baseCurrency : 'PHP';
  const nextDisplay = isSupportedCurrency(displayCurrency)
    ? displayCurrency
    : nextBase;
  const pairChanged =
    runtimeState.baseCurrency !== nextBase ||
    runtimeState.displayCurrency !== nextDisplay;

  if (pairChanged) {
    requestSerial += 1;
    activeRequest?.abort();
    activeRequest = null;
    inFlightKey = null;
  } else {
    return;
  }

  if (nextBase === nextDisplay) {
    inFlightKey = null;
    updateRuntimeState({
      baseCurrency: nextBase,
      displayCurrency: nextDisplay,
      rate: 1,
      rateDate: undefined,
      fetchedAt: undefined,
      status: 'ready',
      error: undefined,
    });
    return;
  }

  const cached = readCachedRate(nextBase, nextDisplay);
  const cacheAge = cached ? getCacheAge(cached) : Number.POSITIVE_INFINITY;

  updateRuntimeState({
    baseCurrency: nextBase,
    displayCurrency: nextDisplay,
    rate: cached?.rate || 1,
    rateDate: cached?.rateDate,
    fetchedAt: cached?.fetchedAt,
    status:
      cached && cacheAge <= FRESH_FOR_MS
        ? 'ready'
        : cached && cacheAge <= USABLE_FOR_MS
          ? 'stale'
          : 'loading',
    error: undefined,
  });

  if (!cached || cacheAge > FRESH_FOR_MS) {
    void refreshCurrencyRate();
  }
};

// Backward-compatible setter used by older screens. It changes display only;
// saved amounts remain in the profile's base currency.
export const setActiveCurrency = (currency?: CurrencyCode) => {
  setCurrencyContext(runtimeState.baseCurrency, currency || runtimeState.baseCurrency);
};

export const refreshCurrencyRate = async (force = false) => {
  const { baseCurrency, displayCurrency } = runtimeState;

  if (baseCurrency === displayCurrency) {
    updateRuntimeState({ rate: 1, status: 'ready', error: undefined });
    return 1;
  }

  const key = `${baseCurrency}:${displayCurrency}`;
  if (!force && inFlightKey === key) return runtimeState.rate;

  const cached = readCachedRate(baseCurrency, displayCurrency);
  if (!force && cached && getCacheAge(cached) <= FRESH_FOR_MS) {
    if (
      runtimeState.baseCurrency === baseCurrency &&
      runtimeState.displayCurrency === displayCurrency
    ) {
      updateRuntimeState({
        rate: cached.rate,
        rateDate: cached.rateDate,
        fetchedAt: cached.fetchedAt,
        status: 'ready',
        error: undefined,
      });
    }
    return cached.rate;
  }

  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const requestId = ++requestSerial;
  inFlightKey = key;
  updateRuntimeState({ status: cached ? 'stale' : 'loading', error: undefined });

  const requestIsCurrent = () =>
    requestId === requestSerial &&
    runtimeState.baseCurrency === baseCurrency &&
    runtimeState.displayCurrency === displayCurrency;

  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${baseCurrency}/${displayCurrency}`,
      { cache: 'no-store', signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error(`Exchange-rate request failed (${response.status}).`);
    }

    const data = (await response.json()) as {
      date?: string;
      base?: string;
      quote?: string;
      rate?: number;
      message?: string;
    };
    const rate = Number(data.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(data.message || 'The exchange-rate response was invalid.');
    }

    const next: CachedRate = {
      baseCurrency,
      displayCurrency,
      rate,
      rateDate: data.date,
      fetchedAt: new Date().toISOString(),
    };

    writeCachedRate(next);
    if (requestIsCurrent()) {
      updateRuntimeState({
        rate,
        rateDate: next.rateDate,
        fetchedAt: next.fetchedAt,
        status: 'ready',
        error: undefined,
      });
    }

    return rate;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return runtimeState.rate;
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Caizen could not update the exchange rate.';

    if (cached && getCacheAge(cached) <= USABLE_FOR_MS) {
      if (requestIsCurrent()) {
        updateRuntimeState({
          rate: cached.rate,
          rateDate: cached.rateDate,
          fetchedAt: cached.fetchedAt,
          status: 'stale',
          error: message,
        });
      }
      return cached.rate;
    }

    if (requestIsCurrent()) {
      updateRuntimeState({
        rate: 1,
        rateDate: undefined,
        fetchedAt: undefined,
        status: 'error',
        error: message,
      });
    }
    return 1;
  } finally {
    if (requestId === requestSerial) {
      inFlightKey = null;
      activeRequest = null;
    }
  }
};

const hasUsableDisplayRate = () =>
  runtimeState.baseCurrency === runtimeState.displayCurrency ||
  ((runtimeState.status === 'ready' || runtimeState.status === 'stale') &&
    Number.isFinite(runtimeState.rate) &&
    runtimeState.rate > 0);

export const isDisplayCurrencyConversionAvailable = () =>
  hasUsableDisplayRate();

/**
 * Money inputs accept values in the currently selected display currency when
 * conversion is available. If the rate cannot be used, they fall back to the
 * authoritative base currency so a raw number is never mis-saved as base data.
 */
export const getEffectiveMoneyInputCurrency = (
  requestedCurrency?: CurrencyCode,
): CurrencyCode => {
  const requested = requestedCurrency || runtimeState.displayCurrency;
  if (requested === runtimeState.baseCurrency) return runtimeState.baseCurrency;
  if (requested === runtimeState.displayCurrency && hasUsableDisplayRate()) {
    return runtimeState.displayCurrency;
  }
  return runtimeState.baseCurrency;
};

export const convertFromBaseCurrency = (
  amount: number | undefined | null,
  targetCurrency: CurrencyCode = runtimeState.displayCurrency,
): number => {
  const value = Number(amount ?? 0);
  const safeAmount = Number.isFinite(value) ? value : 0;

  if (targetCurrency === runtimeState.baseCurrency) return safeAmount;
  if (
    targetCurrency === runtimeState.displayCurrency &&
    hasUsableDisplayRate()
  ) {
    return safeAmount * runtimeState.rate;
  }

  return safeAmount;
};

export const convertDisplayToBaseCurrency = (
  amount: number | undefined | null,
): number => {
  const value = Number(amount ?? 0);
  const safeAmount = Number.isFinite(value) ? value : 0;

  if (
    !hasUsableDisplayRate()
  ) {
    return safeAmount;
  }

  return safeAmount / runtimeState.rate;
};

export const convertMoneyInputToBase = (
  value: number | string | undefined | null,
  requestedCurrency?: CurrencyCode,
): number | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;

  const inputCurrency = getEffectiveMoneyInputCurrency(requestedCurrency);
  const baseAmount = (
    inputCurrency === runtimeState.displayCurrency &&
    inputCurrency !== runtimeState.baseCurrency &&
    hasUsableDisplayRate()
  ) ? parsed / runtimeState.rate : parsed;
  // Reject overflow and amounts whose cents cannot be represented exactly.
  if (!Number.isFinite(baseAmount) || !Number.isSafeInteger(Math.round(baseAmount * 100))) {
    return undefined;
  }
  return roundMoney(baseAmount);
};

export const formatMoneyInputValue = (
  amount: number | undefined | null,
  requestedCurrency?: CurrencyCode,
): string => {
  if (amount === undefined || amount === null || !Number.isFinite(Number(amount))) {
    return '';
  }

  const inputCurrency = getEffectiveMoneyInputCurrency(requestedCurrency);
  const converted = convertFromBaseCurrency(amount, inputCurrency);
  const normalized = inputCurrency === 'JPY'
    ? Math.round(converted)
    : roundMoney(converted);

  return String(normalized);
};

export const getCurrencySymbol = (currency: CurrencyCode): string =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  })
    .formatToParts(0)
    .find(part => part.type === 'currency')?.value || currency;

/**
 * Shared display option shape for every currency picker (desktop Combobox
 * and the Android adaptive select/sheet both accept `{ value, label,
 * description, icon }`). Keeping this here means the option list, flag, and
 * symbol all come from one place instead of being rebuilt per screen.
 */
export type CurrencySelectOption = {
  value: CurrencyCode;
  label: string;
  description: string;
  icon: string;
};

export const getCurrencySelectOptions = (): CurrencySelectOption[] =>
  SUPPORTED_CURRENCIES.map(currency => ({
    value: currency.code,
    label: `${currency.code} · ${getCurrencySymbol(currency.code)}`,
    description: currency.label,
    icon: currency.flag,
  }));

const formatAmount = (amount: number, currency: CurrencyCode) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount);

export const formatCurrency = (
  amount: number | undefined | null,
  currency: CurrencyCode = runtimeState.displayCurrency,
): string => {
  const requestedDisplay = currency === runtimeState.displayCurrency;
  if (
    requestedDisplay &&
    runtimeState.baseCurrency !== runtimeState.displayCurrency &&
    !hasUsableDisplayRate()
  ) {
    return formatBaseCurrency(amount);
  }

  return formatAmount(convertFromBaseCurrency(amount, currency), currency);
};

export const formatBaseCurrency = (
  amount: number | undefined | null,
): string => {
  const value = Number(amount ?? 0);
  return formatAmount(
    Number.isFinite(value) ? value : 0,
    runtimeState.baseCurrency,
  );
};

// Compatibility alias retained so existing money surfaces automatically use
// the selected display currency without rewriting every call site.
export const formatPHP = (amount: number | undefined | null): string =>
  formatCurrency(amount);

export const parsePHP = (value: string): number =>
  parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
