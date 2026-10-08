import type { Profile } from './types';
import { toLocalDateKey } from './date-utils';

export type GlobalSearchResult = {
  id: string;
  recordId: string;
  section: string;
  feature: string;
  recordType: string;
  title: string;
  description: string;
  /** User-facing metadata used for matching; private bodies are excluded. */
  keywords: string;
};

type SearchCandidate = GlobalSearchResult & { order: number };

const text = (...values: unknown[]) =>
  values
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .map(value => String(value))
    .join(' ')
    .trim();

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (value: string) => normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const record = (
  section: string,
  recordType: string,
  item: Record<string, unknown>,
  title: string,
  description: string,
  feature: string,
  secondary = '',
): GlobalSearchResult | null => {
  const recordId = typeof item.id === 'string' ? item.id : '';
  const cleanTitle = title.trim();
  if (!recordId || !cleanTitle) return null;
  return {
    id: `${section}:${recordId}`,
    recordId,
    section,
    feature,
    recordType,
    title: cleanTitle,
    description,
    keywords: text(cleanTitle, description, secondary),
  };
};

function scoreResult(result: GlobalSearchResult, query: string): number {
  const needle = normalize(query);
  const title = normalize(result.title);
  const description = normalize(result.description);
  const queryTokens = tokens(needle);
  const titleTokens = tokens(result.title);
  const descriptionTokens = tokens(result.description);
  let score = 0;

  // Exact and prefix title matches are deliberately much stronger than
  // incidental metadata matches. This keeps a named record discoverable even
  // when many records share a category or status.
  if (title === needle) score += 10_000;
  else if (title.startsWith(needle)) score += 7_000;
  else if (title.includes(needle)) score += 5_000;

  for (const token of queryTokens) {
    if (titleTokens.includes(token)) score += 2_000;
    else if (titleTokens.some(value => value.startsWith(token))) score += 1_200;
    else if (titleTokens.some(value => value.includes(token))) score += 500;

    if (descriptionTokens.includes(token)) score += 250;
    else if (descriptionTokens.some(value => value.startsWith(token))) score += 150;
  }

  if (description.includes(needle)) score += 600;
  if (normalize(result.recordType).includes(needle)) score += 50;

  return score;
}

function addCandidate(
  results: SearchCandidate[],
  value: GlobalSearchResult | null,
  query: string,
) {
  if (!value) return;
  if (!normalize(value.keywords).includes(normalize(query))) {
    const queryTokens = tokens(query);
    const haystack = normalize(value.keywords);
    if (!queryTokens.every(token => haystack.includes(token))) return;
  }
  results.push({ ...value, order: results.length });
}

/**
 * Searches local, user-facing metadata in the current profile. Journal, Work,
 * and Vault bodies/notes are intentionally excluded from this global index.
 * Results are ranked deterministically without a fuzzy-search dependency.
 */
