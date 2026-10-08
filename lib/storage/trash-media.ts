import type { TrashItem, TrashSource } from '../types';
import { collectMediaReferenceIds } from './media-references';
import { queueMediaCleanup } from './media-cleanup';

export const COLLECTION_TRASH_SOURCES = new Set<TrashSource>([
  'inventoryItems',
  'skincareProducts',
  'wishlistItems',
  'careerCredentials',
  'mediaItems',
]);

export const isCollectionTrashSource = (
  source: unknown,
): source is 'inventoryItems' | 'skincareProducts' | 'wishlistItems' | 'careerCredentials' | 'mediaItems' =>
  COLLECTION_TRASH_SOURCES.has(source as TrashSource);

export const collectTrashMediaAssetIds = (item: Pick<TrashItem, 'data'>): string[] =>
  [...collectMediaReferenceIds(item.data)];

const deleteAfterTimestamp = (item: any): number | null => {
  const explicit = new Date(item?.deleteAfter);
  if (!Number.isNaN(explicit.getTime())) return explicit.getTime();

  const deletedAt = new Date(item?.deletedAt);
  if (Number.isNaN(deletedAt.getTime())) return null;
  if (item?.deleteAfter) return deletedAt.getTime();
  deletedAt.setDate(deletedAt.getDate() + 30);
  return deletedAt.getTime();
};

const isExpiredTrashItem = (item: any, nowMs: number) => {
  const deleteAfter = deleteAfterTimestamp(item);
  return deleteAfter !== null && deleteAfter <= nowMs;
};

export const collectExpiredTrashMediaAssetIds = (
  items: unknown,
  now = new Date(),
): string[] => {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(items)) return [];

  const assetIds = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !isCollectionTrashSource((item as any).source)) {
      continue;
    }
    if (!isExpiredTrashItem(item, nowMs)) {
      continue;
    }
    collectMediaReferenceIds((item as any).data, assetIds);
  }
  return [...assetIds];
};

export const hasExpiredCollectionTrash = (
  items: unknown,
  now = new Date(),
): boolean => {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(items)) return false;
  return items.some(item => {
    if (!item || typeof item !== 'object' || !isCollectionTrashSource((item as any).source)) {
      return false;
    }
    return isExpiredTrashItem(item, nowMs);
  });
};

export const removeExpiredTrashItems = (
  items: unknown,
  now = new Date(),
): TrashItem[] => {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(items)) return [];
  return items.filter(item => !isExpiredTrashItem(item, nowMs)) as TrashItem[];
};

export const queueTrashMediaCleanup = (
  profileId: string,
  item: Pick<TrashItem, 'data'>,
): void => {
  queueMediaCleanup({
    profileId,
    assetIds: collectTrashMediaAssetIds(item),
    reason: 'record-deleted',
  });
};

export const queueExpiredTrashMediaCleanup = (
  profileId: string,
  items: unknown,
  now = new Date(),
): void => {
  queueMediaCleanup({
    profileId,
    assetIds: collectExpiredTrashMediaAssetIds(items, now),
    reason: 'record-deleted',
  });
};
