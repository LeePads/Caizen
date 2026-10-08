import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import { normalizeProductivityItem, normalizeRoutineItem } from '@/lib/lifehub/normalization';
import {
  clearGameLinksFromRoutines,
  clearGameLinksFromTasks,
} from '@/lib/lifehub/linked-context';

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return normalizeRoutineItem({
    id: 'routine-base',
    title: 'Play a game',
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  });
}

function task(overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return normalizeProductivityItem({
    id: 'task-base',
    title: 'Play next chapter',
    type: 'task',
    priority: 'important',
    status: 'completed',
    completedAt: new Date('2026-08-27T09:00:00'),
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  });
}

describe('Games bulk and range deletion cleanup', () => {
  it('clears canonical and legacy Routine Game links for every deleted ID', () => {
    const linked = routine({
      id: 'routine-a',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const linkedToSecond = routine({
      id: 'routine-b',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-b' },
    });
    const retained = routine({
      id: 'routine-c',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-c' },
    });
    const legacy = routine({ id: 'routine-legacy', linkedGameId: 'game-a' });
    const unrelated = routine({
      id: 'routine-unrelated',
      linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
      linkedSection: 'health',
      linkedView: 'overview',
    });

    const cleared = clearGameLinksFromRoutines(
      [linked, linkedToSecond, retained, legacy, unrelated],
      new Set(['game-a', 'game-b']),
    );

    expect(cleared[0].linkedContext).toBeUndefined();
    expect(cleared[0].completionHistory).toEqual(linked.completionHistory);
    expect(cleared[1].linkedContext).toBeUndefined();
    expect(cleared[2].linkedContext).toEqual(retained.linkedContext);
    expect(cleared[3].linkedGameId).toBeUndefined();
    expect(cleared[4].linkedContext).toEqual(unrelated.linkedContext);
    expect(cleared[4].linkedSection).toBe('health');
    expect(cleared[4].linkedView).toBe('overview');
  });

  it('clears canonical and legacy Task Game links while preserving task state', () => {
    const linked = task({
      id: 'task-a',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
      deadline: new Date('2026-08-30T12:00:00'),
    });
    const linkedToSecond = task({
      id: 'task-b',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-b' },
    });
    const retained = task({
      id: 'task-c',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-c' },
    });
    const legacy = task({ id: 'task-legacy', linkedGameId: 'game-a' } as Partial<ProductivityItem> & { linkedGameId: string });
    const unrelated = task({
      id: 'task-unrelated',
      linkedContext: { section: 'work', type: 'work-item', entityId: 'work-a' },
    });

    const cleared = clearGameLinksFromTasks(
      [linked, linkedToSecond, retained, legacy, unrelated],
      new Set(['game-a', 'game-b']),
    );

    expect(cleared[0]).toMatchObject({ id: 'task-a', status: 'completed', priority: 'important' });
    expect(cleared[0].linkedContext).toBeUndefined();
    expect(cleared[0].deadline).toEqual(linked.deadline);
    expect(cleared[1].linkedContext).toBeUndefined();
    expect(cleared[2].linkedContext).toEqual(retained.linkedContext);
    expect((cleared[3] as ProductivityItem & { linkedGameId?: string }).linkedGameId).toBeUndefined();
    expect(cleared[4].linkedContext).toEqual(unrelated.linkedContext);
  });

  it('does not mutate Life Hub records when the deleted Game ID set is empty', () => {
    const originalRoutine = routine({
      id: 'routine-kept',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    });
    const originalTask = task({
      id: 'task-kept',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    });

    const clearedRoutines = clearGameLinksFromRoutines([originalRoutine], new Set());
    const clearedTasks = clearGameLinksFromTasks([originalTask], new Set());

    expect(clearedRoutines[0]).toBe(originalRoutine);
    expect(clearedTasks[0]).toBe(originalTask);
  });
});

describe('Games deletion caller contracts', () => {
  it('delegates web Settings to the live SettingsHub', () => {
    const source = read('app/app/page.tsx');
    expect(source).toContain('<SettingsHub');
    expect(source).toContain('onExport={() => {');
    expect(source).toContain('onImport={() => {');
  });

  it('wires the Settings all/range deletion path to IDs selected from the Games collection', () => {
    const source = read('components/settings/SettingsHub.tsx');

    expect(source).toContain('clearGameLinksFromRoutines');
    expect(source).toContain('clearGameLinksFromTasks');
    expect(source).toContain("deleteSection === 'games'");
    expect(source).toContain('const deletedGameIds');
    expect(source).toContain('getDeleteItems()');
    expect(source).toContain('new Set<string>');
    expect(source).toContain("games: ['createdAt']");
  });

  it('keeps the normal single-Game delete path on the existing cleanup helpers', () => {
    const source = read('lib/context.tsx');
    const start = source.indexOf('const deleteGame =');
    const end = source.indexOf('const deleteGameGuide =', start);
    const deleteGameBlock = source.slice(start, end);

    expect(deleteGameBlock).toContain('clearGameRoutineLinks');
    expect(deleteGameBlock).toContain('clearGameLinksFromTasks');
    expect(deleteGameBlock).toContain('games: profile.games.filter');
  });
});
