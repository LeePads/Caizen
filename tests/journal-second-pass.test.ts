import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Journal second-pass UX contracts', () => {
  it('keeps Music Today URL-compatible while adding library-aware selection', () => {
    const modal = read('components/modals/JournalModal.tsx');
    const musicModal = read('components/modals/MusicModal.tsx');

    expect(modal).toContain("getMusicLinkIdentity");
    expect(modal).toContain('Choose from library');
    expect(modal).toContain('Add new music');
    expect(modal).toContain('onSaved={(item) =>');
    expect(modal).not.toContain('musicItemIds');
    expect(musicModal).toContain('onSaved?: (item: MusicItem) => void;');
    expect(musicModal).toContain('onSaved?.(savedMusicItem);');
  });

  it('renders compact Week rows with understandable enrichment actions', () => {
    const section = read('components/sections/JournalSection.tsx');

    expect(section).toContain('getJournalPreview(data)');
    expect(section).toContain('No entry yet');
    expect(section).toContain('Add journal entry for');
    expect(section).toContain('aria-label="Has memory photo"');
    expect(section).toContain('aria-label="Has music"');
    expect(section).toContain('playItems(linkedMusic.id, [linkedMusic])');
    expect(section).toContain('openExternalLink(safeMusicLink)');
    expect(section).toContain('presentation.mood');
    expect(section).toContain('moodAccent');
  });

  it('keeps Month cells compact while allowing past and current empty dates to add', () => {
    const section = read('components/sections/JournalSection.tsx');

    expect(section).toContain("const canCreate = !isFuture;");
    expect(section).toContain('<JournalMonthDayVisual');
    expect(section).toContain('journal-month-day-mood-dot');
    expect(section).toContain('h-24');
    expect(section).toContain('data-mood={presentation.mood}');
    expect(section).toContain('aria-label={`Open journal entry for');
    expect(section).not.toContain('journal-month-day-play');
    expect(section).not.toContain('onPlayMusic');
    expect(section).not.toContain('musicItemIds');
  });
});
