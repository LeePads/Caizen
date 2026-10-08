import { describe, expect, it } from 'vitest';
import type { Game, ProductivityItem } from '@/lib/types';
import { normalizeProductivityItem } from '@/lib/lifehub/normalization';
import { clearGameLinksFromTasks } from '@/lib/lifehub/linked-context';
import { deriveGameTaskProjection, getGameTaskNavigationDetail } from '@/lib/games/task-activity';

const now = new Date('2026-08-27T15:00:00');

function task(overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return normalizeProductivityItem({
    id: 'task-base',
    title: 'Play next chapter',
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  });
}

describe('Game Task projection', () => {
  it('rejects unsupported section/type combinations and invalid entity IDs', () => {
    const invalid = [
      { section: 'unknown', type: 'game', entityId: 'game-a' },
      { section: 'games', type: 'work-item', entityId: 'game-a' },
      { section: 'games', type: 'game', entityId: '   ' },
      { section: 'games', type: 'game', entityId: 42 },
    ];

    for (const linkedContext of invalid) {
      expect(normalizeProductivityItem({
        id: 'invalid',
        title: 'Invalid link',
        type: 'task',
        linkedContext,
      }).linkedContext).toBeUndefined();
    }
  });

  it('normalizes and discovers canonical Task → Game relationships', () => {
    const linked = task({
      id: 'task-linked',
      linkedContext: { section: 'games', type: 'game', entityId: ' game-a ' },
    });
    const unrelated = task({
      id: 'task-other',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-b' },
    });

    expect(linked.linkedContext).toEqual({ section: 'games', type: 'game', entityId: 'game-a' });
    expect(deriveGameTaskProjection('game-a', [linked, unrelated], now)).toMatchObject({
      linkedTaskCount: 1,
      tasks: [{ taskId: 'task-linked' }],
    });
  });

  it('excludes non-task and unrelated records, orders active work before completed work, and caps rows at four', () => {
    const active = Array.from({ length: 5 }, (_, index) => task({
      id: `active-${index}`,
      title: `Active ${index}`,
      status: index === 0 ? 'in-progress' : 'pending',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    }));
    const completed = task({
      id: 'completed',
      title: 'Completed task',
      status: 'completed',
      completedAt: new Date('2026-08-26T12:00:00'),
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    });
    const unrelated = task({
      id: 'unrelated',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-b' },
    });
    const nonTask = task({
      id: 'idea',
      type: 'idea',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    });

    const projection = deriveGameTaskProjection('game-a', [...active, completed, unrelated, nonTask], now);

    expect(projection.linkedTaskCount).toBe(6);
    expect(projection.tasks).toHaveLength(4);
    expect(projection.tasks.every(item => item.state === 'pending')).toBe(true);
    expect(projection.tasks.some(item => item.taskId === 'completed')).toBe(false);
    expect(projection.tasks.map(item => item.taskId)).toEqual(['active-0', 'active-1', 'active-2', 'active-3']);
  });

  it('preserves deadline and useful priority metadata', () => {
    const projection = deriveGameTaskProjection('game-a', [task({
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
      priority: 'critical',
      deadline: new Date('2026-08-27T12:00:00'),
    })], now);

    expect(projection.tasks[0]).toMatchObject({
      priority: 'critical',
      dueState: 'due-today',
    });
    expect(projection.tasks[0].deadline).toEqual(new Date('2026-08-27T12:00:00'));
  });

  it('uses the repository-supported Life Hub Task navigation feature', () => {
    expect(getGameTaskNavigationDetail('task-1')).toEqual({
      section: 'lifehub',
      feature: 'tasks',
      recordId: 'task-1',
    });
  });
});

describe('Game Task link cleanup', () => {
  it('clears canonical and legacy Game links without deleting Tasks or history', () => {
    const original = task({
      id: 'task-linked',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
      completedAt: new Date('2026-08-27T09:00:00'),
    });
    const legacy = task({ id: 'task-legacy', linkedGameId: 'game-a' } as Partial<ProductivityItem> & { linkedGameId: string });
    const kept = task({ id: 'task-kept', linkedContext: { section: 'games', type: 'game', entityId: 'game-b' } });

    const cleared = clearGameLinksFromTasks([original, legacy, kept], 'game-a');

    expect(cleared.map(item => item.id)).toEqual(['task-linked', 'task-legacy', 'task-kept']);
    expect(cleared[0].linkedContext).toBeUndefined();
    expect(cleared[0].completedAt).toEqual(original.completedAt);
    expect((cleared[1] as ProductivityItem & { linkedGameId?: string }).linkedGameId).toBeUndefined();
    expect(cleared[2].linkedContext).toEqual(kept.linkedContext);
  });

  it('does not mutate Game data when projecting or completing a Task', () => {
    const game: Game = {
      id: 'game-a',
      title: 'Caizen Quest',
      platform: 'pc',
      genre: 'rpg',
      hoursPlayed: 12,
      status: 'playing',
      notes: 'Keep the build calm.',
      createdAt: new Date('2026-08-01T12:00:00'),
    };
    const snapshot = structuredClone(game);
    deriveGameTaskProjection(game.id, [task({ linkedContext: { section: 'games', type: 'game', entityId: game.id } })], now);
    expect(game).toEqual(snapshot);
  });
});
