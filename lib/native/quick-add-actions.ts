/**
 * Quick Add action catalogue for the shared deep-link vocabulary.
 *
 * Only actions Caizen can genuinely deep-link into appear here, so a
 * configuration can never offer a destination that does nothing.
 */
export const QUICK_ADD_MIN = 2;
export const QUICK_ADD_MAX = 6;

export interface QuickAddAction {
  key: string;
  label: string;
  section: string;
  action: string;
}

export const QUICK_ADD_CATALOGUE: QuickAddAction[] = [
  { key: 'food', label: 'Food', section: 'health', action: 'add-food' },
  { key: 'task', label: 'Task', section: 'lifehub', action: 'add-task' },
  { key: 'routine', label: 'Routine', section: 'lifehub', action: 'add-routine' },
  { key: 'weight', label: 'Weight', section: 'health', action: 'add-weight' },
  { key: 'journal', label: 'Journal', section: 'lifehub', action: 'add-journal' },
  { key: 'event', label: 'Event', section: 'lifehub', action: 'add-date' },
  { key: 'expense', label: 'Expense', section: 'balance', action: 'new-expense' },
  { key: 'inventory', label: 'Inventory', section: 'inventory', action: 'add-inventory' },
  { key: 'wishlist', label: 'Plan', section: 'balance', action: 'add-plan' },
  { key: 'game', label: 'Game', section: 'entertainment', action: 'add-game' },
];

export const QUICK_ADD_DEFAULTS = [
  'food',
  'task',
  'routine',
  'weight',
  'journal',
  'event',
];

export function findQuickAddAction(key: string): QuickAddAction | undefined {
  return QUICK_ADD_CATALOGUE.find((entry) => entry.key === key);
}

/**
 * Drops unknown keys, removes duplicates while preserving order, enforces the
 * maximum, and falls back to the defaults when fewer than the minimum survive
 * - so a stored configuration can never render an empty or broken widget.
 */
export function normalizeQuickAddSelection(requested: string[]): string[] {
  const unique: string[] = [];

  for (const key of requested ?? []) {
    if (!key || !findQuickAddAction(key)) continue;
    if (unique.includes(key)) continue;
    unique.push(key);
    if (unique.length === QUICK_ADD_MAX) break;
  }

  return unique.length < QUICK_ADD_MIN ? [...QUICK_ADD_DEFAULTS] : unique;
}
