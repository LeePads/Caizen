import { describe, expect, it } from 'vitest';
import { normalizeProductivityItem, normalizeRoutineItem } from '@/lib/lifehub/normalization';
import { linkedContextIncludesEntity, normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';

describe('Life Hub link compatibility normalization', () => {
  it('preserves canonical Journal routines and valid managed Work mirrors', () => {
    expect(normalizeRoutineItem({
      id: 'journal-routine',
      title: 'Journal',
      frequency: 'daily',
      linkedContext: { section: 'journal', type: 'journal-entry' },
      createdAt: '2026-08-28',
    }).linkedContext).toEqual({ section: 'journal', type: 'journal-entry' });

    expect(normalizeProductivityItem({
      id: 'mirror',
      title: 'Work mirror',
      type: 'task',
      priority: 'normal',
      status: 'pending',
      linkedContext: { section: 'work', type: 'work-item', entityId: 'work-a' },
      linkOrigin: 'workhub-mirror',
      createdAt: '2026-08-28',
    }).linkOrigin).toBe('workhub-mirror');
  });

  it('drops a mirror marker without a valid Work task link', () => {
    expect(normalizeProductivityItem({
      id: 'invalid-mirror',
      title: 'Invalid',
      type: 'task',
      priority: 'normal',
      status: 'pending',
      linkOrigin: 'workhub-mirror',
      createdAt: '2026-08-28',
    }).linkOrigin).toBeUndefined();
  });

  it('normalizes Entertainment media and book targets as distinct manual links', () => {
    expect(normalizeLifeHubLinkedContext({ section: 'entertainment', type: 'media-item', entityId: 'media-1' }))
      .toEqual({ section: 'entertainment', type: 'media-item', entityId: 'media-1' });
    expect(normalizeLifeHubLinkedContext({ section: 'entertainment', type: 'book', entityId: 'book-1' }))
      .toEqual({ section: 'entertainment', type: 'book', entityId: 'book-1' });
    expect(normalizeLifeHubLinkedContext({ section: 'entertainment', type: 'game', entityId: 'game-1' })).toBeUndefined();
  });

  it('matches occurrence snapshots against each saved member of a multi-target link', () => {
    const snapshot = {
      section: 'supplements',
      type: 'supplement',
      entityId: 'supplement-a',
      entityIds: ['supplement-a', 'supplement-b'],
    };
    expect(linkedContextIncludesEntity(snapshot, 'supplements', 'supplement', 'supplement-a')).toBe(true);
    expect(linkedContextIncludesEntity(snapshot, 'supplements', 'supplement', 'supplement-b')).toBe(true);
    expect(linkedContextIncludesEntity(snapshot, 'supplements', 'supplement', 'supplement-c')).toBe(false);
    expect(linkedContextIncludesEntity(snapshot, 'skincare', 'product', 'supplement-a')).toBe(false);
  });
});
