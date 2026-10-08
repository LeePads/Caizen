import { describe, expect, it } from 'vitest';

import {
  CM_MAX,
  CM_MIN,
  KG_MAX,
  KG_MIN,
  calculateBmi,
  canonicalHeightFromDraft,
  canonicalWeightFromDraft,
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  getHeightImperialBounds,
  getWeightBounds,
  kgToLb,
  kgToWeight,
  lbToKg,
  readHealthMeasurementPreferences,
  weightToKg,
} from '@/lib/health/measurements';

describe('Health measurement display conversions', () => {
  it('round-trips kg and lb without changing the canonical value materially', () => {
    const kg = 72.35;
    expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 8);
    expect(canonicalWeightFromDraft(kgToWeight(kg, 'lb'), 'lb')).toBe(72.35);
    expect(weightToKg(160, 'lb')).toBeCloseTo(72.5748, 3);
  });

  it('maps display weight bounds from the canonical kg range', () => {
    const pounds = getWeightBounds('lb');
    expect(pounds.min).toBeCloseTo(kgToLb(KG_MIN), 8);
    expect(pounds.max).toBeCloseTo(kgToLb(KG_MAX), 8);
  });

  it('converts height through inches and feet/inches while keeping cm canonical', () => {
    expect(cmToInches(170)).toBeCloseTo(66.9291, 3);
    expect(feetInchesToCm(5, 6.9)).toBeCloseTo(169.926, 5);
    const parts = cmToFeetInches(170);
    expect(parts.feet).toBe(5);
    expect(parts.inches).toBeCloseTo(6.9, 1);
    expect(canonicalHeightFromDraft(parts, 'ft-in')).toBe(169.9);
  });

  it('exposes canonical and imperial height boundaries', () => {
    const bounds = getHeightImperialBounds();
    expect(bounds.minTotalInches).toBeCloseTo(CM_MIN / 2.54, 8);
    expect(bounds.maxTotalInches).toBeCloseTo(CM_MAX / 2.54, 8);
  });

  it('falls back to metric profile preferences when storage is absent or malformed', () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: { getItem: () => '{bad' } },
    });
    expect(readHealthMeasurementPreferences('profile-a')).toEqual({ weightUnit: 'kg', heightUnit: 'cm' });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });

  it('keeps canonical boundaries unchanged', () => {
    expect(KG_MIN).toBe(20);
    expect(KG_MAX).toBe(400);
    expect(CM_MIN).toBe(80);
    expect(CM_MAX).toBe(250);
  });

  it('derives BMI from canonical weight and height without inventing missing values', () => {
    expect(calculateBmi(82, 168)).toBe(29.1);
    expect(calculateBmi(undefined, 168)).toBeNull();
    expect(calculateBmi(82, undefined)).toBeNull();
    expect(calculateBmi(0, 168)).toBeNull();
  });
});