export function searchProfileRecords(
  profile: Profile | undefined,
  query: string,
  limit = 12,
): GlobalSearchResult[] {
  if (!profile) return [];
  const needle = normalize(query);
  if (!needle) return [];

  const results: SearchCandidate[] = [];
  const add = (
    section: string,
    recordType: string,
    item: Record<string, unknown>,
    title: string,
    description: string,
    feature: string,
    secondary?: string,
  ) => addCandidate(results, record(section, recordType, item, title, description, feature, secondary), needle);

  for (const item of profile.productivityItems || []) {
    add('lifehub', 'productivity', item as unknown as Record<string, unknown>, String(item.title || 'Untitled task'), `${item.type === 'idea' ? 'Idea' : 'Task'} · ${item.status || 'pending'}`, 'tasks', String(item.priority || ''));
  }
  for (const item of profile.dailyChecklistItems || []) {
    add('lifehub', 'routine', item as unknown as Record<string, unknown>, String(item.title || 'Untitled routine'), 'Routine', 'routine', String(item.frequency || ''));
  }
  for (const item of profile.importantDates || []) {
    add('lifehub', 'important-date', item as unknown as Record<string, unknown>, String(item.title || 'Untitled date'), `Important date · ${item.type || 'event'}`, 'dates', String(item.status || ''));
  }
  for (const item of profile.workItems || []) {
    const value = item as unknown as Record<string, unknown>;
    add('workhub', 'work-item', value, String(value.title || value.name || 'Untitled work item'), `Work · ${value.status || value.type || 'item'}`, 'work-item', text(value.type, value.noteType, value.fileType, value.projectId));
  }
  for (const item of profile.inventoryItems || []) {
    add('inventory', 'inventory-item', item as unknown as Record<string, unknown>, item.name, `Inventory · ${item.category || 'item'}`, 'inventory-item', text(item.status, item.storageLocation));
  }
  for (const item of profile.wishlistItems || []) {
    const value = item as unknown as Record<string, unknown>;
    add('balance', 'wishlist-item', value, String(value.name || value.title || 'Untitled plan'), `Purchase plans · ${value.category || 'item'}`, 'plan-item', text(value.priority, value.destinationType, value.type));
  }
  for (const item of profile.journalEntries || []) {
    const value = item as unknown as Record<string, unknown>;
    add('lifehub', 'journal-entry', value, String(value.title || 'Journal entry'), 'Life Hub · Journal', 'journal-entry', text(value.date));
  }
  for (const item of profile.games || []) {
    const value = item as unknown as Record<string, unknown>;
    add('entertainment', 'game', value, String(value.title || value.name || 'Untitled game'), `Entertainment · Games · ${value.status || 'library'}`, 'game', text(value.platform, value.genre));
  }
  for (const item of profile.gameGuides || []) {
    const value = item as unknown as Record<string, unknown>;
    add('entertainment', 'game-guide', value, String(value.title || 'Untitled guide'), `Entertainment · Games · Guides · ${value.category || 'guide'}`, 'game-guide', String(value.description || value.gameId || ''));
  }
  for (const item of profile.mediaItems || []) {
    const value = item as unknown as Record<string, unknown>;
    add('entertainment', 'media-item', value, String(value.title || value.name || 'Untitled media'), `Entertainment · ${value.type || 'library'}`, 'media-item', text(value.status, value.year, value.genre));
  }
  for (const item of profile.books || []) {
    add('entertainment', 'book', item as unknown as Record<string, unknown>, item.title, `Entertainment · Books · ${item.authors.join(', ') || 'Author unknown'}`, 'book', text(item.isbn, item.isbn13));
  }
  for (const item of profile.musicItems || []) {
    const value = item as unknown as Record<string, unknown>;
    add('music', 'music-item', value, String(value.title || value.name || 'Untitled track'), `Music · ${value.artist || value.album || 'library'}`, 'music-item', text(value.type, value.playlist, value.mood));
  }
  for (const item of profile.personalVaultItems || []) {
    const value = item as unknown as Record<string, unknown>;
    add('personalhub', 'personal-item', value, String(value.title || value.name || 'Private reference'), `Personal Vault · ${value.category || value.type || 'reference'}`, 'personal-item', text(value.subType, value.platform));
  }

  for (const item of profile.wallets || []) {
    add('balance', 'wallet', item as unknown as Record<string, unknown>, item.name, `Wallet · ${item.type || 'balance source'}`, 'wallet', String(item.purpose || ''));
  }
  for (const item of profile.upcomingMoneyItems || []) {
    add('balance', 'money-item', item as unknown as Record<string, unknown>, item.title, `One-time money · ${item.direction === 'incoming' ? 'to receive' : 'to pay'}`, 'money-item', text(item.category, item.person, item.status));
  }
  for (const item of profile.skincareProducts || []) {
    add('skincare', 'skincare-product', item as unknown as Record<string, unknown>, item.name, `Skincare · ${item.category || item.productType || 'product'}`, 'skincare-product', text(item.frequency, item.schedule, item.status));
  }
  for (const item of profile.supplements || []) {
    add('health', 'supplement', item as unknown as Record<string, unknown>, item.name, `Supplement · ${item.type || 'health'}`, 'supplement');
  }

  const health = profile.health;
  for (const item of health?.weightEntries || []) {
    add('health', 'weight-entry', item as unknown as Record<string, unknown>, 'Weight entry', `Weight · ${toLocalDateKey(item.date)}`, 'weight-entry');
  }
  for (const item of health?.foodEntries || []) {
    add('health', 'food-entry', item as unknown as Record<string, unknown>, item.name, `Food · ${item.mealType} · ${toLocalDateKey(item.date)}`, 'food-entry');
  }
  for (const item of health?.activityEntries || []) {
    add('health', 'activity-entry', item as unknown as Record<string, unknown>, item.activity, `Workout · ${toLocalDateKey(item.date)}`, 'activity-entry');
  }
  for (const item of health?.workoutPlans || []) {
    add('health', 'workout-plan', item as unknown as Record<string, unknown>, item.name, 'Workout plan', 'workout-plan');
  }
  for (const item of health?.workoutExercises || []) {
    if (item.source !== 'custom') continue;
    add('health', 'workout-exercise', item as unknown as Record<string, unknown>, item.name, `Workout exercise · ${item.kind}`, 'workout-exercise', text(item.category, item.equipment, item.targetMode));
  }
  for (const item of health?.workoutRoutines || []) {
    if (item.source !== 'custom') continue;
    add('health', 'workout-routine', item as unknown as Record<string, unknown>, item.name, 'Workout routine', 'workout-routine', text(item.description, item.items.length, item.rounds));
  }
  for (const item of health?.workoutSessions || []) {
    add('health', 'workout-session', item as unknown as Record<string, unknown>, item.routineName, `Workout session · ${item.status}`, 'workout-session', text(item.startedAt, item.completedExerciseCount, item.totalExerciseCount));
  }
  for (const item of health?.sleepEntries || []) {
    add('health', 'sleep-entry', item as unknown as Record<string, unknown>, 'Sleep entry', `Sleep · ${toLocalDateKey(item.date)}`, 'sleep-entry');
  }
  for (const item of health?.foodTemplates || []) {
    add('health', 'food-template', item as unknown as Record<string, unknown>, item.name, 'Saved food · Health', 'food-template');
  }
  for (const item of health?.mealTemplates || []) {
    add('health', 'meal-template', item as unknown as Record<string, unknown>, item.name, `Meal template · ${item.mealType}`, 'meal-template', String(item.rows?.length || ''));
  }

  return results
    .sort((a, b) => scoreResult(b, needle) - scoreResult(a, needle) || a.order - b.order)
    .slice(0, Math.max(1, limit))
    .map(result => {
      const { order, ...withoutOrder } = result;
      void order;
      return withoutOrder;
    });
}

