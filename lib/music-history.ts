import { parseLocalDateValue, toLocalDateKey } from './date-utils';
import type { MusicItem } from './types';

export type MonthlyMusicPlay = {
  item: MusicItem;
  count: number;
};

export function getMusicMonthKey(value: Date | string | number): string {
  return toLocalDateKey(value).slice(0, 7);
}

export function shiftMusicMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return getMusicMonthKey(new Date());
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMusicMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 'Music history';
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function getMusicMonthlyPlayCounts(
  items: readonly MusicItem[],
  monthKey: string,
): MonthlyMusicPlay[] {
  return items
    .filter(item => item.type !== 'playlist')
    .map(item => ({
      item,
      count: (item.playHistory || []).filter(event => getMusicMonthKey(event.playedAt) === monthKey).length,
    }))
    .filter(entry => entry.count > 0)
    .sort((left, right) =>
      right.count - left.count ||
      left.item.title.localeCompare(right.item.title) ||
      left.item.id.localeCompare(right.item.id),
    );
}

export function getMusicHistoryMonthBounds(
  items: readonly MusicItem[],
  anchor: Date | string | number = new Date(),
): { oldestMonth: string; currentMonth: string } {
  const currentMonth = getMusicMonthKey(anchor);
  const months = items
    .filter(item => item.type !== 'playlist')
    .flatMap(item => (item.playHistory || [])
    .map(event => parseLocalDateValue(event.playedAt))
    .filter((date): date is Date => Boolean(date))
    .map(date => getMusicMonthKey(date))
    .filter(month => month <= currentMonth));
  return {
    oldestMonth: months.sort()[0] || currentMonth,
    currentMonth,
  };
}

export function getMusicHistoryMonths(
  items: readonly MusicItem[],
  anchor: Date | string | number = new Date(),
): string[] {
  const { oldestMonth, currentMonth } = getMusicHistoryMonthBounds(items, anchor);
  const months: string[] = [];
  let cursor = oldestMonth;
  while (cursor <= currentMonth) {
    months.push(cursor);
    cursor = shiftMusicMonth(cursor, 1);
  }
  return months;
}
