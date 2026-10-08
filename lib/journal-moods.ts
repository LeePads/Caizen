import type { MoodType } from './types';

export const JOURNAL_MOODS: ReadonlyArray<{
  value: MoodType;
  label: string;
  style: string;
  color: string;
}> = [
  { value: 'rough', label: 'Rough', style: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20', color: '#f87171' },
  { value: 'okay', label: 'Okay', style: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20', color: '#94a3b8' },
  { value: 'good', label: 'Good', style: 'bg-green-500/10 text-green-600 dark:text-green-300 border-green-500/20', color: '#4ade80' },
];

/** Keeps legacy stored mood names readable without rewriting user data. */
export function normalizeJournalMood(value?: string | null): MoodType {
  switch ((value || '').toLowerCase()) {
    case 'bad': case 'sad': case 'stressed': case 'rough': return 'rough';
    case 'great': case 'good': case 'happy': case 'excited': return 'good';
    default: return 'okay';
  }
}

/**
 * Reads a saved mood for presentation without inventing one for legacy rows
 * that never contained a mood. The broader normalizer above remains intact
 * for editor compatibility.
 */
export function getStoredJournalMood(value?: string | null): MoodType | null {
  switch ((value || '').trim().toLowerCase()) {
    case 'bad':
    case 'sad':
    case 'stressed':
    case 'rough':
      return 'rough';
    case 'neutral':
    case 'okay':
    case 'ok':
      return 'okay';
    case 'great':
    case 'good':
    case 'happy':
    case 'excited':
      return 'good';
    default:
      return null;
  }
}

export function journalMoodLabel(value?: string | null) {
  const mood = normalizeJournalMood(value);
  return JOURNAL_MOODS.find((item) => item.value === mood)?.label ?? 'Okay';
}

