import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateSkincareSavings } from '@/lib/skincare/savings';
import { recommendNextWorkout } from '@/lib/health/workout-recommendation';

const read = (path: string) => readFileSync(path, 'utf8');

const plan = (id: string, name = id, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  exercises: [],
  createdAt: new Date(2026, 0, 1),
  updatedAt: new Date(2026, 0, 1),
  ...extra,
}) as any;

const routine = (id: string, planId: string, scheduledTime?: string) => ({
  id,
  title: planId,
  active: true,
  frequency: 'daily',
  anchorDate: new Date(2026, 0, 1),
  linkedEntityType: 'workout-plan',
  linkedEntityId: planId,
  scheduledTime,
  completionHistory: [],
}) as any;

describe('final web and Android UX remediation', () => {
  it('calculates finite net Skincare savings and excludes incomplete comparisons and includes a recorded zero price', () => {
    expect(calculateSkincareSavings([
      { purchasePrice: 80, currentPrice: 100 },
      { purchasePrice: 125, currentPrice: 100 },
      { purchasePrice: 50, currentPrice: undefined },
      { purchasePrice: Number.NaN, currentPrice: 20 },
      { purchasePrice: 30, currentPrice: Number.POSITIVE_INFINITY },
      { purchasePrice: 0, currentPrice: 20 },
    ] as any)).toEqual({ amount: 15, comparableProducts: 3 });
  });

  it('chooses a scheduled incomplete plan before never-completed plans', () => {
    const today = new Date(2026, 7, 14, 12);
    const result = recommendNextWorkout(
      [plan('never'), plan('late'), plan('early')],
      [routine('late-routine', 'late', '18:00'), routine('early-routine', 'early', '07:30')],
      [],
      today,
    );
    expect(result).toMatchObject({ plan: { id: 'early' }, reason: 'scheduled-today' });
  });

  it('uses never-completed then least-recently-completed precedence safely', () => {
    const today = new Date(2026, 7, 14, 12);
    const never = recommendNextWorkout(
      [plan('old'), plan('new')],
      [],
      [{ workoutPlanId: 'old', date: new Date(2026, 7, 1) } as any],
      today,
    );
    expect(never).toMatchObject({ plan: { id: 'new' }, reason: 'never-completed' });

    const leastRecent = recommendNextWorkout(
      [plan('recent'), plan('oldest'), plan('archived', 'Archived', { archived: true })],
      [],
      [
        { workoutPlanId: 'recent', date: new Date(2026, 7, 10) },
        { workoutPlanId: 'oldest', date: new Date(2026, 6, 10) },
      ] as any,
      today,
    );
    expect(leastRecent).toMatchObject({ plan: { id: 'oldest' }, reason: 'least-recently-completed' });
  });

  it('keeps the new interaction contracts profile-safe and viewport-oriented', () => {
    const page = read('app/app/page.tsx');
    const music = read('components/sections/MusicSection.tsx');
    expect(page).toContain('DragOverlay');
    expect(page).toContain('KeyboardSensor');
    expect(page).toContain('caizen-command-search-row');
    expect(music).toContain('playSong(item, songs)');
    expect(music).toContain("item.type !== 'playlist'");
    expect(read('components/common/EntryActionSheet.tsx')).toContain('createPortal(sheet, document.body)');
    expect(read('styles/caizen-sheet.css')).toContain("data-presentation='context'");
    expect(read('android/app/src/main/res/layout/widget_routines.xml')).toContain('<ListView');
    expect(read('android/app/src/main/java/app/caizen/life/CaizenRoutinesRemoteViewsService.java')).toContain('RemoteViewsFactory');
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain('BIND_REMOTEVIEWS');
  });
});
