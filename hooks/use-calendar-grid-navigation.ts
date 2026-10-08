'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { toLocalDateKey } from '@/lib/lifehub/date-utils';

export type WeekStartsOn = 0 | 1;

const atNoon = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

export function addCalendarDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);
}

export function addCalendarMonths(date: Date, amount: number) {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
    12,
  ).getDate();
  return new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(date.getDate(), lastDay),
    12,
  );
}

export function getCalendarGridDestination(
  date: Date,
  key: string,
  weekStartsOn: WeekStartsOn,
) {
  if (key === 'ArrowLeft') return addCalendarDays(date, -1);
  if (key === 'ArrowRight') return addCalendarDays(date, 1);
  if (key === 'ArrowUp') return addCalendarDays(date, -7);
  if (key === 'ArrowDown') return addCalendarDays(date, 7);
  if (key === 'PageUp') return addCalendarMonths(date, -1);
  if (key === 'PageDown') return addCalendarMonths(date, 1);
  if (key === 'Home') {
    const offset = (date.getDay() - weekStartsOn + 7) % 7;
    return addCalendarDays(date, -offset);
  }
  if (key === 'End') {
    const offset = (date.getDay() - weekStartsOn + 7) % 7;
    return addCalendarDays(date, 6 - offset);
  }
  return null;
}

function initialTarget(days: Date[], month: Date, selectedKey?: string) {
  const keys = new Set(days.map(toLocalDateKey));
  if (selectedKey && keys.has(selectedKey)) return selectedKey;

  const today = atNoon(new Date());
  if (
    today.getFullYear() === month.getFullYear() &&
    today.getMonth() === month.getMonth()
  ) {
    return toLocalDateKey(today);
  }
  return toLocalDateKey(new Date(month.getFullYear(), month.getMonth(), 1, 12));
}

function monthTarget(month: Date, selectedKey?: string) {
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
  if (selectedKey?.startsWith(monthPrefix)) return selectedKey;
  const today = atNoon(new Date());
  if (today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()) {
    return toLocalDateKey(today);
  }
  return toLocalDateKey(new Date(month.getFullYear(), month.getMonth(), 1, 12));
}

export function useCalendarGridNavigation({
  days,
  month,
  selectedKey,
  weekStartsOn,
  onMonthChange,
}: {
  days: Date[];
  month: Date;
  selectedKey?: string;
  weekStartsOn: WeekStartsOn;
  onMonthChange: (month: Date) => void;
}) {
  const dayKeys = useMemo(() => days.map(toLocalDateKey), [days]);
  const [rovingKey, setRovingKey] = useState(() => initialTarget(days, month, selectedKey));
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocusKey = useRef<string | null>(null);

  useEffect(() => {
    const next = initialTarget(days, month, selectedKey);
    if (!dayKeys.includes(rovingKey)) setRovingKey(next);
  }, [dayKeys, days, month, rovingKey, selectedKey]);

  useEffect(() => {
    const target = pendingFocusKey.current;
    if (!target || !dayKeys.includes(target)) return;
    pendingFocusKey.current = null;
    setRovingKey(target);
    requestAnimationFrame(() => cellRefs.current.get(target)?.focus({ preventScroll: true }));
  }, [dayKeys]);

  const moveTo = useCallback((target: Date, focus: boolean) => {
    const key = toLocalDateKey(target);
    const monthChanged =
      target.getFullYear() !== month.getFullYear() || target.getMonth() !== month.getMonth();
    setRovingKey(key);
    if (monthChanged) {
      if (focus) pendingFocusKey.current = key;
      onMonthChange(new Date(target.getFullYear(), target.getMonth(), 1, 12));
      return;
    }
    if (focus) requestAnimationFrame(() => cellRefs.current.get(key)?.focus({ preventScroll: true }));
  }, [month, onMonthChange]);

  const getCellProps = useCallback((date: Date) => {
    const key = toLocalDateKey(date);
    return {
      tabIndex: rovingKey === key ? 0 : -1,
      ref: (node: HTMLElement | null) => {
        if (node) cellRefs.current.set(key, node);
        else cellRefs.current.delete(key);
      },
      onFocus: () => setRovingKey(key),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const target = getCalendarGridDestination(date, event.key, weekStartsOn);
        if (!target) return;
        event.preventDefault();
        moveTo(target, true);
      },
    };
  }, [moveTo, rovingKey, weekStartsOn]);

  const changeMonthFromToolbar = useCallback((nextMonth: Date) => {
    setRovingKey(monthTarget(nextMonth, selectedKey));
    onMonthChange(nextMonth);
  }, [onMonthChange, selectedKey]);

  return { getCellProps, changeMonthFromToolbar };
}
