import { describe, expect, it } from 'vitest';
import { applyJournalEvidenceToProfile } from '@/lib/journal/lifehub-completion';
import type { DailyChecklistItem, JournalEntry, Profile } from '@/lib/types';

const date = new Date(2026, 7, 28, 10);

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id: 'journal-routine',
    title: 'Write in journal',
    frequency: 'daily',
    active: true,
    linkedContext: { section: 'journal', type: 'journal-entry' },
    createdAt: new Date(2026, 7, 1, 12),
    ...overrides,
  };
}

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-a',
    date,
    content: 'A meaningful reflection',
    createdAt: date,
    ...overrides,
  };
}

function profile(routines: DailyChecklistItem[]): Profile {
  return {
    id: 'profile-a',
    name: 'Profile',
    dailyChecklistItems: routines,
    productivityItems: [],
    journalEntries: [],
    workItems: [],
    categoryXpEvents: [],
    masteryBondXpEvents: [],
    masteryBondClaims: [],
    createdAt: date,
  } as unknown as Profile;
}

describe('Journal routine evidence', () => {
  it('completes a due canonical Journal routine once', () => {
    const first = applyJournalEvidenceToProfile(profile([routine()]), entry(), date);
    expect(first.completedRoutineIds).toEqual(['journal-routine']);
    expect(first.profile.dailyChecklistItems[0].completionHistory).toMatchObject([
      { date: '2026-08-28', status: 'done' },
    ]);
    const second = applyJournalEvidenceToProfile(first.profile, entry(), date);
    expect(second.completedRoutineIds).toEqual([]);
  });

  it('ignores blank evidence, skipped occurrences, and legacy navigation-only links', () => {
    const source = profile([
      routine({ id: 'blank-target' }),
      routine({ id: 'skipped', completionHistory: [{ date: '2026-08-28', status: 'skipped' }] }),
      routine({ id: 'legacy', linkedContext: undefined, linkedSection: 'journal' }),
    ]);
    expect(applyJournalEvidenceToProfile(source, entry({ content: '' }), date).completedRoutineIds).toEqual([]);
    expect(applyJournalEvidenceToProfile(source, entry(), date).completedRoutineIds).toEqual(['blank-target']);
  });
});
