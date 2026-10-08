import type { AchievementPath } from '../types';

/** Stable category order and display metadata shared by mastery consumers. */
export const MASTERY_CATEGORY_ORDER: readonly AchievementPath[] = [
  'productivity',
  'wellness',
  'finance',
  'collection',
  'reflection',
  'discipline',
];

export const MASTERY_CATEGORY_LABEL: Readonly<Record<AchievementPath, string>> = {
  productivity: 'Productivity',
  wellness: 'Wellness',
  finance: 'Finance',
  collection: 'Collection',
  reflection: 'Reflection',
  discipline: 'Discipline',
};
