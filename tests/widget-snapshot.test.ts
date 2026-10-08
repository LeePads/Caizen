import { describe, expect, it } from 'vitest';
import {
  buildWidgetSnapshot,
  EMPTY_WIDGET_SNAPSHOT,
  serializeWidgetSnapshot,
  WIDGET_SNAPSHOT_MAX_BYTES,
  WIDGET_SNAPSHOT_VERSION,
} from '@/lib/native/widget-snapshot';
import type { Profile } from '@/lib/types';

const now = new Date('2026-08-01T10:00:00');

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-a',
    name: 'Cai',
    wallets: [],
    inventoryItems: [],
    wishlistItems: [],
    journalEntries: [],
    games: [],
    gameGuides: [],
    productivityItems: [],
    mediaItems: [],
    musicItems: [],
    workItems: [],
    personalVaultItems: [],
    trashItems: [],
    skincareProducts: [],
    dailyChecklistItems: [],
    importantDates: [],
    supplements: [],
    health: {} as Profile['health'],
    createdAt: now,
    ...overrides,
  } as Profile;
}

describe('widget snapshot sanitization', () => {
  it('carries only display fields and never sensitive record contents', () => {
    const profile = makeProfile({
      journalEntries: [
        { id: 'j1', content: 'a private confession', createdAt: now },
      ] as unknown as Profile['journalEntries'],
      personalVaultItems: [
        { id: 'v1', title: 'Passport number', notes: 'X1234567' },
      ] as unknown as Profile['personalVaultItems'],
      wallets: [
        { id: 'w1', name: 'Savings', balance: 999999 },
      ] as unknown as Profile['wallets'],
      productivityItems: [
        {
          id: 't1',
          title: 'Renew insurance',
          type: 'task',
          status: 'pending',
          priority: 'normal',
          deadline: new Date('2026-08-01T18:00:00'),
          notes: 'policy 88123, paid via card ending 4321',
          createdAt: now,
        },
      ] as unknown as Profile['productivityItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.tasks[0]).toEqual({
      id: 't1',
      title: 'Renew insurance',
      dueAt: new Date('2026-08-01T18:00:00').getTime(),
      done: false,
    });

    // Nothing sensitive may reach the home screen.
    expect(serialized).not.toContain('private confession');
    expect(serialized).not.toContain('Passport');
    expect(serialized).not.toContain('X1234567');
    expect(serialized).not.toContain('999999');
    expect(serialized).not.toContain('policy 88123');
    expect(serialized).not.toContain('4321');
  });

  it('reports routine progress and clamps long titles', () => {
    const profile = makeProfile({
      dailyChecklistItems: [
        {
          id: 'r1',
          title: 'x'.repeat(400),
          frequency: 'daily',
          completedAt: new Date('2026-08-01T08:00:00'),
          createdAt: now,
        },
        {
          id: 'r2',
          title: 'Stretch',
          frequency: 'daily',
          completedAt: null,
          createdAt: now,
        },
      ] as unknown as Profile['dailyChecklistItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    expect(snapshot.routineProgress).toBe(50);
    expect(snapshot.todayRoutineCount).toBe(1);
    expect(snapshot.routines.some((routine) => routine.done)).toBe(true);
    expect(snapshot.routines[0].title.length).toBeLessThanOrEqual(60);
    expect(snapshot.routines[0]).toMatchObject({
      dateKey: '2026-08-01',
      occurrenceKey: 'day:2026-08-01',
    });
  });

  it('projects all due routines through the bounded 24-row budget with frequency groups', () => {
    const profile = makeProfile({
      dailyChecklistItems: Array.from({ length: 30 }, (_, index) => ({
        id: `routine-${String(index).padStart(2, '0')}`,
        title: `Routine ${index}`,
        frequency: index % 4 === 0 ? 'weekly' : 'daily',
        active: true,
        completedAt: null,
        createdAt: now,
      })) as unknown as Profile['dailyChecklistItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    expect(snapshot.routines).toHaveLength(24);
    expect(snapshot.routineRowsOmitted).toBe(6);
    expect(snapshot.routines.every(row => row.frequency === 'daily' || row.frequency === 'weekly')).toBe(true);
    expect(snapshot.routines.some(row => row.frequency === 'weekly')).toBe(true);
    expect(JSON.parse(serializeWidgetSnapshot(snapshot)).routineRowsOmitted).toBe(6);
  });

  it('reports canonical per-filter routine totals independent of the 24-row display cap', () => {
    // Reproduces the exact physical scenario reported: 8 due routines, 1
    // completed, "all" filter. The visible widget percentage must read this
    // total, not routines.length() (which can diverge once rows are capped
    // or a widget instance is scoped to a single frequency).
    const profile = makeProfile({
      dailyChecklistItems: [
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `daily-${index}`,
          title: `Daily ${index}`,
          frequency: 'daily',
          active: true,
          completedAt: index === 0 ? new Date('2026-08-01T08:00:00') : null,
          createdAt: now,
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `weekly-${index}`,
          title: `Weekly ${index}`,
          frequency: 'weekly',
          active: true,
          completedAt: index < 2 ? new Date('2026-08-01T08:00:00') : null,
          createdAt: now,
        })),
      ] as unknown as Profile['dailyChecklistItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    expect(snapshot.routineTotalsByFilter.all).toEqual({ total: 11, done: 3 });
    expect(snapshot.routineTotalsByFilter.daily).toEqual({ total: 8, done: 1 });
    expect(snapshot.routineTotalsByFilter.weekly).toEqual({ total: 3, done: 2 });
    expect(snapshot.routineTotalsByFilter.monthly).toEqual({ total: 0, done: 0 });
    // The bug this guards against: a naive fix deriving the denominator from
    // routines.length() would agree with routineTotalsByFilter.all here
    // (11 <= 24, nothing capped) — the real regression only shows up once
    // rows are capped or a non-"all" filter is selected, both covered above
    // and below.
    expect(snapshot.routines).toHaveLength(11);
  });

  it('keeps per-filter routine totals uncapped even when display rows are capped', () => {
    const profile = makeProfile({
      dailyChecklistItems: Array.from({ length: 30 }, (_, index) => ({
        id: `routine-${String(index).padStart(2, '0')}`,
        title: `Routine ${index}`,
        frequency: 'daily',
        active: true,
        completedAt: index < 10 ? new Date('2026-08-01T08:00:00') : null,
        createdAt: now,
      })) as unknown as Profile['dailyChecklistItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    // routines.length() is capped at 24 — the canonical total must still
    // reflect all 30 due routines, not the capped row count.
    expect(snapshot.routines).toHaveLength(24);
    expect(snapshot.routineTotalsByFilter.all).toEqual({ total: 30, done: 10 });
    expect(snapshot.routineTotalsByFilter.daily).toEqual({ total: 30, done: 10 });
  });

  it('backfills remaining Today capacity with undated tasks without inflating the progress denominator', () => {
    const profile = makeProfile({
      productivityItems: [
        {
          id: 'overdue-1',
          title: 'Overdue task',
          type: 'task',
          status: 'pending',
          priority: 'critical',
          deadline: new Date('2026-07-30T09:00:00'),
          createdAt: now,
        },
        {
          id: 'due-today-1',
          title: 'Due today task',
          type: 'task',
          status: 'pending',
          priority: 'normal',
          deadline: new Date('2026-08-01T18:00:00'),
          createdAt: now,
        },
        {
          id: 'undated-1',
          title: 'Undated important task',
          type: 'task',
          status: 'pending',
          priority: 'important',
          createdAt: now,
        },
        {
          id: 'undated-2',
          title: 'Undated optional task',
          type: 'task',
          status: 'pending',
          priority: 'optional',
          createdAt: now,
        },
      ] as unknown as Profile['productivityItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    // Dated tasks (overdue + due-today) come first; capacity remains, so
    // undated tasks fill in, ranked by priority.
    expect(snapshot.today.items.map(item => item.id)).toEqual([
      'overdue-1',
      'due-today-1',
      'undated-1',
      'undated-2',
    ]);
    expect(snapshot.today.items.find(item => item.id === 'undated-1')?.dueAt).toBeNull();

    // The denominator/progress must reflect only the two DATED tasks — the
    // undated fallback rows exist purely to fill display capacity.
    expect(snapshot.today.overdueTaskCount).toBe(1);
    expect(snapshot.today.dueTodayTaskCount).toBe(1);
    expect(snapshot.today.totalDueCount).toBe(1);
    expect(snapshot.today.completedDueCount).toBe(0);
  });

  it('does not use undated tasks to fill Today once dated tasks already fill the row budget', () => {
    const profile = makeProfile({
      productivityItems: [
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `due-${index}`,
          title: `Due task ${index}`,
          type: 'task',
          status: 'pending',
          priority: 'normal',
          deadline: new Date('2026-08-01T18:00:00'),
          createdAt: now,
        })),
        {
          id: 'undated-overflow',
          title: 'Should not appear',
          type: 'task',
          status: 'pending',
          priority: 'critical',
          createdAt: now,
        },
      ] as unknown as Profile['productivityItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    expect(snapshot.today.items).toHaveLength(8);
    expect(snapshot.today.items.some(item => item.id === 'undated-overflow')).toBe(false);
  });

  it('excludes Work Hub tasks from the Today projection entirely', () => {
    const profile = makeProfile({
      productivityItems: [],
      workItems: [
        {
          id: 'work-1',
          type: 'task',
          title: 'Work task due today',
          status: 'active',
          deadline: new Date('2026-08-01T18:00:00'),
          createdAt: now,
        },
      ] as unknown as Profile['workItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });

    expect(snapshot.today.items).toHaveLength(0);
    expect(snapshot.today.items.some(item => item.id === 'work-1')).toBe(false);
    expect(snapshot.workTasks.items.some(item => item.id === 'work-1')).toBe(true);
  });

  it('marks music as present but never controllable without a media session', () => {
    const snapshot = buildWidgetSnapshot(makeProfile(), {
      now,
      nowPlaying: {
        id: 'm1',
        title: 'Focus mix',
        provider: 'youtube',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        createdAt: now,
      } as never,
    });

  expect(snapshot.music).toEqual({
  title: 'Focus mix',
  artist: 'Unknown artist',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  sourceType: 'youtube',
  controllable: false,
});
  });

  it('falls back to an honest empty snapshot when no profile exists', () => {
    expect(buildWidgetSnapshot(undefined)).toEqual(EMPTY_WIDGET_SNAPSHOT);
    expect(EMPTY_WIDGET_SNAPSHOT.version).toBe(WIDGET_SNAPSHOT_VERSION);
  });

  it('drops list rows rather than exceeding the payload budget', () => {
    const profile = makeProfile({
      productivityItems: Array.from({ length: 8 }, (_, index) => ({
        id: `t${index}`,
        title: 'y'.repeat(60),
        type: 'task',
        status: 'pending',
        priority: 'normal',
        deadline: new Date('2026-08-02T09:00:00'),
        createdAt: now,
      })) as unknown as Profile['productivityItems'],
    });

    const snapshot = buildWidgetSnapshot(profile, { now });
    const payload = serializeWidgetSnapshot({
      ...snapshot,
      // Force the oversize branch with a deliberately padded profile name.
      profileName: 'z'.repeat(WIDGET_SNAPSHOT_MAX_BYTES),
    });

    expect(JSON.parse(payload).tasks).toEqual([]);
    expect(JSON.parse(payload).version).toBe(WIDGET_SNAPSHOT_VERSION);
  });
});
