import { parseLocalDateValue } from '../date-utils';
import { normalizeExternalWebUrl } from '../native/open-link';
import { detectMusicProvider } from '../music-links';
import type {
  Game,
  GameGenre,
  GameGuide,
  GameGuideCategory,
  GameGuideItem,
  GameGuideResource,
  GameGuideSection,
  GamePlatform,
  GameStatus,
  MusicItem,
  MusicPlayEvent,
  MusicMood,
} from '../types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
};

function normalizedStringList(value: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
  )).slice(0, max);
  return values.length ? values : undefined;
}

const booleanValue = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};

export function finiteCatalogNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function optionalFiniteCatalogNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = finiteCatalogNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : undefined;
}

/** Field-specific numeric rules for the Entertainment catalog metadata. */
export function normalizeEntertainmentMetadata(input: UnknownRecord) {
  const optionalNonNegative = (value: unknown, minimum = 0) => {
    const number = optionalFiniteCatalogNumber(value);
    return number === undefined ? undefined : Math.max(minimum, number);
  };
  const ratingValue = optionalFiniteCatalogNumber(input.rating);
  return {
    currentSeason: optionalNonNegative(input.currentSeason, 1),
    rating: ratingValue === undefined ? undefined : Math.max(0, Math.min(10, ratingValue)),
    totalSeasons: optionalNonNegative(input.totalSeasons),
    availableUnits: optionalNonNegative(input.availableUnits),
    acknowledgedAvailableUnits: optionalNonNegative(input.acknowledgedAvailableUnits),
    newUnitsAvailable: optionalNonNegative(input.newUnitsAvailable) || 0,
    nextEpisodeNumber: optionalNonNegative(input.nextEpisodeNumber, 1),
    runtimeMinutes: optionalNonNegative(input.runtimeMinutes),
  };
}

const normalizeDate = (value: unknown, fallback: Date | null = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const date = parseLocalDateValue(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : null,
  );
  return date || fallback;
};

/** Keep uploaded local images, but route every remote image through the HTTPS boundary. */
export function normalizeCatalogImageSource(value: unknown): string | undefined {
  const input = cleanString(value);
  if (!input) return undefined;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(input)) return input;
  return normalizeExternalWebUrl(input) || undefined;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableId(prefix: string, value: UnknownRecord, index: number) {
  let seed = '';
  try {
    seed = JSON.stringify([
      value.title,
      value.name,
      value.url,
      value.website,
      value.gameId,
      value.category,
      value.type,
      value.createdAt,
      index,
    ]);
  } catch {
    seed = `${prefix}:${index}`;
  }
  return `${prefix}-${stableHash(seed)}`;
}

function recordId(value: UnknownRecord, prefix: string, index: number) {
  return cleanString(value.id) || stableId(prefix, value, index);
}

