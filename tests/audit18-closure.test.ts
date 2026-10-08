import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';

import {
  getUpcomingMoneyReminderNotification,
  stableNotificationId,
} from '@/lib/native/notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/native/notification-settings';
import { normalizeUpcomingMoneyItem } from '@/lib/upcoming-money';
import { personalVaultPlanningProjection } from '@/lib/personal-vault/planning';
import { searchProfileRecords } from '@/lib/global-search';
import { prepareImport } from '@/lib/storage/import-integrity';
import {
  createCompleteBackup,
  restoreCompleteBackup,
} from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset } from '@/lib/storage/media-repository';
import { mediaStorage } from '@/lib/storage/media-storage';
import {
  processPendingMediaCleanup,
  queueMediaCleanup,
} from '@/lib/storage/media-cleanup';

const futureDate = (days = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  upcomingMoneyItems: [],
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
  health: {},
  ...overrides,
});

const reminderSettings = {
  ...DEFAULT_NOTIFICATION_SETTINGS,
  masterEnabled: true,
  categories: {
    ...DEFAULT_NOTIFICATION_SETTINGS.categories,
    deadlines: true,
    summary: false,
  },
};

afterEach(async () => {
  localStorage.clear();
  await resetCaizenDatabaseForTests();
});

describe('Audit #18 final cross-decision closure', () => {
  it('keeps manual Money reminders profile-scoped and exact-record routed', () => {
    const item = normalizeUpcomingMoneyItem({
      id: 'money-closure',
      title: 'Renewal',
      direction: 'outgoing',
      amount: 25,
      status: 'planned',
      dueDate: new Date(`${futureDate(8)}T00:00:00`),
      reminderEnabled: true,
      reminderDate: futureDate(6),
      reminderTime: '09:15',
    });
    const profileA = profile('profile-a', { upcomingMoneyItems: [item] });
    const profileB = profile('profile-b', { upcomingMoneyItems: [item] });
    const notificationA = getUpcomingMoneyReminderNotification(profileA as any, item, reminderSettings);
    const notificationB = getUpcomingMoneyReminderNotification(profileB as any, item, reminderSettings);

    expect(notificationA).toMatchObject({
      id: stableNotificationId('profile-a', item.id, 'money'),
      extra: { profileId: 'profile-a', recordId: 'money-closure', section: 'balance' },
    });
    expect(notificationB?.id).toBe(stableNotificationId('profile-b', item.id, 'money'));
    expect(notificationA?.id).not.toBe(notificationB?.id);
    expect(normalizeUpcomingMoneyItem({
      ...item,
      reminderEnabled: undefined,
      reminderDate: futureDate(6),
      reminderTime: '09:15',
    }).reminderEnabled).toBe(false);
  });

  it('keeps Vault planning title-only and Health/Work privacy boundaries independent', () => {
    const visibleVault = {
      id: 'vault-visible',
      type: 'document',
      title: 'Passport renewal',
      date: new Date('2026-08-31T12:00:00'),
      expiryDate: null,
      notes: 'vault secret sentinel',
      referenceHint: 'masked secret sentinel',
      showTitleInPlanning: true,
    };
    const privateVault = { ...visibleVault, id: 'vault-private', title: 'Private vault sentinel', showTitleInPlanning: false };
    const profileA = profile('profile-a', {
      personalVaultItems: [visibleVault, privateVault],
      workItems: [{ id: 'work-a', type: 'task', title: 'Release checklist', attachmentAssetIds: ['asset-work'] }],
      health: {
        foodEntries: [{ id: 'food-a', name: 'Oatmeal sentinel', mealType: 'breakfast', date: new Date('2026-08-13'), amount: 12.5, notes: 'health note sentinel' }],
        activityEntries: [{ id: 'activity-a', activity: 'Mobility sentinel', date: new Date('2026-08-13'), durationMinutes: 40, notes: 'activity note sentinel' }],
        workoutPlans: [{ id: 'plan-a', name: 'Strength plan sentinel', description: 'sensitive plan body sentinel' }],
        weightEntries: [{ id: 'weight-a', weightKg: 72.5, date: new Date('2026-08-13'), notes: 'weight note sentinel' }],
      },
    });

    expect(personalVaultPlanningProjection(visibleVault as any)).toEqual({
      id: 'vault-visible',
      title: 'Passport renewal',
      type: 'document',
      date: visibleVault.date,
      expiryDate: null,
    });
    expect(personalVaultPlanningProjection(privateVault as any)).toBeNull();
    expect(searchProfileRecords(profileA as any, 'Oatmeal sentinel')[0]).toMatchObject({ recordId: 'food-a', section: 'health' });
    expect(searchProfileRecords(profileA as any, 'Mobility sentinel')[0]).toMatchObject({ recordId: 'activity-a', section: 'health' });
    expect(searchProfileRecords(profileA as any, 'Strength plan sentinel')[0]).toMatchObject({ recordId: 'plan-a', section: 'health' });
    for (const query of ['12.5', '72.5', 'health note sentinel', 'sensitive plan body sentinel', 'vault secret sentinel', 'masked secret sentinel', 'report.pdf']) {
      expect(searchProfileRecords(profileA as any, query), query).toEqual([]);
    }
  });

  it('normalizes the seven-decision import boundary without changing approved privacy defaults', () => {
    const prepared = prepareImport({
      currentProfileId: 'profile-import',
      profiles: [profile('profile-import', {
        upcomingMoneyItems: [{
          id: 'money-import',
          title: 'Manual reminder',
          direction: 'outgoing',
          amount: 10,
          status: 'planned',
          dueDate: futureDate(10),
          reminderEnabled: true,
          reminderDate: futureDate(5),
          reminderTime: '10:30',
        }],
        workItems: [
          { id: 'task-import', type: 'task', title: 'Imported task', attachmentAssetIds: [' asset-1 ', 'asset-1', ''] },
          { id: 'resource-import', type: 'file', title: 'External reference', attachmentAssetIds: ['must-strip'] },
        ],
        personalVaultItems: [
          { id: 'vault-on', type: 'document', title: 'Visible title', date: futureDate(20), showTitleInPlanning: true },
          { id: 'vault-legacy', type: 'document', title: 'Legacy private', date: futureDate(20) },
        ],
        health: {
          foodEntries: [{ id: 'food-import', name: 'Imported food', mealType: 'lunch', date: futureDate(2), calories: 'NaN', notes: 'excluded' }],
        },
      })],
    });
    const imported = prepared.state.profiles[0] as any;

    expect(prepared.report.canImport).toBe(true);
    expect(imported.upcomingMoneyItems[0]).toMatchObject({ reminderEnabled: true, reminderTime: '10:30' });
    expect(imported.workItems[0].attachmentAssetIds).toEqual(['asset-1']);
    expect(imported.workItems[1]).not.toHaveProperty('attachmentAssetIds');
    expect(imported.personalVaultItems.map((item: any) => item.showTitleInPlanning)).toEqual([true, false]);
    expect(imported.health.foodEntries[0].date).toBe(futureDate(2));
  });

  it('keeps shared managed media alive across Inventory, Work, and recoverable Trash', async () => {
    const shared = await mediaStorage.save(new Blob(['shared'], { type: 'text/plain' }), {
      profileId: 'profile-a',
      ownerType: 'inventory',
      ownerId: 'inventory-a',
      role: 'primary',
      fileName: 'shared.txt',
    });
    await saveAppState({
      profiles: [profile('profile-a', {
        inventoryItems: [{ id: 'inventory-a', photoAssetIds: [shared.id] }],
        workItems: [{ id: 'task-a', type: 'task', attachmentAssetIds: [shared.id] }],
        trashItems: [{ id: 'trash-a', source: 'wishlistItems', data: { id: 'wishlist-a', photoAssetIds: [shared.id] } }],
      }) as any],
      currentProfileId: 'profile-a',
    });

    queueMediaCleanup({ profileId: 'profile-a', assetIds: [shared.id], reason: 'record-deleted' });
    await saveAppState({
      profiles: [profile('profile-a', {
        inventoryItems: [],
        workItems: [{ id: 'task-a', type: 'task', attachmentAssetIds: [shared.id] }],
        trashItems: [],
      }) as any],
      currentProfileId: 'profile-a',
    });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 0, pendingJobs: 0 });
    expect(await getMediaAsset(shared.id)).toBeDefined();

    queueMediaCleanup({ profileId: 'profile-a', assetIds: [shared.id], reason: 'record-deleted' });
    await saveAppState({ profiles: [profile('profile-a') as any], currentProfileId: 'profile-a' });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 1, pendingJobs: 0 });
    expect(await getMediaAsset(shared.id)).toBeUndefined();
  });

  it('round-trips Work and collection media with profile isolation through a complete backup', async () => {
    const workAsset = await mediaStorage.save(new Blob(['work'], { type: 'text/plain' }), {
      profileId: 'profile-a', ownerType: 'work', ownerId: 'task-a', role: 'attachment', fileName: 'work.txt',
    });
    const collectionAsset = await mediaStorage.save(new Blob(['collection'], { type: 'text/plain' }), {
      profileId: 'profile-b', ownerType: 'inventory', ownerId: 'inventory-b', role: 'primary', fileName: 'collection.txt',
    });
    await saveAppState({
      profiles: [
        profile('profile-a', { workItems: [{ id: 'task-a', type: 'task', attachmentAssetIds: [workAsset.id] }] }) as any,
        profile('profile-b', { inventoryItems: [{ id: 'inventory-b', name: 'Imported collection', purchaseDate: futureDate(3), photoAssetIds: [collectionAsset.id] }] }) as any,
      ],
      currentProfileId: 'profile-a',
    });

    const backup = await createCompleteBackup();
    const archive = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    const mediaIndex = JSON.parse(strFromU8(archive['media/index.json'])) as Array<{ id: string }>;
    expect(mediaIndex.map(asset => asset.id)).toEqual(expect.arrayContaining([workAsset.id, collectionAsset.id]));

    await resetCaizenDatabaseForTests();
    await restoreCompleteBackup(backup, 'replace');
    const restored = await loadAppState();
    expect(restored?.profiles.find(item => item.id === 'profile-a')?.workItems[0]).toMatchObject({ attachmentAssetIds: [workAsset.id] });
    expect(restored?.profiles.find(item => item.id === 'profile-b')?.inventoryItems[0]).toMatchObject({ photoAssetIds: [collectionAsset.id] });
    expect(await getMediaAsset(workAsset.id)).toMatchObject({ profileId: 'profile-a' });
    expect(await getMediaAsset(collectionAsset.id)).toMatchObject({ profileId: 'profile-b' });
  });

  it('keeps the final copy and UI boundaries explicit in source', () => {
    const vault = readFileSync('components/sections/PersonalVaultSection.tsx', 'utf8');
    const vaultModal = readFileSync('components/modals/PersonalVaultModal.tsx', 'utf8');
    const work = readFileSync('components/work/WorkAttachmentsField.tsx', 'utf8');
    const money = readFileSync('components/balance/UpcomingMoneyPanel.tsx', 'utf8');
    const search = readFileSync('lib/global-search.ts', 'utf8');
    const cloud = readFileSync('components/modals/CloudSyncModal.tsx', 'utf8');

    expect(vault).toContain('Caizen is not a password manager');
    expect(vaultModal).toContain('not encryption');
    expect(work).toContain('role="alert"');
    expect(work).toContain("aria-label={`Remove ${row.asset?.fileName || 'unavailable attachment'}`}");
    expect(money).toContain('Due dates, amounts, and planned status never create reminders automatically.');
    expect(search).not.toContain('attachmentAssetIds');
    expect(search).not.toContain('fileName');
    expect(cloud).toContain('currentProfileId');
    expect(readFileSync('components/settings/SettingsDataPanel.tsx', 'utf8')).toContain('profile-scoped and is not live sync');
  });
});
