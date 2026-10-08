import type {
  DailyChecklistItem,
  LifeHubLinkedContext,
  ProductivityItem,
} from '@/lib/types';

type LinkableLifeHubRecord = {
  linkedContext?: unknown;
  linkedGameId?: unknown;
  linkedSection?: unknown;
  linkedView?: unknown;
  linkedEntityType?: unknown;
  linkedEntityId?: unknown;
  healthRoutineEvidence?: DailyChecklistItem['healthRoutineEvidence'];
  linkOrigin?: ProductivityItem['linkOrigin'];
  type?: string;
};

export type EffectiveLifeHubLink =
  | {
      kind: 'context';
      context: LifeHubLinkedContext;
      source: 'canonical' | 'legacy-game' | 'legacy-health';
    }
  | { kind: 'legacy-view'; section: string; view?: string }
  | { kind: 'none' };

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type GameIdSelector = string | ReadonlySet<string>;

function includesGameId(gameIds: GameIdSelector, gameId: string): boolean {
  return typeof gameIds === 'string' ? gameIds === gameId : gameIds.has(gameId);
}

/** Validation is aware of both the supported section and its allowed type. */
export function normalizeLifeHubLinkedContext(value: unknown): LifeHubLinkedContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { section?: unknown; type?: unknown; entityId?: unknown; entityIds?: unknown };
  const section = normalizedString(candidate.section);
  const type = normalizedString(candidate.type);
  if (!section || !type) return undefined;

  if (section === 'journal' && type === 'journal-entry') return { section, type };
  const rawIds = Array.isArray(candidate.entityIds)
    ? [...new Set(candidate.entityIds.map(normalizedString).filter((id): id is string => Boolean(id)))]
    : [];
  const primary = normalizedString(candidate.entityId) || rawIds[0];
  const orderedIds = primary
    ? [primary, ...rawIds.filter(id => id !== primary)]
    : [];
  const entityId = orderedIds[0];
  if (!entityId) return undefined;

  if (section === 'games' && type === 'game') return { section, type, entityId };
  if (section === 'entertainment' && (type === 'media-item' || type === 'book')) return { section, type, entityId };
  if (section === 'supplements' && type === 'supplement') {
    return orderedIds.length > 1 ? { section, type, entityId, entityIds: orderedIds } : { section, type, entityId };
  }
  if (section === 'skincare' && type === 'product') {
    // Legacy single-link compatibility: if (section === 'skincare' && type === 'product') return { section, type, entityId };
    return orderedIds.length > 1 ? { section, type, entityId, entityIds: orderedIds } : { section, type, entityId };
  }
  if (section === 'work' && type === 'work-item') return { section, type, entityId };
  if (section === 'health' && (type === 'workout-plan' || type === 'workout-routine')) {
    return { section, type, entityId };
  }
  if (section === 'balance' && type === 'upcoming-money') return { section, type, entityId };
  return undefined;
}

/** Matches one entity against a saved single or multi-target link snapshot. */
export function linkedContextIncludesEntity(
  value: unknown,
  section: LifeHubLinkedContext['section'],
  type: string,
  entityId: string,
): boolean {
  const context = normalizeLifeHubLinkedContext(value);
  if (!context || context.section !== section || context.type !== type || !('entityId' in context)) return false;
  return context.entityId === entityId || ('entityIds' in context && Boolean(context.entityIds?.includes(entityId)));
}

export function routineCurrentlyLinkedToEntity(
  item: DailyChecklistItem,
  section: LifeHubLinkedContext['section'],
  type: string,
  entityId: string,
): boolean {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && linkedContextIncludesEntity(link.context, section, type, entityId);
}

export function routineHistoryIncludesEntity(
  item: DailyChecklistItem,
  section: LifeHubLinkedContext['section'],
  type: string,
  entityId: string,
): boolean {
  return (item.completionHistory || []).some(entry =>
    linkedContextIncludesEntity(entry.linkedContext, section, type, entityId),
  );
}

export function getGameIdFromLinkedContext(value: unknown): string | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  return context?.section === 'games' && context.type === 'game' ? context.entityId : undefined;
}

export function getSupplementIdFromLinkedContext(value: unknown): string | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  return context?.section === 'supplements' && context.type === 'supplement' ? context.entityId : undefined;
}

export function getSupplementIdsFromLinkedContext(value: unknown): string[] {
  const context = normalizeLifeHubLinkedContext(value);
  if (context?.section !== 'supplements' || context.type !== 'supplement') return [];
  return 'entityIds' in context && context.entityIds ? [...context.entityIds] : [context.entityId];
}

