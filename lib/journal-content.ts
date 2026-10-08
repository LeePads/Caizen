import type { MoodType } from './types';
import { getStoredJournalMood } from './journal-moods';

export interface JournalContentDraft {
  mattered: string;
  wentWell: string;
  didntGoWell: string;
  tomorrow: string;
  musicLinks: string[];
}

export type JournalContentEntry = {
  content?: unknown;
  mood?: unknown;
  image?: unknown;
  photoAssetIds?: unknown;
};

export type JournalPresentationState = {
  content: JournalContentDraft;
  mood: MoodType | null;
  hasReflection: boolean;
  hasMemory: boolean;
  hasMusic: boolean;
  usableMusicLinks: string[];
  rawMusicLinks: string[];
};

const emptyJournalContent = (): JournalContentDraft => ({
  mattered: '',
  wentWell: '',
  didntGoWell: '',
  tomorrow: '',
  musicLinks: [''],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLinks(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some(link => typeof link !== 'string')) return null;
  const links = value.map(link => link.trim()).filter(Boolean);
  return links.length > 0 ? links : [''];
}

/**
 * Decodes both the current structured Journal format and legacy/plain content.
 * Raw content is placed in the first editor field so it remains recoverable.
 */
export function decodeJournalContent(content: unknown): JournalContentDraft {
  const raw = typeof content === 'string' ? content : '';
  if (!raw.trim()) return emptyJournalContent();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...emptyJournalContent(), mattered: raw };
  }

  if (!isRecord(parsed)) return { ...emptyJournalContent(), mattered: raw };

  const fields = ['mattered', 'wentWell', 'didntGoWell', 'tomorrow'];
  const hasStructuredField = fields.some(field => Object.prototype.hasOwnProperty.call(parsed, field));
  const validTextFields = fields.every(field => parsed[field] == null || typeof parsed[field] === 'string');
  const links = parsed.musicLinks == null ? [''] : normalizeLinks(parsed.musicLinks);

  if (!hasStructuredField || !validTextFields || !links) {
    return { ...emptyJournalContent(), mattered: raw };
  }

  return {
    mattered: typeof parsed.mattered === 'string' ? parsed.mattered : '',
    wentWell: typeof parsed.wentWell === 'string' ? parsed.wentWell : '',
    didntGoWell: typeof parsed.didntGoWell === 'string' ? parsed.didntGoWell : '',
    tomorrow: typeof parsed.tomorrow === 'string' ? parsed.tomorrow : '',
    musicLinks: links,
  };
}

/** Serializes the editor's stable current representation for new saves. */
export function encodeJournalContent(draft: JournalContentDraft): string {
  return JSON.stringify({
    mattered: draft.mattered,
    wentWell: draft.wentWell,
    didntGoWell: draft.didntGoWell,
    tomorrow: draft.tomorrow,
    musicLinks: draft.musicLinks.map(link => link.trim()).filter(Boolean),
  });
}

/**
 * A serialized Journal draft is always non-empty JSON, even when every field
 * is blank. Keep meaningful-entry checks at the decoded content boundary so
 * empty drafts do not count as written reflections.
 */
export function hasMeaningfulJournalContent(draft: JournalContentDraft): boolean {
  return [draft.mattered, draft.wentWell, draft.didntGoWell, draft.tomorrow]
    .some(value => value.trim().length > 0) ||
    draft.musicLinks.some(link => link.trim().length > 0);
}

export function hasMeaningfulJournalEntry(entry: JournalContentEntry): boolean {
  const hasMood = typeof entry.mood === 'string' && entry.mood.trim().length > 0;
  const hasPhoto =
    (typeof entry.image === 'string' && entry.image.trim().length > 0) ||
    (Array.isArray(entry.photoAssetIds) && entry.photoAssetIds.length > 0);

  return hasMood || hasMeaningfulJournalContent(decodeJournalContent(entry.content)) || hasPhoto;
}

/**
 * Derives the single presentation boundary shared by Journal views. The URL
 * normalizer is injected so this content module remains pure and testable.
 */
export function deriveJournalPresentation(
  entry: JournalContentEntry,
  normalizeLink: (value: string) => string | null,
): JournalPresentationState {
  const content = decodeJournalContent(entry.content);
  const rawMusicLinks = content.musicLinks
    .filter(link => typeof link === 'string')
    .map(link => link.trim())
    .filter(Boolean);
  const usableMusicLinks = rawMusicLinks
    .map(link => normalizeLink(link))
    .filter((link): link is string => Boolean(link));
  const hasMemory =
    (Array.isArray(entry.photoAssetIds) && entry.photoAssetIds.some(
      assetId => typeof assetId === 'string' && assetId.trim().length > 0,
    )) ||
    (typeof entry.image === 'string' && Boolean(normalizeLink(entry.image.trim())));

  return {
    content,
    mood: getStoredJournalMood(typeof entry.mood === 'string' ? entry.mood : null),
    hasReflection: [content.mattered, content.wentWell, content.didntGoWell, content.tomorrow]
      .some(value => value.trim().length > 0),
    hasMemory,
    hasMusic: usableMusicLinks.length > 0,
    usableMusicLinks,
    rawMusicLinks,
  };
}

/** Returns the first useful reflection line for compact Journal previews. */
export function getJournalPreview(
  draft: JournalContentDraft,
  maxLength = 140,
): string {
  const preview = [draft.mattered, draft.wentWell, draft.didntGoWell, draft.tomorrow]
    .map(value => value.replace(/\s+/g, ' ').trim())
    .find(Boolean) || '';

  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
