import { describe, expect, it } from 'vitest';

import {
  buildTimeWheelMinutes,
  clampDay,
  daysInMonth,
  fromLocalDateParts,
  fromTimeParts,
  isLeapYear,
  isValidLocalDateValue,
  isValidTimeValue,
  toLocalDateParts,
  toTimeParts,
  TIME_WHEEL_HOURS_12,
  getMiddleWheelIndex,
  getWheelLogicalIndex,
  recenterWheelIndex,
  wrapWheelIndex,
} from '@/lib/native/wheel-date-time';

describe('Caizen wheel picker date math', () => {
  it('identifies leap years correctly', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(1900)).toBe(false); // divisible by 100, not 400
  });

  it('computes correct days for every month length, including leap February', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('clamps an out-of-range day to the target month\'s last valid day', () => {
    // Switching from March 31 to February must land on 28 (or 29).
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2024, 2, 31)).toBe(29);
    expect(clampDay(2026, 4, 31)).toBe(30);
  });

  it('never clamps a day below 1', () => {
    expect(clampDay(2026, 2, 0)).toBe(1);
  });

  it('handles the December -> January year boundary', () => {
    const parts = toLocalDateParts('2026-12-31');
    expect(parts).toEqual({ year: 2026, month: 12, day: 31 });
    expect(fromLocalDateParts(2026, 12, 31)).toBe('2026-12-31');
    // Rolling the month wheel past December is the picker's job, not this
    // module's - but constructing Jan 1 of the next year must round-trip.
    expect(fromLocalDateParts(2027, 1, 1)).toBe('2027-01-01');
  });

  it('preserves an existing local date value exactly (no UTC shift)', () => {
    const value = '2026-02-29'.replace('29', '15'); // 2026-02-15, a non-leap-year date
    const parts = toLocalDateParts(value);
    expect(fromLocalDateParts(parts.year, parts.month, parts.day)).toBe(value);
  });

  it('validates local date strings, rejecting invalid days for the month', () => {
    expect(isValidLocalDateValue('2026-02-28')).toBe(true);
    expect(isValidLocalDateValue('2026-02-29')).toBe(false); // not a leap year
    expect(isValidLocalDateValue('2024-02-29')).toBe(true); // leap year
    expect(isValidLocalDateValue('not-a-date')).toBe(false);
  });
});

describe('Caizen wheel picker time math', () => {
  it('keeps the time wheel ranges complete at minute precision', () => {
    expect(TIME_WHEEL_HOURS_12).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(buildTimeWheelMinutes(1)).toEqual(Array.from({ length: 60 }, (_, index) => index));
    expect(buildTimeWheelMinutes(1, 47)).toContain(47);
    expect(buildTimeWheelMinutes(1, 23)).toContain(23);
  });

  it('converts 24-hour values to 12-hour + meridiem and back', () => {
    expect(toTimeParts('00:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(toTimeParts('12:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'PM' });
    expect(toTimeParts('13:30')).toEqual({ hour12: 1, minute: 30, meridiem: 'PM' });
    expect(toTimeParts('23:59')).toEqual({ hour12: 11, minute: 59, meridiem: 'PM' });
    expect(fromTimeParts(12, 0, 'AM')).toBe('00:00');
    expect(fromTimeParts(12, 59, 'PM')).toBe('12:59');
  });

  it('round-trips every hour of the day through from/to time parts', () => {
    for (let hour24 = 0; hour24 < 24; hour24++) {
      const value = `${String(hour24).padStart(2, '0')}:00`;
      const { hour12, minute, meridiem } = toTimeParts(value);
      expect(fromTimeParts(hour12, minute, meridiem)).toBe(value);
    }
  });

  it('validates time strings', () => {
    expect(isValidTimeValue('09:30')).toBe(true);
    expect(isValidTimeValue('24:00')).toBe(false);
    expect(isValidTimeValue('12:60')).toBe(false);
    expect(isValidTimeValue('bad')).toBe(false);
  });

  it('wraps cyclic hour and minute indexes without an unbounded DOM', () => {
    expect(wrapWheelIndex(-1, 12)).toBe(11);
    expect(wrapWheelIndex(12, 12)).toBe(0);
    expect(wrapWheelIndex(60, 60)).toBe(0);
    expect(getWheelLogicalIndex(getMiddleWheelIndex(0, 12) - 1, 12)).toBe(11);
    expect(getWheelLogicalIndex(getMiddleWheelIndex(59, 60) + 1, 60)).toBe(0);
  });

  it('recenters equivalent values in the middle repeated copy', () => {
    const middle = getMiddleWheelIndex(3, 12);
    expect(recenterWheelIndex(middle + 12, 12)).toBe(middle);
    expect(recenterWheelIndex(middle - 12, 12)).toBe(middle);
    expect(getWheelLogicalIndex(recenterWheelIndex(0, 60), 60)).toBe(0);
  });
});