export function removeSupplementIdFromLinkedContext(value: unknown, supplementId: string): LifeHubLinkedContext | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  if (context?.section !== 'supplements' || context.type !== 'supplement') return context;
  const ids = getSupplementIdsFromLinkedContext(context).filter(id => id !== supplementId);
  return ids.length ? { section: 'supplements', type: 'supplement', entityId: ids[0], ...(ids.length > 1 ? { entityIds: ids } : {}) } : undefined;
}

export function getWorkItemIdFromLinkedContext(value: unknown): string | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  return context?.section === 'work' && context.type === 'work-item' ? context.entityId : undefined;
}

export type HealthLinkedTarget = Extract<LifeHubLinkedContext, { section: 'health' }>;

export function getHealthTargetFromLinkedContext(value: unknown): HealthLinkedTarget | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  return context?.section === 'health' ? context : undefined;
}

export function getGameIdFromLifeHubRecord(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'games' && link.context.type === 'game'
    ? link.context.entityId
    : undefined;
}

export function getSupplementIdFromLifeHubRecord(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'supplements' && link.context.type === 'supplement'
    ? link.context.entityId
    : undefined;
}

export function getWorkItemIdFromLifeHubRecord(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'work' && link.context.type === 'work-item'
    ? link.context.entityId
    : undefined;
}

export function getHealthTargetFromLifeHubRecord(item: LinkableLifeHubRecord): HealthLinkedTarget | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'health'
    ? link.context
    : undefined;
}

export function getSkincareProductIdFromLifeHubRecord(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'skincare' && link.context.type === 'product'
    ? link.context.entityId
    : undefined;
}

export function getSkincareProductIdsFromLinkedContext(value: unknown): string[] {
  const context = normalizeLifeHubLinkedContext(value);
  if (context?.section !== 'skincare' || context.type !== 'product') return [];
  return 'entityIds' in context && context.entityIds ? [...context.entityIds] : [context.entityId];
}

export function removeSkincareProductIdFromLinkedContext(value: unknown, productId: string): LifeHubLinkedContext | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  if (context?.section !== 'skincare' || context.type !== 'product') return context;
  const ids = getSkincareProductIdsFromLinkedContext(context).filter(id => id !== productId);
  return ids.length ? { section: 'skincare', type: 'product', entityId: ids[0], ...(ids.length > 1 ? { entityIds: ids } : {}) } : undefined;
}

export function getSkincareProductIdsFromLifeHubRecord(item: LinkableLifeHubRecord): string[] {
  return getSkincareProductIdsFromLinkedContext(item.linkedContext);
}

export function getSupplementIdsFromLifeHubRecord(item: LinkableLifeHubRecord): string[] {
  return getSupplementIdsFromLinkedContext(item.linkedContext);
}

export function getUpcomingMoneyIdFromLinkedContext(value: unknown): string | undefined {
  const context = normalizeLifeHubLinkedContext(value);
  return context?.section === 'balance' && context.type === 'upcoming-money'
    ? context.entityId
    : undefined;
}

export function getUpcomingMoneyIdFromLifeHubRecord(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  return link.kind === 'context' && link.context.section === 'balance' && link.context.type === 'upcoming-money'
    ? link.context.entityId
    : undefined;
}

/** Canonical context wins; legacy aliases remain readable during migration. */
export function resolveEffectiveLinkedLifeHubLink(item: LinkableLifeHubRecord): EffectiveLifeHubLink {
  const canonical = normalizeLifeHubLinkedContext(item.linkedContext);
  if (canonical && (item.type === undefined || item.type === 'task')) {
    return { kind: 'context', context: canonical, source: 'canonical' };
  }
  if (item.type !== undefined && item.type !== 'task') return { kind: 'none' };

  const legacyGameId = normalizedString(item.linkedGameId);
  if (legacyGameId) {
    return {
      kind: 'context',
      context: { section: 'games', type: 'game', entityId: legacyGameId },
      source: 'legacy-game',
    };
  }

  const healthEntityId = normalizedString(item.linkedEntityId);
  if (
    healthEntityId &&
    (item.linkedEntityType === 'workout-plan' || item.linkedEntityType === 'workout-routine')
  ) {
    return {
      kind: 'context',
      context: { section: 'health', type: item.linkedEntityType, entityId: healthEntityId },
      source: 'legacy-health',
    };
  }

  const section = normalizedString(item.linkedSection);
  return section
    ? { kind: 'legacy-view', section, view: normalizedString(item.linkedView) }
    : { kind: 'none' };
}