function uniqueId(id: string, used: Set<string>) {
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  let suffix = 2;
  let candidate = `${id}~${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${id}~${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

const GAME_STATUSES: GameStatus[] = [
  'playing', 'active', 'backlog', 'dropped', 'completed', 'paused', 'upcoming', 'wishlist',
];
const GAME_PLATFORMS: GamePlatform[] = ['pc', 'mobile', 'console'];
const GAME_GENRES: GameGenre[] = [
  'action', 'adventure', 'building/simulation', 'chill', 'fps', 'gacha', 'puzzle',
  'racing', 'rpg', 'strategy', 'other',
];
const GUIDE_CATEGORIES: GameGuideCategory[] = [
  'build', 'team_lineup', 'farming', 'boss_raid', 'progression', 'tips', 'checklist',
  'other', 'builds', 'lineups', 'strategy', 'settings', 'walkthrough', 'general',
];
const GUIDE_KINDS = ['checklist', 'note', 'resource'] as const;
const GUIDE_RESOURCE_TYPES = ['uploaded-image', 'image-url', 'link'] as const;
const MUSIC_MOODS: MusicMood[] = ['focus', 'chill', 'hype', 'sad', 'romance', 'sleep', 'workout', 'any'];

function normalizeMetric(value: unknown, index: number) {
  const record = asRecord(value);
  const label = cleanString(record.label);
  const metricValue = cleanString(record.value);
  if (!label || !metricValue) return null;
  const baseId = cleanString(record.id) || stableId('metric', record, index);
  return {
    ...record,
    id: baseId,
    label,
    value: metricValue,
    showOnCard: booleanValue(record.showOnCard),
  };
}

export function normalizeGameRecord(input: unknown, now = new Date(), index = 0): Game {
  const value = asRecord(input);
  const metrics = Array.isArray(value.customMetrics)
    ? value.customMetrics.map(normalizeMetric).filter(Boolean)
    : undefined;
  const hoursPlayed = Math.max(0, finiteCatalogNumber(value.hoursPlayed, 0));
  const accountLevel = optionalFiniteCatalogNumber(value.accountLevel);
  const totalPower = optionalFiniteCatalogNumber(value.totalPower);
  const charactersUnlocked = optionalFiniteCatalogNumber(value.charactersUnlocked);
  const releaseDate = normalizeDate(value.releaseDate ?? value.released ?? value.release_date);
  const rawgId = cleanString(value.rawgId);
  return {
    ...value,
    id: recordId(value, 'game', index),
    title: cleanString(value.title) || 'Untitled game',
    platform: GAME_PLATFORMS.includes(value.platform as GamePlatform) ? value.platform as GamePlatform : 'pc',
    genre: GAME_GENRES.includes(value.genre as GameGenre) ? value.genre as GameGenre : 'other',
    hoursPlayed,
    status: GAME_STATUSES.includes(value.status as GameStatus) ? value.status as GameStatus : 'backlog',
    image: normalizeCatalogImageSource(value.image),
    website: normalizeExternalWebUrl(cleanString(value.website)) || undefined,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    rawgId: rawgId && /^\d{1,20}$/.test(rawgId) ? rawgId : undefined,
    releaseDate: releaseDate || undefined,
    providerPlatforms: normalizedStringList(value.providerPlatforms),
    favorite: booleanValue(value.favorite),
    hidden: booleanValue(value.hidden),
    accountLevel: accountLevel === undefined ? undefined : Math.max(0, accountLevel),
    totalPower: totalPower === undefined ? undefined : Math.max(0, totalPower),
    accountRank: cleanString(value.accountRank),
    charactersUnlocked: charactersUnlocked === undefined ? undefined : Math.max(0, charactersUnlocked),
    playingSince: normalizeDate(value.playingSince),
    cardMetric: cleanString(value.cardMetric),
    customMetrics: metrics,
    createdAt: normalizeDate(value.createdAt, new Date(now)) || new Date(now),
  } as Game;
}

function normalizeResource(value: unknown, sectionIndex: number, itemIndex: number, resourceIndex: number): GameGuideResource | null {
  const record = asRecord(value);
  const type = GUIDE_RESOURCE_TYPES.includes(record.type as typeof GUIDE_RESOURCE_TYPES[number])
    ? record.type as GameGuideResource['type']
    : 'link';
  const rawValue = cleanString(record.value);
  if (!rawValue) return null;
  const normalizedValue = type === 'uploaded-image'
    ? normalizeCatalogImageSource(rawValue)
    : normalizeExternalWebUrl(rawValue);
  if (!normalizedValue) return null;
  return {
    ...record,
    id: cleanString(record.id) || stableId('guide-resource', { ...record, value: normalizedValue }, sectionIndex + itemIndex + resourceIndex),
    type,
    label: cleanString(record.label),
    value: normalizedValue,
  } as GameGuideResource;
}

function normalizeGuideItem(value: unknown, sectionIndex: number, itemIndex: number): GameGuideItem {
  const record = asRecord(value);
  const kind = GUIDE_KINDS.includes(record.kind as typeof GUIDE_KINDS[number])
    ? record.kind
    : undefined;
  const resources = Array.isArray(record.resources)
    ? record.resources
      .map((resource, resourceIndex) => normalizeResource(resource, sectionIndex, itemIndex, resourceIndex))
      .filter((resource): resource is GameGuideResource => Boolean(resource))
    : [];
  return {
    ...record,
    id: cleanString(record.id) || stableId('guide-item', record, sectionIndex + itemIndex),
    title: cleanString(record.title) || 'Untitled guide item',
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    completed: booleanValue(record.completed),
    resources,
    ...(kind ? { kind } : {}),
  } as GameGuideItem;
}

function normalizeSection(value: unknown, sectionIndex: number): GameGuideSection {
  const record = asRecord(value);
  const items = Array.isArray(record.items)
    ? record.items.map((item, itemIndex) => normalizeGuideItem(item, sectionIndex, itemIndex))
    : [];
  return {
    ...record,
    id: cleanString(record.id) || stableId('guide-section', record, sectionIndex),
    title: cleanString(record.title) || 'Guide section',
    items,
  };
}

export function normalizeGameGuideRecord(input: unknown, now = new Date(), index = 0): GameGuide {
  const value = asRecord(input);
  return {
    ...value,
    id: recordId(value, 'game-guide', index),
    title: cleanString(value.title) || 'Untitled guide',
    description: typeof value.description === 'string' ? value.description : undefined,
    image: normalizeCatalogImageSource(value.image),
    gameId: cleanString(value.gameId),
    category: GUIDE_CATEGORIES.includes(value.category as GameGuideCategory)
      ? value.category as GameGuideCategory
      : 'other',
    favorite: booleanValue(value.favorite),
    hidden: booleanValue(value.hidden),
    sections: Array.isArray(value.sections)
      ? value.sections.map((section, sectionIndex) => normalizeSection(section, sectionIndex))
      : [],
    createdAt: normalizeDate(value.createdAt, new Date(now)) || new Date(now),
  } as GameGuide;
}

function normalizeMusicPlayHistory(value: unknown): MusicPlayEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map(event => {
      const record = asRecord(event);
      const playedAt = normalizeDate(record.playedAt);
      return playedAt ? { playedAt } : null;
    })
    .filter((event): event is MusicPlayEvent => Boolean(event));
}

export function normalizeMusicRecord(input: unknown, now = new Date(), index = 0): MusicItem {
  const value = asRecord(input);
  const url = normalizeExternalWebUrl(cleanString(value.url)) || '';
  const playlists = Array.isArray(value.playlists)
    ? Array.from(new Set(value.playlists.map(cleanString).filter((item): item is string => Boolean(item))))
    : [];
  const playCount = optionalFiniteCatalogNumber(value.playCount);
  const playHistory = normalizeMusicPlayHistory(value.playHistory);
  const type = value.type === 'playlist' ? 'playlist' : 'song';
  const mood = MUSIC_MOODS.includes(value.mood as MusicMood) ? value.mood as MusicMood : undefined;
  return {
    ...value,
    id: recordId(value, 'music', index),
    type,
    title: cleanString(value.title) || 'Untitled track',
    artist: cleanString(value.artist),
    playlist: cleanString(value.playlist),
    playlists,
    playlistCover: normalizeCatalogImageSource(value.playlistCover),
    lastPlayedAt: normalizeDate(value.lastPlayedAt),
    playCount: playCount === undefined ? 0 : Math.max(0, Math.floor(playCount)),
    ...(playHistory ? { playHistory } : {}),
    provider: value.provider === 'youtube' || value.provider === 'spotify' || value.provider === 'link'
      ? value.provider
      : detectMusicProvider(url),
    url,
    image: normalizeCatalogImageSource(value.image),
    genre: cleanString(value.genre),
    pinned: booleanValue(value.pinned),
    mood,
    favorite: booleanValue(value.favorite),
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    lyrics: typeof value.lyrics === 'string' ? value.lyrics : undefined,
    lyricsUrl: normalizeExternalWebUrl(cleanString(value.lyricsUrl)) || undefined,
    createdAt: normalizeDate(value.createdAt, new Date(now)) || new Date(now),
  } as MusicItem;
}

function normalizeRecords<T>(items: unknown, normalizer: (value: unknown, now: Date, index: number) => T, prefix: string, now = new Date()): T[] {
  const used = new Set<string>();
  return (Array.isArray(items) ? items : []).map((value, index) => {
    const normalized = normalizer(value, now, index) as T & { id: string };
    const id = uniqueId(normalized.id || `${prefix}-${index}`, used);
    return { ...normalized, id };
  });
}

export const normalizeGames = (items: unknown, now = new Date()) =>
  normalizeRecords(items, normalizeGameRecord, 'game', now) as Game[];

export const normalizeGameGuides = (items: unknown, now = new Date()) =>
  normalizeRecords(items, normalizeGameGuideRecord, 'game-guide', now) as GameGuide[];

export const normalizeMusicItems = (items: unknown, now = new Date()) =>
  normalizeRecords(items, normalizeMusicRecord, 'music', now) as MusicItem[];

export function normalizeCatalogProfile<T extends UnknownRecord>(profile: T, now = new Date()): T {
  return {
    ...profile,
    games: normalizeGames(profile.games, now),
    gameGuides: normalizeGameGuides(profile.gameGuides, now),
    musicItems: normalizeMusicItems(profile.musicItems, now),
  } as T;
}

export function catalogDuplicateIds(value: unknown, collection: string): string[] {
  const profile = asRecord(value);
  const records = Array.isArray(profile[collection]) ? profile[collection] : [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  records.forEach(record => {
    const id = cleanString(asRecord(record).id);
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}
