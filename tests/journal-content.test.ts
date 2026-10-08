import { describe, expect, it } from 'vitest';
import {
  decodeJournalContent,
  deriveJournalPresentation,
  encodeJournalContent,
  getJournalPreview,
  hasMeaningfulJournalContent,
  hasMeaningfulJournalEntry,
} from '@/lib/journal-content';
import { getStoredJournalMood } from '@/lib/journal-moods';

describe('Journal content compatibility', () => {
  it('decodes canonical structured content', () => {
    expect(decodeJournalContent(JSON.stringify({
      mattered: 'A quiet morning',
      wentWell: 'Finished the walk',
      didntGoWell: 'Traffic',
      tomorrow: 'Read',
      musicLinks: ['https://example.com/song'],
    }))).toEqual({
      mattered: 'A quiet morning',
      wentWell: 'Finished the walk',
      didntGoWell: 'Traffic',
      tomorrow: 'Read',
      musicLinks: ['https://example.com/song'],
    });
  });

  it('opens plain, malformed, empty, Unicode, and multiline content without throwing', () => {
    expect(decodeJournalContent('Plain journal text\nwith a second line 🌿').mattered).toBe('Plain journal text\nwith a second line 🌿');
    expect(decodeJournalContent('{"mattered":"unfinished').mattered).toBe('{"mattered":"unfinished');
    expect(decodeJournalContent('').mattered).toBe('');
    expect(decodeJournalContent('   ').musicLinks).toEqual(['']);
  });

  it('preserves recoverable content instead of coercing invalid structured values', () => {
    const raw = JSON.stringify({ mattered: { unsafe: true } });
    expect(decodeJournalContent(raw).mattered).toBe(raw);
    expect(decodeJournalContent(JSON.stringify({ other: 'legacy field' })).mattered)
      .toBe(JSON.stringify({ other: 'legacy field' }));
  });

  it('round-trips edit, save, and reopen through the canonical representation', () => {
    const draft = {
      mattered: 'Unicode 🌿\nkept',
      wentWell: 'Saved locally',
      didntGoWell: '',
      tomorrow: 'Rest',
      musicLinks: ['https://example.com/song', ''],
    };
    const reopened = decodeJournalContent(encodeJournalContent(draft));
    expect(reopened).toEqual({ ...draft, musicLinks: ['https://example.com/song'] });
  });

  it('does not treat the empty structured payload as a meaningful entry', () => {
    const empty = decodeJournalContent(encodeJournalContent({
      mattered: '',
      wentWell: '',
      didntGoWell: '',
      tomorrow: '',
      musicLinks: [''],
    }));

    expect(hasMeaningfulJournalContent(empty)).toBe(false);
    expect(hasMeaningfulJournalEntry({ content: encodeJournalContent(empty) })).toBe(false);
    expect(hasMeaningfulJournalEntry({ content: encodeJournalContent(empty), photoAssetIds: ['photo-1'] })).toBe(true);
    expect(hasMeaningfulJournalEntry({ content: encodeJournalContent(empty), mood: 'rough' })).toBe(true);
  });

  it('treats any written prompt or music link as meaningful content', () => {
    expect(hasMeaningfulJournalContent({
      mattered: 'A short note',
      wentWell: '',
      didntGoWell: '',
      tomorrow: '',
      musicLinks: [''],
    })).toBe(true);

    expect(hasMeaningfulJournalContent({
      mattered: '',
      wentWell: '',
      didntGoWell: '',
      tomorrow: '',
      musicLinks: ['https://example.com/song'],
    })).toBe(true);
  });

  it('extracts a compact preview from the first non-empty prompt', () => {
    expect(getJournalPreview({
      mattered: '   ',
      wentWell: 'A calm walk   before dinner',
      didntGoWell: 'A later thought',
      tomorrow: '',
      musicLinks: [''],
    })).toBe('A calm walk before dinner');
  });

  it('clamps long previews without breaking whitespace', () => {
    expect(getJournalPreview({
      mattered: 'This is a deliberately long journal reflection that should become a concise timeline preview for the weekly Journal view.',
      wentWell: '',
      didntGoWell: '',
      tomorrow: '',
      musicLinks: [''],
    }, 32)).toBe('This is a deliberately long jou…');
  });

  it.each(['rough', 'okay', 'good'])('treats a %s-only entry as meaningful content', (mood) => {
    expect(hasMeaningfulJournalEntry({
      content: encodeJournalContent({
        mattered: '',
        wentWell: '',
        didntGoWell: '',
        tomorrow: '',
        musicLinks: [''],
      }),
      mood,
    })).toBe(true);
  });

  it('maps saved and legacy moods without inventing Okay for missing values', () => {
    expect(getStoredJournalMood('rough')).toBe('rough');
    expect(getStoredJournalMood('neutral')).toBe('okay');
    expect(getStoredJournalMood('happy')).toBe('good');
    expect(getStoredJournalMood(undefined)).toBeNull();
    expect(getStoredJournalMood('unknown')).toBeNull();
  });

  it('derives truthful mood, memory, and music presentation state', () => {
    const normalizeLink = (value: string) => value.startsWith('https://') ? value : null;
    const state = deriveJournalPresentation({
      content: encodeJournalContent({
        mattered: '',
        wentWell: '',
        didntGoWell: '',
        tomorrow: '',
        musicLinks: ['', '   ', 'javascript:alert(1)', 'https://music.example/song'],
      }),
      mood: 'good',
      image: '   ',
      photoAssetIds: ['', '  '],
    }, normalizeLink);

    expect(state.mood).toBe('good');
    expect(state.hasReflection).toBe(false);
    expect(state.hasMemory).toBe(false);
    expect(state.hasMusic).toBe(true);
    expect(state.rawMusicLinks).toEqual(['javascript:alert(1)', 'https://music.example/song']);
    expect(state.usableMusicLinks).toEqual(['https://music.example/song']);

    expect(deriveJournalPresentation({
      content: encodeJournalContent({ mattered: '', wentWell: '', didntGoWell: '', tomorrow: '', musicLinks: [''] }),
      photoAssetIds: ['memory-1'],
    }, normalizeLink).hasMemory).toBe(true);
    expect(deriveJournalPresentation({
      content: encodeJournalContent({ mattered: '', wentWell: '', didntGoWell: '', tomorrow: '', musicLinks: [''] }),
      image: 'https://images.example/memory.jpg',
    }, normalizeLink).hasMemory).toBe(true);

    expect(deriveJournalPresentation({
      content: encodeJournalContent({ mattered: '', wentWell: '', didntGoWell: '', tomorrow: '', musicLinks: [''] }),
      photoAssetIds: [''],
      image: 'not-a-url',
    }, normalizeLink).hasMusic).toBe(false);
  });
});
