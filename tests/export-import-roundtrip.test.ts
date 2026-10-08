import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  createCompleteBackup,
  createDataOnlyExport,
  previewDataOnlyImport,
  restoreDataOnlyImport,
} from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

/**
 * The coverage hole that let the "[object Object]" bug ship: every existing
 * import fixture hands `prepareImport` pre-stringified ISO strings, so nothing
 * ever exercised the real exporter. Live app state holds actual `Date`
 * instances (IndexedDB structured-clone preserves them), which is what the
 * exporter has to survive.
 */

const withDates = () =>
  ({
    id: 'profile-roundtrip',
    name: 'Roundtrip',
    createdAt: new Date('2024-01-15T08:00:00+08:00'),
    wallets: [],
    transactions: [
      { id: 'tx-1', date: new Date('2026-03-05T00:00:00Z'), createdAt: new Date('2026-03-05T09:30:00Z'), amount: 100 },
      { id: 'tx-2', date: new Date('2026-04-18T00:00:00Z'), createdAt: new Date('2026-04-18T11:00:00Z'), amount: 250 },
    ],
    financialCategories: [{
      id: 'food',
      type: 'expense',
      name: 'Food',
      icon: 'utensils',
      total: '0',
      kind: 'neutral',
      subcategories: [{ id: 'dining', name: 'Dining', total: '0', icon: 'coffee' }],
    }],
    budgets: [{
      id: 'budget-food',
      month: '2026-08',
      categoryId: 'food',
      allocated: 8000,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    }],
    balanceProjectionRows: [{
      id: 'recurring-rent',
      label: 'Rent',
      amount: '12000',
      allocated: '',
      type: 'expense',
      active: true,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      recurrence: {
        frequency: 'monthly',
        startDateKey: '2026-08-01',
        nextDueDateKey: '2026-08-01',
        walletId: 'cash',
        categoryId: 'food',
      },
    }],
    inventoryItems: [
      { id: 'inv-1', storageLocation: 'Bedroom Cabinet', purchaseDate: new Date('2025-11-02T00:00:00Z'), createdAt: new Date('2025-11-02T02:00:00Z') },
    ],
    wishlistItems: [],
    journalEntries: [
      { id: 'j-1', date: new Date('2026-06-30T00:00:00Z'), createdAt: new Date('2026-06-30T22:00:00Z') },
    ],
    games: [],
    gameGuides: [],
    productivityItems: [],
    mediaItems: [{
      id: 'media-roundtrip',
      title: 'Calendar title',
      type: 'series',
      status: 'planned',
      catalogProvider: 'tmdb',
      catalogId: '123',
      nextEpisodeDate: '2026-08-23',
      nextEpisodeAt: null,
      releaseHistory: [{
        id: 'tmdb:123:s1:e7',
        source: 'tmdb',
        seasonNumber: 1,
        unitNumber: 7,
        date: '2026-08-20',
        precision: 'date',
      }],
      createdAt: new Date('2026-01-15T08:00:00Z'),
    }],
    musicItems: [],
    workItems: [{
      id: 'work-note-custom',
      type: 'note',
      title: 'Client update',
      status: 'draft',
      noteType: 'other',
      workTypeId: 'type-client-update',
      workCategoryId: 'category-client',
      workCategoryLabel: 'Client',
      customFieldValues: {
        'field-follow-up': '2026-08-10',
        'field-contacted': false,
        'legacy-field': ['unknown-option'],
      },
      createdAt: new Date('2026-08-09T08:00:00Z'),
    }],
    moduleTaxonomies: {
      work: [{ id: 'category-client', name: 'Client', subcategories: [] }],
    },
    workTypes: [{
      id: 'type-client-update',
      name: 'Client Update',
      kind: 'note',
      fields: [
        { id: 'field-follow-up', label: 'Follow-up date', type: 'date', width: 'half' },
        { id: 'field-contacted', label: 'Contacted', type: 'checkbox', width: 'half' },
      ],
    }],
    personalVaultItems: [
      {
        id: 'vault-pv-d1',
        type: 'document',
        title: 'Passport renewal',
        date: new Date('2026-09-20T00:00:00Z'),
        expiryDate: new Date('2030-09-20T00:00:00Z'),
        notes: 'Sensitive private note',
        showTitleInPlanning: true,
        createdAt: new Date('2026-01-15T08:00:00Z'),
      },
    ],
    trashItems: [],
    skincareProducts: [],
    dailyChecklistItems: [],
    importantDates: [],
    supplements: [],
    balanceCheckIns: [],
    feedbackPreferences: {
      showToasts: false,
      showRewardDetails: true,
    },
    health: {
      weightEntries: [
        // 2024 is a leap year; 2026 is not.
        { id: 'w-1', date: new Date('2024-02-29T00:00:00Z'), createdAt: new Date('2024-02-29T07:00:00Z') },
      ],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],
      mealTemplates: [],
      activityEntries: [],
      fastingSessions: [{
        id: 'fast-roundtrip',
        startedAt: new Date('2026-08-20T08:00:00+08:00'),
        endedAt: new Date('2026-08-20T20:00:00+08:00'),
        targetMinutes: 720,
        createdAt: new Date('2026-08-20T08:00:00+08:00'),
        updatedAt: new Date('2026-08-20T20:00:00+08:00'),
      }],
      sleepTargetMinutes: 480,
      targetExerciseMinutesPerWeek: 150,
      workoutEntries: [],
      sleepEntries: [{
        id: 'sleep-roundtrip',
        date: new Date('2026-07-19T00:00:00Z'),
        hours: 7.6,
        sleepDurationMinutes: 456,
        bedTime: '23:47',
        wakeTime: '07:23',
        sleepScore: 88,
        timesAwakened: 2,
        createdAt: new Date('2026-07-19T08:00:00Z'),
      }],
      noXTrackers: [],
    },
     
  }) as any;