export function clearGameLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(item: T, gameIds: GameIdSelector): T {
  const canonicalGameId = getGameIdFromLinkedContext(item.linkedContext);
  const legacyGameId = normalizedString(item.linkedGameId);
  const clearCanonical = canonicalGameId ? includesGameId(gameIds, canonicalGameId) : false;
  const clearLegacy = legacyGameId ? includesGameId(gameIds, legacyGameId) : false;
  if (!clearCanonical && !clearLegacy) return item;

  return {
    ...item,
    ...(clearCanonical ? { linkedContext: undefined } : {}),
    ...(clearLegacy ? { linkedGameId: undefined } : {}),
  } as T;
}

export function clearGameLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  gameIds: GameIdSelector,
): DailyChecklistItem[] {
  return routines.map(item => clearGameLinkFromLifeHubRecord(item, gameIds));
}

export function clearGameLinksFromTasks(
  tasks: readonly ProductivityItem[],
  gameIds: GameIdSelector,
): ProductivityItem[] {
  return tasks.map(item => clearGameLinkFromLifeHubRecord(item, gameIds));
}

export function clearSupplementLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(item: T, supplementId: string): T {
  const context = normalizeLifeHubLinkedContext(item.linkedContext);
  if (!context || context.section !== 'supplements' || context.type !== 'supplement') return item;
  const ids = getSupplementIdsFromLinkedContext(context);
  if (!ids.includes(supplementId)) return item;
  return { ...item, linkedContext: removeSupplementIdFromLinkedContext(context, supplementId) } as T;
}

export function clearSupplementLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  supplementId: string,
): DailyChecklistItem[] {
  return routines.map(item => clearSupplementLinkFromLifeHubRecord(item, supplementId));
}

export function clearSupplementLinksFromTasks(
  tasks: readonly ProductivityItem[],
  supplementId: string,
): ProductivityItem[] {
  return tasks.map(item => clearSupplementLinkFromLifeHubRecord(item, supplementId));
}

export function getWorkItemIdsFromTrashData(value: unknown): string[] {
  const records = Array.isArray(value) ? value : [value];
  return records.reduce<string[]>((ids, record) => {
    if (!record || typeof record !== 'object') return ids;
    const id = normalizedString((record as { id?: unknown }).id);
    if (id) ids.push(id);
    return ids;
  }, []);
}

export function clearWorkLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(
  item: T,
  workItemIds: ReadonlySet<string>,
): T {
  const workItemId = getWorkItemIdFromLinkedContext(item.linkedContext);
  return workItemId && workItemIds.has(workItemId)
    ? { ...item, linkedContext: undefined, linkOrigin: undefined } as T
    : item;
}

export function clearWorkLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  workItemIds: ReadonlySet<string>,
): DailyChecklistItem[] {
  return routines.map(item => clearWorkLinkFromLifeHubRecord(item, workItemIds));
}

export function clearWorkLinksFromTasks(
  tasks: readonly ProductivityItem[],
  workItemIds: ReadonlySet<string>,
): ProductivityItem[] {
  return tasks.map(item => clearWorkLinkFromLifeHubRecord(item, workItemIds));
}

function healthTargetKey(type: HealthLinkedTarget['type'], entityId: string): string {
  return `${type}:${entityId}`;
}

export function healthLinkedTargetKey(target: Pick<HealthLinkedTarget, 'type' | 'entityId'>): string {
  return healthTargetKey(target.type, target.entityId);
}

export function clearHealthLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(
  item: T,
  targets: ReadonlySet<string>,
): T {
  const canonical = getHealthTargetFromLinkedContext(item.linkedContext);
  const legacyType = item.linkedEntityType === 'workout-plan' || item.linkedEntityType === 'workout-routine'
    ? item.linkedEntityType
    : undefined;
  const legacyId = normalizedString(item.linkedEntityId);
  const clearCanonical = Boolean(canonical && targets.has(healthTargetKey(canonical.type, canonical.entityId)));
  const clearLegacy = Boolean(legacyType && legacyId && targets.has(healthTargetKey(legacyType, legacyId)));
  if (!clearCanonical && !clearLegacy) return item;

  return {
    ...item,
    ...(clearCanonical ? { linkedContext: undefined } : {}),
    ...(clearLegacy ? { linkedEntityType: undefined, linkedEntityId: undefined } : {}),
  } as T;
}

export function clearHealthLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  targets: ReadonlySet<string>,
): DailyChecklistItem[] {
  return routines.map(item => clearHealthLinkFromLifeHubRecord(item, targets));
}

/** Clears Health links and the linked-workout-routine evidence that depends on a deleted custom routine. */
export function clearHealthLinksAndEvidenceFromRoutines(
  routines: readonly DailyChecklistItem[],
  targets: ReadonlySet<string>,
): DailyChecklistItem[] {
  return routines.map(item => {
    const cleared = clearHealthLinkFromLifeHubRecord(item, targets);
    const linkedTarget = getHealthTargetFromLifeHubRecord(item);
    const evidence = item.healthRoutineEvidence;
    const clearEvidence = Boolean(
      linkedTarget?.type === 'workout-routine' &&
      targets.has(healthTargetKey('workout-routine', linkedTarget.entityId)) &&
      evidence &&
      (evidence.mode === 'workout-completed' || evidence.mode === 'stretch-completed') &&
      evidence.scope === 'linked-workout-routine',
    );
    if (!clearEvidence) return cleared;
    return { ...cleared, healthRoutineEvidence: undefined };
  });
}

