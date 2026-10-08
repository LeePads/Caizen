/** Pure date/time helpers used by the Android wheel pickers. */

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return daysInMonth(year, 2) === 29;
}

export function clampDay(year: number, month1to12: number, day: number): number {
  return Math.max(1, Math.min(day, daysInMonth(year, month1to12)));
}

export function toLocalDateParts(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function fromLocalDateParts(
  year: number,
  month: number,
  day: number,
): string {
  const safeMonth = Math.max(1, Math.min(12, Math.trunc(month)));
  const clampedDay = clampDay(year, safeMonth, day);
  return `${String(year).padStart(4, '0')}-${String(safeMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function isValidLocalDateValue(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const { year, month, day } = toLocalDateParts(value);
  return (
    Number.isInteger(year) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function clampLocalDateValue(
  value: string,
  min?: string,
  max?: string,
): string {
  if (!isValidLocalDateValue(value)) return value;
  let result = value;
  if (min && isValidLocalDateValue(min) && result < min) result = min;
  if (max && isValidLocalDateValue(max) && result > max) result = max;
  return result;
}

export function isDateWithinRange(
  value: string,
  min?: string,
  max?: string,
): boolean {
  if (!isValidLocalDateValue(value)) return false;
  if (min && isValidLocalDateValue(min) && value < min) return false;
  if (max && isValidLocalDateValue(max) && value > max) return false;
  return true;
}

export function isValidTimeValue(value: string): boolean {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(value: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function clampTimeValue(
  value: string,
  min?: string,
  max?: string,
): string {
  if (!isValidTimeValue(value)) return value;
  let minutes = timeToMinutes(value);
  if (min && isValidTimeValue(min)) minutes = Math.max(minutes, timeToMinutes(min));
  if (max && isValidTimeValue(max)) minutes = Math.min(minutes, timeToMinutes(max));
  return minutesToTime(minutes);
}

export function isTimeWithinRange(
  value: string,
  min?: string,
  max?: string,
): boolean {
  if (!isValidTimeValue(value)) return false;
  const minutes = timeToMinutes(value);
  if (min && isValidTimeValue(min) && minutes < timeToMinutes(min)) return false;
  if (max && isValidTimeValue(max) && minutes > timeToMinutes(max)) return false;
  return true;
}

/** Native input step is in seconds. The wheel supports minute precision. */
export function minuteStepFromInput(step?: number | string): number {
  if (step === undefined || step === '' || step === 'any') return 1;
  const seconds = Number(step);
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.min(30, Math.round(seconds / 60)));
}

export const TIME_WHEEL_HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);

export const TIME_WHEEL_REPEAT_COUNT = 5;

export function wrapWheelIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((Math.trunc(index) % length) + length) % length;
}

export function getMiddleWheelIndex(
  logicalIndex: number,
  length: number,
  repeatCount = TIME_WHEEL_REPEAT_COUNT,
): number {
  if (length <= 0) return 0;
  const middleCopy = Math.floor(Math.max(1, repeatCount) / 2);
  return middleCopy * length + wrapWheelIndex(logicalIndex, length);
}

export function getWheelLogicalIndex(index: number, length: number): number {
  return wrapWheelIndex(index, length);
}

export function recenterWheelIndex(
  index: number,
  length: number,
  repeatCount = TIME_WHEEL_REPEAT_COUNT,
): number {
  return getMiddleWheelIndex(getWheelLogicalIndex(index, length), length, repeatCount);
}

export function buildTimeWheelMinutes(
  minuteStep = 1,
  selectedMinute?: number,
): number[] {
  const step = Math.max(1, Math.min(30, Math.trunc(minuteStep)));
  const values = Array.from(
    { length: Math.ceil(60 / step) },
    (_, index) => index * step,
  ).filter(value => value < 60);

  const selected = selectedMinute;
  if (
    typeof selected === 'number' &&
    Number.isInteger(selected) &&
    selected >= 0 &&
    selected < 60 &&
    !values.includes(selected)
  ) {
    values.push(selected);
  }

  return values.sort((a, b) => a - b);
}

export type Meridiem = 'AM' | 'PM';

export function toTimeParts(value: string): {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
} {
  const [hour24, minute] = value.split(':').map(Number);
  const meridiem: Meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiem };
}

export function fromTimeParts(
  hour12: number,
  minute: number,
  meridiem: Meridiem,
): string {
  const normalizedHour12 = ((hour12 - 1) % 12 + 12) % 12 + 1;
  let hour24 = normalizedHour12 % 12;
  if (meridiem === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(Math.max(0, Math.min(59, Math.round(minute)))).padStart(2, '0')}`;
}