const seed = async () => {
  await saveAppState({ profiles: [withDates()], currentProfileId: 'profile-roundtrip' });
};

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('export -> import round trip with live Date objects', () => {
  it('never serialises a Date as an empty object in the data-only export', async () => {
    await seed();
    const blob = await createDataOnlyExport();
    const text = await blob.text();

    expect(text).not.toContain('"createdAt": {}');
    expect(text).not.toContain('"date": {}');

    const payload = JSON.parse(text);
    const exported = payload.data.profiles[0];
    expect(typeof exported.createdAt).toBe('string');
    expect(exported.inventoryItems[0].storageLocation).toBe('Bedroom Cabinet');
    expect(exported.transactions[0].date).toBe('2026-03-05T00:00:00.000Z');
    expect(exported.transactions[1].date).toBe('2026-04-18T00:00:00.000Z');
    expect(exported.health.weightEntries[0].date).toBe('2024-02-29T00:00:00.000Z');
    expect(exported.health.fastingSessions[0]).toMatchObject({
      id: 'fast-roundtrip',
      startedAt: '2026-08-20T00:00:00.000Z',
      endedAt: '2026-08-20T12:00:00.000Z',
      targetMinutes: 720,
    });
    expect(exported.health.sleepEntries[0]).toMatchObject({
      sleepDurationMinutes: 456,
      bedTime: '23:47',
      wakeTime: '07:23',
      sleepScore: 88,
      timesAwakened: 2,
    });
    expect(exported.health).toMatchObject({
      sleepTargetMinutes: 480,
      targetExerciseMinutesPerWeek: 150,
    });
    expect(exported.mediaItems[0]).toMatchObject({
      nextEpisodeDate: '2026-08-23',
      nextEpisodeAt: null,
      releaseHistory: [{
        id: 'tmdb:123:s1:e7',
        source: 'tmdb',
        seasonNumber: 1,
        unitNumber: 7,
        date: '2026-08-20',
        precision: 'date',
      }],
    });
    expect(exported.personalVaultItems[0].showTitleInPlanning).toBe(true);
    expect(exported.feedbackPreferences).toEqual({ showToasts: false, showRewardDetails: true });
    expect(exported.workTypes).toMatchObject([{ id: 'type-client-update', name: 'Client Update' }]);
    expect(exported.moduleTaxonomies.work).toMatchObject([{ id: 'category-client', name: 'Client' }]);
    expect(exported.workItems.find((item: any) => item.id === 'work-note-custom')).toMatchObject({
      workTypeId: 'type-client-update',
      workCategoryId: 'category-client',
      customFieldValues: {
        'field-follow-up': '2026-08-10',
        'field-contacted': false,
        'legacy-field': ['unknown-option'],
      },
    });
    expect(exported.budgets[0]).toMatchObject({ id: 'budget-food', month: '2026-08', categoryId: 'food', allocated: 8000 });
    expect(exported.financialCategories[0]).toMatchObject({
      id: 'food',
      icon: 'utensils',
      subcategories: [{ id: 'dining', icon: 'coffee' }],
    });
    expect(exported.balanceProjectionRows[0]).toMatchObject({
      id: 'recurring-rent',
      recurrence: { frequency: 'monthly', nextDueDateKey: '2026-08-01', walletId: 'cash' },
    });
  });

  it('never serialises a Date as an empty object in the .caizen archive', async () => {
    await seed();
    const blob = await createCompleteBackup();
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const data = JSON.parse(strFromU8(archive['data.json']));
    const exported = data.profiles[0];

    expect(typeof exported.createdAt).toBe('string');
    expect(exported.inventoryItems[0].purchaseDate).toBe('2025-11-02T00:00:00.000Z');
    expect(exported.inventoryItems[0].storageLocation).toBe('Bedroom Cabinet');
    expect(exported.journalEntries[0].date).toBe('2026-06-30T00:00:00.000Z');
    expect(exported.personalVaultItems[0].showTitleInPlanning).toBe(true);
    expect(exported.mediaItems[0].nextEpisodeDate).toBe('2026-08-23');
    expect(exported.feedbackPreferences).toEqual({ showToasts: false, showRewardDetails: true });
    expect(exported.workTypes).toMatchObject([{ id: 'type-client-update', name: 'Client Update' }]);
    expect(exported.workItems.find((item: any) => item.id === 'work-note-custom')).toMatchObject({
      workTypeId: 'type-client-update',
      customFieldValues: { 'field-follow-up': '2026-08-10', 'field-contacted': false },
    });
  });

  it('re-imports its own export with no invalid dates and keeps every date distinct', async () => {
    await seed();
    const text = await (await createDataOnlyExport()).text();
    const prepared = await previewDataOnlyImport(text);

    const objectObject = prepared.report.dateIssues.filter((issue) =>
      issue.message.includes('[object Object]'),
    );
    expect(objectObject).toEqual([]);
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(prepared.report.missingDateCount).toBe(0);
    expect(prepared.report.canImport).toBe(true);
    expect((prepared.state.profiles[0] as any).budgets[0]).toMatchObject({ id: 'budget-food', month: '2026-08', allocated: 8000 });
    expect((prepared.state.profiles[0] as any).financialCategories[0]).toMatchObject({
      icon: 'utensils',
      subcategories: [{ id: 'dining', icon: 'coffee' }],
    });
    expect((prepared.state.profiles[0] as any).balanceProjectionRows[0]).toMatchObject({
      id: 'recurring-rent',
      recurrence: { frequency: 'monthly', nextDueDateKey: '2026-08-01' },
    });
    expect((prepared.state.profiles[0] as any).feedbackPreferences).toEqual({ showToasts: false, showRewardDetails: true });
    expect((prepared.state.profiles[0] as any).workTypes).toMatchObject([{ id: 'type-client-update', name: 'Client Update' }]);
    expect((prepared.state.profiles[0] as any).moduleTaxonomies.work).toMatchObject([{ id: 'category-client', name: 'Client' }]);
    expect((prepared.state.profiles[0] as any).workItems.find((item: any) => item.id === 'work-note-custom')).toMatchObject({
      workTypeId: 'type-client-update',
      workCategoryId: 'category-client',
      customFieldValues: {
        'field-follow-up': '2026-08-10',
        'field-contacted': false,
        'legacy-field': ['unknown-option'],
      },
    });
    expect((prepared.state.profiles[0] as any).health.sleepEntries[0]).toMatchObject({
      sleepDurationMinutes: 456,
      hours: 7.6,
      sleepScore: 88,
      timesAwakened: 2,
    });
    expect((prepared.state.profiles[0] as any).health).toMatchObject({
      sleepTargetMinutes: 480,
      targetExerciseMinutesPerWeek: 150,
    });
    expect((prepared.state.profiles[0] as any).health.fastingSessions[0]).toMatchObject({
      id: 'fast-roundtrip',
      targetMinutes: 720,
    });
    expect((prepared.state.profiles[0] as any).mediaItems[0]).toMatchObject({
      nextEpisodeDate: '2026-08-23',
      nextEpisodeAt: null,
      releaseHistory: [{
        id: 'tmdb:123:s1:e7',
        source: 'tmdb',
        seasonNumber: 1,
        unitNumber: 7,
        date: '2026-08-20',
        precision: 'date',
      }],
    });

    const imported = prepared.state.profiles[0] as Record<string, any>;
    const transactionDates = imported.transactions.map((row: any) => row.date);
    expect(new Set(transactionDates).size).toBe(2);
    expect(imported.personalVaultItems[0].showTitleInPlanning).toBe(true);
    expect(prepared.report.earliestDate).not.toBeNull();
    expect(prepared.report.latestDate).not.toBeNull();
    expect(prepared.report.earliestDate).not.toBe(prepared.report.latestDate);
  });

  it('restores the planning opt-in through the transactional import path', async () => {
    await seed();
    const prepared = await previewDataOnlyImport(await (await createDataOnlyExport()).text());

    await restoreDataOnlyImport(prepared, 'replace');

    const restored = await loadAppState();
    expect(restored?.profiles[0].personalVaultItems[0].showTitleInPlanning).toBe(true);
    expect(restored?.profiles[0].personalVaultItems[0].notes).toBe('Sensitive private note');
    expect(restored?.profiles[0].workTypes).toMatchObject([{ id: 'type-client-update', name: 'Client Update' }]);
    expect(restored?.profiles[0].workItems.find(item => item.id === 'work-note-custom')).toMatchObject({
      customFieldValues: {
        'field-follow-up': '2026-08-10',
        'field-contacted': false,
        'legacy-field': ['unknown-option'],
      },
    });
  });
});