function containsId(items: unknown, id: string) {
  return Array.isArray(items) && items.some(item => Boolean(item && typeof item === 'object' && 'id' in item && item.id === id));
}

/** Confirms that a result still belongs to the active profile before opening it. */
export function isGlobalSearchResultAvailable(profile: Profile | undefined, result: GlobalSearchResult) {
  if (!profile) return false;
  switch (result.recordType) {
    case 'productivity': return containsId(profile.productivityItems, result.recordId);
    case 'routine': return containsId(profile.dailyChecklistItems, result.recordId);
    case 'important-date': return containsId(profile.importantDates, result.recordId);
    case 'work-item': return containsId(profile.workItems, result.recordId);
    case 'inventory-item': return containsId(profile.inventoryItems, result.recordId);
    case 'wishlist-item': return containsId(profile.wishlistItems, result.recordId);
    case 'journal-entry': return containsId(profile.journalEntries, result.recordId);
    case 'game': return containsId(profile.games, result.recordId);
    case 'game-guide': return containsId(profile.gameGuides, result.recordId);
    case 'media-item': return containsId(profile.mediaItems, result.recordId);
    case 'book': return containsId(profile.books, result.recordId);
    case 'music-item': return containsId(profile.musicItems, result.recordId);
    case 'personal-item': return containsId(profile.personalVaultItems, result.recordId);
    case 'wallet': return containsId(profile.wallets, result.recordId);
    case 'money-item': return containsId(profile.upcomingMoneyItems, result.recordId);
    case 'skincare-product': return containsId(profile.skincareProducts, result.recordId);
    case 'supplement': return containsId(profile.supplements, result.recordId);
    case 'weight-entry': return containsId(profile.health?.weightEntries, result.recordId);
    case 'food-entry': return containsId(profile.health?.foodEntries, result.recordId);
    case 'activity-entry': return containsId(profile.health?.activityEntries, result.recordId);
    case 'workout-plan': return containsId(profile.health?.workoutPlans, result.recordId);
    case 'workout-exercise': return containsId(profile.health?.workoutExercises, result.recordId);
    case 'workout-routine': return containsId(profile.health?.workoutRoutines, result.recordId);
    case 'workout-session': return containsId(profile.health?.workoutSessions, result.recordId);
    case 'sleep-entry': return containsId(profile.health?.sleepEntries, result.recordId);
    case 'food-template': return containsId(profile.health?.foodTemplates, result.recordId);
    case 'meal-template': return containsId(profile.health?.mealTemplates, result.recordId);
    default: return false;
  }
}
