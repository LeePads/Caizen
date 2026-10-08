import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  getEffectiveMoneyInputCurrency,
  setCurrencyContext,
  refreshCurrencyRate,
} from '@/lib/currency';

describe('currency-aware money inputs', () => {
  afterEach(() => {
    setCurrencyContext('PHP', 'PHP');
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it('formats stored base values and converts edited display values back to base', () => {
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
    });
    localStorage.setItem(
      'caizen-currency-rate-v2:PHP:USD',
      JSON.stringify({
        baseCurrency: 'PHP',
        displayCurrency: 'USD',
        rate: 0.02,
        fetchedAt: new Date().toISOString(),
      }),
    );

    setCurrencyContext('PHP', 'USD');

    expect(formatMoneyInputValue(420, 'USD')).toBe('8.4');
    expect(convertMoneyInputToBase('8', 'USD')).toBe(400);
    expect(convertMoneyInputToBase('0', 'USD')).toBe(0);
    expect(convertMoneyInputToBase('', 'USD')).toBeUndefined();
    expect(convertMoneyInputToBase('1e308', 'USD')).toBeUndefined();
    expect(convertMoneyInputToBase('2000000000000', 'USD')).toBeUndefined();
  });

  it('rejects unsafe amounts while preserving zero, negative balances, and cent rounding', () => {
    setCurrencyContext('PHP', 'PHP');
    for (const value of ['1e308', '-1e308', '90071992547410', 'NaN', 'Infinity', '']) {
      expect(convertMoneyInputToBase(value, 'PHP')).toBeUndefined();
    }
    expect(convertMoneyInputToBase('1000000000.25', 'PHP')).toBe(1000000000.25);
    expect(convertMoneyInputToBase('-12.34', 'PHP')).toBe(-12.34);
    expect(convertMoneyInputToBase('0', 'PHP')).toBe(0);
    expect(convertMoneyInputToBase('0.001', 'PHP')).toBe(0);
    expect(convertMoneyInputToBase('0.005', 'PHP')).toBe(0.01);
  });

  it('falls back to base-currency input when the rate is unavailable', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    setCurrencyContext('PHP', 'EUR');
    await refreshCurrencyRate(true);

    expect(getEffectiveMoneyInputCurrency('EUR')).toBe('PHP');
    expect(convertMoneyInputToBase('8', 'EUR')).toBe(8);
    expect(formatMoneyInputValue(420, 'EUR')).toBe('420');
  });
});
