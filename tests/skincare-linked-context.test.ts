import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import {
  clearSkincareLinksFromRoutines,
  clearSkincareLinksFromTasks,
  getLifeHubLinkedContextNavigationDetail,
  getSkincareProductIdFromLifeHubRecord,
  normalizeLifeHubLinkedContext,
} from '@/lib/lifehub/linked-context';

function routine(id: string, linkedContext?: DailyChecklistItem['linkedContext']): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    linkedContext,
    completionHistory: [{ date: '2026-08-27', status: 'done' }],
  };
}

function task(id: string, linkedContext?: ProductivityItem['linkedContext']): ProductivityItem {
  return {
    id,
    title: id,
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    linkedContext,
  };
}

describe('Skincare linked-context lifecycle', () => {
  it('accepts only the canonical Skincare product context', () => {
    expect(normalizeLifeHubLinkedContext({ section: 'skincare', type: 'product', entityId: 'deleted-product' })).toEqual({
      section: 'skincare',
      type: 'product',
      entityId: 'deleted-product',
    });
    expect(normalizeLifeHubLinkedContext({ section: 'skincare', type: 'supplement', entityId: 'product-a' })).toBeUndefined();

    const linkedContextSource = readFileSync('lib/lifehub/linked-context.ts', 'utf8');
    expect(linkedContextSource).toContain("if (section === 'skincare' && type === 'product') return { section, type, entityId };");
    expect(linkedContextSource).not.toContain('skincareProducts');
  });

  it('clears only matching canonical links while preserving Life Hub records and history', () => {
    const linked = { section: 'skincare' as const, type: 'product' as const, entityId: 'product-a' };
    const routines = [routine('linked', linked), routine('kept', { ...linked, entityId: 'product-b' })];
    const tasks = [task('task-linked', linked), task('task-kept', { ...linked, entityId: 'product-b' })];

    const clearedRoutines = clearSkincareLinksFromRoutines(routines, 'product-a');
    const clearedTasks = clearSkincareLinksFromTasks(tasks, 'product-a');

    expect(clearedRoutines[0].linkedContext).toBeUndefined();
    expect(clearedRoutines[0].completionHistory).toEqual(routines[0].completionHistory);
    expect(clearedRoutines[1].linkedContext).toEqual(routines[1].linkedContext);
    expect(clearedTasks[0].linkedContext).toBeUndefined();
    expect(clearedTasks[1].linkedContext).toEqual(tasks[1].linkedContext);
    expect(getSkincareProductIdFromLifeHubRecord(clearedRoutines[1])).toBe('product-b');
  });

  it('uses exact bidirectional navigation contracts', () => {
    expect(getLifeHubLinkedContextNavigationDetail({ section: 'skincare', type: 'product', entityId: 'product-a' })).toEqual({
      section: 'skincare',
      feature: 'product',
      recordId: 'product-a',
    });
    expect({ section: 'lifehub', feature: 'routine', recordId: 'routine-a' }).toEqual({
      section: 'lifehub',
      feature: 'routine',
      recordId: 'routine-a',
    });
    expect({ section: 'lifehub', feature: 'tasks', recordId: 'task-a' }).toEqual({
      section: 'lifehub',
      feature: 'tasks',
      recordId: 'task-a',
    });
  });

  it('keeps the shared selector active-only for new Skincare links and preserves finished links', () => {
    const selector = readFileSync('components/common/LifeHubLinkedContextSelector.tsx', 'utf8');
    const lifeHub = readFileSync('components/sections/LifeHubSection.tsx', 'utf8');
    const skincare = readFileSync('components/sections/SkincareSection.tsx', 'utf8');

    expect(selector).toContain("product.status !== 'emptied'");
    expect(selector).toContain("product.status === 'emptied' ? ' · Finished' : ''");
    expect(selector).toContain("section: 'skincare', type: 'product', entityId: nextId");
    expect(lifeHub).toContain("navigateTo('skincare', 'product', productId)");
    expect(skincare).toContain("detail: { section: 'lifehub', feature, recordId }");
  });
});
