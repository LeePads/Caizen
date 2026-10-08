import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Journal focused UX contracts', () => {
  it('makes quick writing primary while preserving guided reflection fields', () => {
    const modal = read('components/modals/JournalModal.tsx');

    expect(modal).toContain('Write about today...');
    expect(modal).toContain('Guided reflection');
    expect(modal).toContain('aria-controls="journal-guided-reflection"');
    expect(modal).toContain('aria-controls="journal-memory-fields"');
    expect(modal).toContain('aria-controls="journal-music-fields"');
    expect(modal).toContain('Add a mood, reflection, memory, or music before saving.');
    expect(modal).not.toContain('Add a reflection, memory, or music link before saving.');
    expect(modal).toContain('useState<MoodType | null>(null)');
    expect(modal).toContain('mood: null as MoodType | null');
    expect(modal).toContain('id="journal-mattered"');
    expect(modal).toContain('id="journal-went-well"');
    expect(modal).toContain('id="journal-tomorrow"');
  });

  it('keeps Journal period and search geometry deterministic', () => {
    const journal = read('components/sections/JournalSection.tsx');

    expect(journal).toContain('findLatestJournalEntry');
    expect(journal).toContain('const effectiveSelectedWeek = Math.min(selectedWeek, maxWeek);');
    expect(journal).toContain('selectedWeekDays.reduce');
    expect(journal).toContain('No entries match');
    expect(journal).toContain('opacity-0');
    expect(journal).toContain('aria-label="Journal timeline period"');
    expect(journal).toContain('getJournalPresentationState(entry)');
    expect(journal).toContain("Mood recorded");
    expect(journal).toContain('No written reflection');
    expect(journal).toContain('presentation.hasMusic');
    expect(journal).toContain('presentation.hasMemory');
    expect(journal).toContain("setTimelinePeriod('all')");
    expect(journal).toContain('All month');
  });

  it('gives Journal overlays and controls accessible names and lifecycle hooks', () => {
    const journal = read('components/sections/JournalSection.tsx');

    expect(journal).toContain("import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';");
    expect(journal).toContain('role="dialog"');
    expect(journal).toContain('aria-modal="true"');
    expect(journal).toContain('aria-label="Previous month"');
    expect(journal).toContain('aria-label="Next month"');
    expect(journal).toContain('<span>Timeline</span>');
    expect(journal).toContain('<span>Calendar</span>');
    expect(journal).toContain('aria-label="Close journal entry"');
    expect(journal).toContain('aria-label="Close Music Today"');
    expect(journal).toContain('openExternalLink(safeLink)');
    expect(journal).not.toContain('target="_blank"');
  });

  it('keeps historical Journal adds on the selected date and protects against stale duplicates', () => {
    const journal = read('components/sections/JournalSection.tsx');
    const modal = read('components/modals/JournalModal.tsx');

    expect(journal).toContain('const openCreateForDate = (date: Date) =>');
    expect(journal).toContain('const existingEntry = findLatestJournalEntry(journalEntries, date);');
    expect(journal).toContain('openCreateForDate(day);');
    expect(journal).toContain('initialDate={newEntryDate}');
    expect(modal).toContain('(currentEntry?.date || initialDate)?.toLocaleDateString');
  });

  it('gives Journal media a clear hierarchy across Dashboard, Life Hub, and details', () => {
    const dashboard = read('components/sections/Dashboard.tsx');
    const lifeHub = read('components/sections/LifeHubSection.tsx');
    const journal = read('components/sections/JournalSection.tsx');

    expect(dashboard).toContain('sm:grid-cols-[minmax(0,11rem)_1fr]');
    expect(dashboard).toContain('Open Journal');
    expect(dashboard).toContain("todayJournalMusic?.title || 'Linked music'");
    expect(lifeHub).toContain('alt="Today Journal memory"');
    expect(lifeHub).toContain("todayJournalMusic?.title || 'Linked music'");
    expect(lifeHub).not.toContain('<span aria-label="Memory saved">Memory</span>');
    expect(journal).toContain('aspect-video max-h-80 w-full object-cover');
    expect(journal).toContain('setMemoryPreview(preview)');
  });
});
