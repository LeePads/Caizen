import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Profile } from '@/lib/types';
import {
  buildWidgetProfileIndex,
  buildWidgetSnapshot,
  WIDGET_SNAPSHOT_VERSION,
} from '@/lib/native/widget-snapshot';
import {
  hasWidgetActionReceipt,
  recordWidgetActionReceipt,
  removeWidgetActionReceiptsForProfiles,
} from '@/lib/native/widget-actions';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

const source = (path: string) => readFileSync(path, 'utf8');

function profile(id: string, name: string): Profile {
  return {
    id,
    name,
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
    upcomingMoneyItems: [],
    health: {} as Profile['health'],
    createdAt: new Date('2026-08-01T00:00:00'),
  } as unknown as Profile;
}

describe('Android widget Phase 1 contracts', () => {
  beforeEach(async () => {
    await resetCaizenDatabaseForTests();
  });

  it('builds stable, profile-scoped version-7 projections and an index', () => {
    const first = profile('p-a', 'A');
    const second = profile('p-b', 'B');
    const atMorning = buildWidgetSnapshot(first, { now: new Date('2026-08-01T08:00:00') });
    const atNight = buildWidgetSnapshot(first, { now: new Date('2026-08-01T20:00:00') });
    const other = buildWidgetSnapshot(second, { now: new Date('2026-08-01T20:00:00') });

    expect(atMorning.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(atMorning.revision).toBe(atNight.revision);
    expect(atMorning.profileId).not.toBe(other.profileId);
    expect(buildWidgetProfileIndex([first, second], second.id, [atMorning, other])).toEqual({
      version: 1,
      activeProfileId: 'p-b',
      profiles: [
        { profileId: 'p-a', displayName: 'A', revision: atMorning.revision, updatedAt: atMorning.updatedAt },
        { profileId: 'p-b', displayName: 'B', revision: other.revision, updatedAt: other.updatedAt },
      ],
    });
  });

  it('keeps applied receipts profile-scoped, idempotent, and removable', async () => {
    await recordWidgetActionReceipt('p-a', 'action-1');
    await recordWidgetActionReceipt('p-a', 'action-1');
    await recordWidgetActionReceipt('p-b', 'action-1');

    expect(await hasWidgetActionReceipt('p-a', 'action-1')).toBe(true);
    expect(await hasWidgetActionReceipt('p-b', 'action-1')).toBe(true);
    await removeWidgetActionReceiptsForProfiles(['p-a']);
    expect(await hasWidgetActionReceipt('p-a', 'action-1')).toBe(false);
    expect(await hasWidgetActionReceipt('p-b', 'action-1')).toBe(true);
  });

  it('keeps native widget boundaries bounded and configuration-driven', () => {
    const manifest = source('android/app/src/main/AndroidManifest.xml');
    const calendarProvider = source('android/app/src/main/res/xml/widget_calendar_info.xml');
    const routinesProvider = source('android/app/src/main/res/xml/widget_routines_info.xml');
    const store = source('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const snapshot = source('android/app/src/main/java/app/caizen/life/WidgetSnapshotStore.java');
    const routines = source('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    expect(manifest).toContain('.CaizenWidgetConfigureActivity');
    for (const provider of [calendarProvider, routinesProvider]) {
      expect(provider).toContain('android:configure="app.caizen.life.CaizenWidgetConfigureActivity"');
      expect(provider).not.toContain('android:configure=".CaizenWidgetConfigureActivity"');
    }
    expect(manifest).toContain('android.permission.BIND_REMOTEVIEWS');
    expect(store).toContain('MAX_ACTIONS = 32');
    expect(store).toContain('routine.complete');
    expect(snapshot).toContain('SUPPORTED_VERSION = 7');
    expect(snapshot).toContain('PREVIOUS_VERSION = 6');
    expect(snapshot).toContain('readForWidget');
    expect(routines).toContain('snapshotRevision');
    expect(routines).toContain('WidgetActionIds.routineComplete');
  });
});
