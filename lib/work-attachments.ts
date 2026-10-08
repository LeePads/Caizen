import type { WorkItem } from './types';
import { normalizeWorkCustomFieldValues } from './workhub/custom-fields';

export const WORK_ATTACHMENT_TYPES = new Set<WorkItem['type']>([
  'project',
  'task',
]);

export function supportsWorkAttachments(type: unknown): type is 'project' | 'task' {
  return type === 'project' || type === 'task';
}

export function normalizeWorkAttachmentIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const id = candidate.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}

/**
 * Normalizes the persisted Work attachment field without creating attachment
 * capability on notes, resources, or calendar-shaped records.
 */
export function normalizeWorkItemAttachments<T extends Record<string, unknown>>(
  item: T,
): T {
  const next = { ...item } as T & {
    type?: unknown;
    attachmentAssetIds?: unknown;
    workTypeId?: unknown;
    workCategoryId?: unknown;
    workCategoryLabel?: unknown;
    customFieldValues?: unknown;
  };
  const workTypeId = typeof next.workTypeId === 'string' ? next.workTypeId.trim() : '';
  if (workTypeId) next.workTypeId = workTypeId;
  else delete next.workTypeId;
  const workCategoryId = typeof next.workCategoryId === 'string' ? next.workCategoryId.trim() : '';
  if (workCategoryId) next.workCategoryId = workCategoryId;
  else delete next.workCategoryId;
  const workCategoryLabel = typeof next.workCategoryLabel === 'string' ? next.workCategoryLabel.trim().slice(0, 80) : '';
  if (workCategoryLabel) next.workCategoryLabel = workCategoryLabel;
  else delete next.workCategoryLabel;
  const customFieldValues = normalizeWorkCustomFieldValues(next.customFieldValues);
  if (customFieldValues) next.customFieldValues = customFieldValues;
  else delete next.customFieldValues;
  if (!supportsWorkAttachments(next.type)) {
    delete next.attachmentAssetIds;
    return next;
  }

  const ids = normalizeWorkAttachmentIds(next.attachmentAssetIds);
  if (ids) next.attachmentAssetIds = ids;
  else delete next.attachmentAssetIds;
  return next;
}

export function normalizeWorkItemForPersistence(item: WorkItem): WorkItem {
  return normalizeWorkItemAttachments(item as unknown as Record<string, unknown>) as unknown as WorkItem;
}
