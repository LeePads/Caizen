import type { Game, GameGenre, GamePlatform, GameStatus } from '@/lib/types';
import type { RawgGameResult } from '@/lib/games/rawg';
import { parseLocalDateInputOrUndefined } from '@/lib/date-utils';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

export const GAME_GENRES: GameGenre[] = ['action', 'adventure', 'building/simulation', 'chill', 'fps', 'gacha', 'puzzle', 'racing', 'rpg', 'strategy', 'other'];

const GAME_GENRE_LABELS: Record<GameGenre, string> = {
  action: 'Action',
  adventure: 'Adventure',
  'building/simulation': 'Building / Simulation',
  chill: 'Chill',
  fps: 'FPS',
  gacha: 'Gacha',
  puzzle: 'Puzzle',
  racing: 'Racing',
  rpg: 'RPG',
  strategy: 'Strategy',
  other: 'Other',
};

const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  playing: 'Playing',
  active: 'Playing',
  backlog: 'Backlog',
  dropped: 'Dropped',
  completed: 'Completed',
  paused: 'Paused',
  upcoming: 'In Wishlist',
  wishlist: 'In Wishlist',
};

const GAME_PLATFORM_LABELS: Record<GamePlatform, string> = {
  pc: 'PC',
  mobile: 'Mobile',
  console: 'Console',
};

export function gameGenreLabel(value?: GameGenre | string) {
  const normalized = value?.trim().toLowerCase();
  return (normalized && GAME_GENRE_LABELS[normalized as GameGenre]) || value?.trim() || 'Other';
}

export function gameStatusLabel(value?: GameStatus | string) {
  const normalized = value?.trim().toLowerCase();
  return (normalized && GAME_STATUS_LABELS[normalized as GameStatus]) || value?.trim() || 'Unknown';
}

export function gamePlatformLabel(value?: GamePlatform | string) {
  const normalized = value?.trim().toLowerCase();
  return (normalized && GAME_PLATFORM_LABELS[normalized as GamePlatform]) || value?.trim() || 'Unknown';
}

export function providerGenre(value?: string): GameGenre {
  const normalized = value?.trim().toLowerCase() || '';
  if (normalized.includes('role-playing')) return 'rpg';
  if (normalized.includes('simulation')) return 'building/simulation';
  if (normalized.includes('shooter')) return 'fps';
  return GAME_GENRES.find(genre => genre === normalized) || 'other';
}

export function catalogFields(result: RawgGameResult) {
  return {
    title: result.title,
    image: result.image || '',
    releaseDate: result.releaseDate || '',
    rawgId: result.rawgId,
    providerPlatforms: result.providerPlatforms || [],
    genre: providerGenre(result.genre),
  };
}

export function exactRawgGameMatch(games: Game[], result: RawgGameResult) {
  return result.rawgId ? games.find(game => game.rawgId === result.rawgId) : undefined;
}

export function rawgPlatformFromResult(result: RawgGameResult): GamePlatform {
  const labels = result.providerPlatforms.join(' ').toLocaleLowerCase();
  if (labels.includes('android') || labels.includes('ios') || labels.includes('mobile')) return 'mobile';
  if (labels.includes('playstation') || labels.includes('xbox') || labels.includes('nintendo') || labels.includes('switch')) return 'console';
  return 'pc';
}

export function possibleRawgGameMatch(games: Game[], result: RawgGameResult) {
  const title = result.title.trim().toLocaleLowerCase();
  const platform = rawgPlatformFromResult(result);
  return games.find(game => game.title.trim().toLocaleLowerCase() === title && game.platform === platform);
}

export function wishlistGameFields(
  result: RawgGameResult,
  platform: GamePlatform,
  genre: GameGenre,
  notes: string,
): Omit<Game, 'id' | 'createdAt'> {
  const website = normalizeExternalWebUrl(result.website || result.rawgUrl) || undefined;
  const image = normalizeCatalogImageSource(result.image);
  return {
    title: result.title.trim(),
    platform,
    genre,
    hoursPlayed: 0,
    status: 'wishlist',
    website,
    image,
    notes: notes.trim() || undefined,
    releaseDate: result.releaseDate ? parseLocalDateInputOrUndefined(result.releaseDate) : undefined,
    rawgId: result.rawgId.trim() || undefined,
    providerPlatforms: result.providerPlatforms.length ? result.providerPlatforms : undefined,
    favorite: false,
  };
}
