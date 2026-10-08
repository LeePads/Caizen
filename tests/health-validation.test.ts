import { describe, expect, it } from 'vitest';

import {
  HEALTH_LIMITS,
  guardHealthNumberChange,
  guardHealthTextChange,
  validateHealthNumber,
  validateHealthReps,
  validateHealthText,
  validateHealthTextIfChanged,
} from '@/lib/health/validation';

describe('Health draft validation', () => {
  it('accepts Unicode names and ordinary punctuation without allowing emoji', () => {
    expect(validateHealthText('Café au lait - 2%', { label: 'Food name', maxLength: 100, required: true })).toBeUndefined();
    expect(validateHealthText('Chicken 🍗', { label: 'Food name', maxLength: 100 })).toContain('Emoji');
    expect(validateHealthText('Bad\u200Bname', { label: 'Food name', maxLength: 100 })).toContain('invisible');
    expect(validateHealthText('line\nbreak', { label: 'Food name', maxLength: 100 })).toContain('one line');
    expect(validateHealthText('A\nnormal note', { label: 'Notes', maxLength: 100, mode: 'multiline' })).toBeUndefined();
  });

  it('enforces exact text boundaries and malformed Unicode safety', () => {
    expect(validateHealthText('a'.repeat(100), { label: 'Name', maxLength: 100 })).toBeUndefined();
    expect(validateHealthText('a'.repeat(101), { label: 'Name', maxLength: 100 })).toContain('100');
    expect(validateHealthText('\u0007', { label: 'Name', maxLength: 100 })).toContain('control');
    expect(validateHealthText('\uD800', { label: 'Name', maxLength: 100 })).toContain('invalid');
  });

  it('validates numeric bounds, precision, integer, signs, and optional blanks', () => {
    expect(validateHealthTextIfChanged('😀 legacy', '😀 legacy', { label: 'Name', maxLength: 100 })).toBeUndefined();
    expect(validateHealthNumber('0.01', { label: 'Amount', ...HEALTH_LIMITS.foodAmount })).toBeUndefined();
    expect(validateHealthNumber('100000', { label: 'Amount', ...HEALTH_LIMITS.foodAmount })).toBeUndefined();
    expect(validateHealthNumber('0', { label: 'Amount', ...HEALTH_LIMITS.foodAmount })).toContain('value from');
    expect(validateHealthNumber('1.001', { label: 'Amount', ...HEALTH_LIMITS.foodAmount })).toContain('decimal');
    expect(validateHealthNumber('12.5', { label: 'Sodium', ...HEALTH_LIMITS.sodium })).toContain('whole');
    expect(validateHealthNumber('', { label: 'Optional', min: 0, max: 1, allowBlank: true })).toBeUndefined();
    expect(validateHealthNumber('-1', { label: 'Calories', ...HEALTH_LIMITS.foodCalories })).toContain('Negative');
  });

  it('guards proposed typing and paste without changing the last accepted value', () => {
    const oversized = guardHealthNumberChange('125', '125000', { label: 'Calories', ...HEALTH_LIMITS.foodCalories, allowBlank: true });
    expect(oversized).toMatchObject({ value: '125', accepted: false });
    expect(oversized.error).toContain('Maximum');

    const emoji = guardHealthTextChange('Rice', 'Rice 🍚', { label: 'Food name', maxLength: 100 });
    expect(emoji).toMatchObject({ value: 'Rice', accepted: false });
    expect(emoji.error).toContain('Emoji');

    expect(guardHealthNumberChange('', '5', { label: 'Calorie target', min: 500, max: 10000, integer: true, allowBlank: true }).accepted).toBe(true);
    expect(guardHealthNumberChange('5', '50', { label: 'Calorie target', min: 500, max: 10000, integer: true, allowBlank: true }).accepted).toBe(true);
    expect(guardHealthNumberChange('50', '500', { label: 'Calorie target', min: 500, max: 10000, integer: true, allowBlank: true })).toMatchObject({ value: '500', accepted: true });
  });

  it('does not apply minimum errors while a numeric draft is being constructed', () => {
    const options = { label: 'Calorie target', min: 500, max: 10000, integer: true, allowBlank: true };
    let draft = '';
    for (const next of ['1', '16', '160', '1600']) {
      const result = guardHealthNumberChange(draft, next, options);
      expect(result.accepted).toBe(true);
      expect(result.error).toBeUndefined();
      draft = result.value;
    }
    expect(validateHealthNumber('1600', options)).toBeUndefined();
    expect(validateHealthNumber('1', options)).toContain('value from');
    expect(guardHealthNumberChange('1600', '', options)).toEqual({ value: '', accepted: true });
  });

  it('accepts decimal drafts but rejects precision and maximum overflow', () => {
    const options = { label: 'Weight', min: 20, max: 400, precision: 2, allowBlank: true };
    expect(guardHealthNumberChange('', '12.', options)).toMatchObject({ value: '12.', accepted: true });
    expect(guardHealthNumberChange('12.', '12.3', options).accepted).toBe(true);
    expect(guardHealthNumberChange('12.3', '12.345', options)).toMatchObject({ value: '12.3', accepted: false });
    expect(guardHealthNumberChange('399', '4000', options)).toMatchObject({ value: '399', accepted: false });
  });

  it('accepts only canonical reps values', () => {
    expect(validateHealthReps('8')).toBeUndefined();
    expect(validateHealthReps('12')).toBeUndefined();
    expect(validateHealthReps('8-12')).toBeUndefined();
    expect(validateHealthReps('12-8')).toContain('ascending');
    expect(validateHealthReps('8--12')).toContain('number or range');
    expect(validateHealthReps('101')).toContain('ascending');
  });
});
