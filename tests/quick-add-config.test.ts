import { describe, expect, it } from 'vitest';
import {
  findQuickAddAction,
  normalizeQuickAddSelection,
  QUICK_ADD_CATALOGUE,
  QUICK_ADD_DEFAULTS,
  QUICK_ADD_MAX,
} from '@/lib/native/quick-add-actions';

describe('quick add widget configuration', () => {
  it('keeps the chosen order rather than catalogue order', () => {
    expect(normalizeQuickAddSelection(['journal', 'task'])).toEqual([
      'journal',
      'task',
    ]);
  });

  it('never produces duplicate actions', () => {
    expect(
      normalizeQuickAddSelection(['task', 'task', 'food', 'task']),
    ).toEqual(['task', 'food']);
  });

  it('caps the selection at the maximum', () => {
    const everything = QUICK_ADD_CATALOGUE.map((entry) => entry.key);
    expect(normalizeQuickAddSelection(everything)).toHaveLength(QUICK_ADD_MAX);
  });

  it('falls back to defaults below the minimum so a widget is never empty', () => {
    expect(normalizeQuickAddSelection([])).toEqual(QUICK_ADD_DEFAULTS);
    expect(normalizeQuickAddSelection(['task'])).toEqual(QUICK_ADD_DEFAULTS);
  });

  it('discards actions that are not in the catalogue', () => {
    expect(
      normalizeQuickAddSelection(['task', 'teleport', 'food', '']),
    ).toEqual(['task', 'food']);
  });

  it('exposes a deep-link target for every catalogue entry', () => {
    for (const entry of QUICK_ADD_CATALOGUE) {
      expect(findQuickAddAction(entry.key)).toBeDefined();
      expect(entry.section.length).toBeGreaterThan(0);
      expect(entry.action.length).toBeGreaterThan(0);
    }
  });

  it('uses the canonical Balance one-time payment action for expenses', () => {
    expect(findQuickAddAction('expense')).toMatchObject({
      section: 'balance',
      action: 'new-expense',
    });
  });

  it('routes Journal Quick Add into Life Hub while preserving its key and action', () => {
    expect(findQuickAddAction('journal')).toMatchObject({
      key: 'journal',
      section: 'lifehub',
      action: 'add-journal',
    });
  });

  it('keeps the defaults valid against its own rules', () => {
    expect(normalizeQuickAddSelection(QUICK_ADD_DEFAULTS)).toEqual(
      QUICK_ADD_DEFAULTS,
    );
  });
});