export function clearHealthLinksFromTasks(
  tasks: readonly ProductivityItem[],
  targets: ReadonlySet<string>,
): ProductivityItem[] {
  return tasks.map(item => clearHealthLinkFromLifeHubRecord(item, targets));
}

export function clearSkincareLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(item: T, productId: string): T {
  const context = normalizeLifeHubLinkedContext(item.linkedContext);
  if (!context || context.section !== 'skincare' || context.type !== 'product') return item;
  const original = getSkincareProductIdsFromLinkedContext(context);
  if (!original.includes(productId)) return item;
  return { ...item, linkedContext: removeSkincareProductIdFromLinkedContext(context, productId) } as T;
}

export function clearSkincareLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  productId: string,
): DailyChecklistItem[] {
  return routines.map(item => clearSkincareLinkFromLifeHubRecord(item, productId));
}

export function clearSkincareLinksFromTasks(
  tasks: readonly ProductivityItem[],
  productId: string,
): ProductivityItem[] {
  return tasks.map(item => clearSkincareLinkFromLifeHubRecord(item, productId));
}

export function clearUpcomingMoneyLinkFromLifeHubRecord<T extends LinkableLifeHubRecord>(item: T, itemId: string): T {
  return getUpcomingMoneyIdFromLinkedContext(item.linkedContext) === itemId
    ? { ...item, linkedContext: undefined } as T
    : item;
}

export function clearUpcomingMoneyLinksFromRoutines(
  routines: readonly DailyChecklistItem[],
  itemId: string,
): DailyChecklistItem[] {
  return routines.map(item => clearUpcomingMoneyLinkFromLifeHubRecord(item, itemId));
}

export function clearUpcomingMoneyLinksFromTasks(
  tasks: readonly ProductivityItem[],
  itemId: string,
): ProductivityItem[] {
  return tasks.map(item => clearUpcomingMoneyLinkFromLifeHubRecord(item, itemId));
}

export type LifeHubLinkedNavigationDetail = {
  section: string;
  feature: string;
  recordId?: string;
};

export function getLifeHubLinkedContextNavigationDetail(
  context: LifeHubLinkedContext,
): LifeHubLinkedNavigationDetail {
  if (context.section === 'journal' && context.type === 'journal-entry') {
    return { section: 'lifehub', feature: 'journal-entry' };
  }
  if (context.section === 'games' && context.type === 'game') {
    return { section: 'entertainment', feature: 'game', recordId: context.entityId };
  }
  if (context.section === 'entertainment' && context.type === 'media-item') {
    return { section: 'entertainment', feature: 'media-item', recordId: context.entityId };
  }
  if (context.section === 'entertainment' && context.type === 'book') {
    return { section: 'entertainment', feature: 'book', recordId: context.entityId };
  }
  if (context.section === 'supplements' && context.type === 'supplement') {
    return { section: 'health', feature: 'supplements', recordId: context.entityId };
  }
  if (context.section === 'work' && context.type === 'work-item') {
    return { section: 'workhub', feature: 'work-item', recordId: context.entityId };
  }
  if (context.section === 'balance' && context.type === 'upcoming-money') {
    return { section: 'balance', feature: 'money-item', recordId: context.entityId };
  }
  return { section: context.section, feature: context.type, recordId: context.entityId };
}

export function getLifeHubLinkedContextLabel(item: LinkableLifeHubRecord): string | undefined {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  if (link.kind === 'context') {
    switch (link.context.section) {
      case 'games': return 'Games';
      case 'entertainment': return link.context.type === 'book' ? 'Books' : 'Entertainment';
      case 'supplements': return 'Supplements';
      case 'skincare': return 'Skincare';
      case 'work': return 'Work';
      case 'health': return 'Health';
      case 'balance': return 'Balance';
      case 'journal': return 'Journal';
    }
  }
  if (link.kind !== 'legacy-view') return undefined;
  switch (link.section) {
    case 'workhub': return 'Work';
    case 'journal': return 'Journal';
    case 'health': return 'Health';
    case 'balance': return 'Balance';
    case 'skincare': return 'Skincare';
    case 'supplements': return 'Supplements';
    case 'games': return 'Games';
    default: return link.section.charAt(0).toUpperCase() + link.section.slice(1);
  }
}
