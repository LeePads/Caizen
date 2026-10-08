import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  claimRequestSignal,
  getProfileBoundSectionRequest,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';
import {
  normalizeImportantDateItem,
  normalizeProductivityItem,
  normalizeRoutineItem,
} from '@/lib/lifehub/normalization';
import { isRoutineDueForDate } from '@/lib/lifehub/routine-schedule';
import {
  normalizeLoadedProfile,
  type ProfileNormalizationAdapters,
} from '@/lib/profile/normalize-profile';
import { normalizePet } from '@/lib/pets/normalization';
import { prepareImport } from '@/lib/storage/import-integrity';
import { searchProfileRecords } from '@/lib/global-search';
import type { Profile } from '@/lib/types';

const adapters: ProfileNormalizationAdapters = {
  normalizeInventoryItem: item => item,
  normalizeProductivityItem,
  normalizeRoutineItem,
  normalizeImportantDateItem,
  normalizeHealth: value => (value || {}) as Profile['health'],
  normalizePet,
  normalizeMediaItem: item => item,
};

const baseProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-a',
  name: 'Profile A',
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
  personalVaultTaxonomy: [],
  trashItems: [],
  skincareProducts: [],
  dailyChecklistItems: [],
  importantDates: [],
  supplements: [],
  balanceProjectionRows: [],
  financialCategories: [],
  balanceCheckIns: [],
  health: {},
  ...overrides,
});

describe('Audit #19 profile-bound one-shot request lifecycle', () => {
  it('requires hydration, destination profile, and destination section before delivery', () => {
    const request = {
      section: 'journal',
      feature: 'journal-entry',
      recordId: 'journal-a',
      signal: 12,
      profileId: 'profile-a',
    };

    expect(getProfileBoundSectionRequest(request, 'journal', 'profile-a')).toEqual(request);
    expect(getProfileBoundSectionRequest(request, 'journal', 'profile-b')).toBeNull();
    expect(getProfileBoundSectionRequest(request, 'workhub', 'profile-a')).toBeNull();
    expect(isProfileBoundRequestReady({
      isHydrated: false,
      requestedProfileId: 'profile-a',
      currentProfileId: 'profile-a',
      signal: 12,
    })).toBe(false);
    expect(isProfileBoundRequestReady({
      isHydrated: true,
      requestedProfileId: 'profile-b',
      currentProfileId: 'profile-a',
      signal: 12,
    })).toBe(false);
    expect(isProfileBoundRequestReady({
      isHydrated: true,
      requestedProfileId: 'profile-a',
      currentProfileId: 'profile-a',
      signal: 12,
    })).toBe(true);
  });

  it('claims a signal once and permits a later request signal', () => {
    const ref = { current: null as number | null };
    expect(claimRequestSignal(ref, 4)).toBe(true);
    expect(claimRequestSignal(ref, 4)).toBe(false);
    expect(claimRequestSignal(ref, 5)).toBe(true);
  });

  it('keeps Search exact-record identity across Journal, Work Hub, Life Hub, and Health', () => {
    const profile = baseProfile({
      journalEntries: [{ id: 'journal-a', title: 'Journal exact sentinel', date: '2026-08-13' }],
      workItems: [{ id: 'work-a', type: 'task', title: 'Work exact sentinel' }],
      productivityItems: [{ id: 'task-a', title: 'Life exact sentinel', type: 'task', status: 'pending' }],
      health: {
        foodEntries: [{ id: 'food-a', name: 'Health exact sentinel', mealType: 'lunch', date: '2026-08-13' }],
      },
    });

    expect(searchProfileRecords(profile as any, 'Journal exact sentinel')[0]).toMatchObject({
      section: 'lifehub', recordId: 'journal-a', feature: 'journal-entry',
    });
    expect(searchProfileRecords(profile as any, 'Work exact sentinel')[0]).toMatchObject({
      section: 'workhub', recordId: 'work-a', feature: 'work-item',
    });
    expect(searchProfileRecords(profile as any, 'Life exact sentinel')[0]).toMatchObject({
      section: 'lifehub', recordId: 'task-a', feature: 'tasks',
    });
    expect(searchProfileRecords(profile as any, 'Health exact sentinel')[0]).toMatchObject({
      section: 'health', recordId: 'food-a', feature: 'food-entry',
    });
  });
});

describe('Audit #19 Life Hub finite-safe normalization', () => {
  it('normalizes malformed productivity numerics without leaking NaN or Infinity', () => {
    const normalized = normalizeProductivityItem({
      id: 'task-a',
      title: 'Finite task',
      type: 'task',
      status: 'pending',
      progress: 'Infinity',
      deferCount: '-Infinity',
      estimatedMinutes: 'not-a-number',
      reminderLeadMinutes: Number.POSITIVE_INFINITY,
      createdAt: '2026-08-13T09:00:00.000Z',
    });

    expect(normalized.progress).toBeUndefined();
    expect(normalized.deferCount).toBe(0);
    expect(normalized.estimatedMinutes).toBe(1);
    expect(normalized.reminderLeadMinutes).toBeUndefined();
    expect([normalized.deferCount, normalized.estimatedMinutes].every(Number.isFinite)).toBe(true);
    expect(normalizeProductivityItem(normalized)).toEqual(normalized);
  });

  it('normalizes routine boundaries while preserving recurrence and history meaning', () => {
    const normalized = normalizeRoutineItem({
      id: 'routine-a',
      title: 'Every three days',
      frequency: 'every_x_days',
      intervalDays: '3',
      dayOfMonth: '99',
      targetCount: 'Infinity',
      completionCount: 'NaN',
      weekdays: [1, '2', 8, Number.NaN],
      completionHistory: [{ date: '2026-08-13', status: 'done' }],
      anchorDate: '2026-08-13',
      createdAt: '2026-08-13T09:00:00.000Z',
    });

    expect(normalized.intervalDays).toBe(3);
    expect(normalized.dayOfMonth).toBe(31);
    expect(normalized.targetCount).toBe(1);
    expect(normalized.completionCount).toBe(1);
    expect(normalized.weekdays).toEqual([1]);
    expect(isRoutineDueForDate(normalized, new Date('2026-08-16T12:00:00'))).toBe(true);
    expect(isRoutineDueForDate(normalized, new Date('2026-08-17T12:00:00'))).toBe(false);
    expect(normalizeRoutineItem(normalized)).toEqual(normalized);
  });

  it('normalizes important-date amount and reminder fields to deterministic finite values', () => {
    const normalized = normalizeImportantDateItem({
      id: 'date-a',
      title: 'Renewal',
      type: 'renewal',
      date: '2026-08-31',
      amount: '-12.50',
      customReminderDays: Number.POSITIVE_INFINITY,
      createdAt: '2026-08-13T09:00:00.000Z',
    });

    expect(normalized.amount).toBe(0);
    expect(normalized.customReminderDays).toBeUndefined();
    expect(normalizeImportantDateItem(normalized)).toEqual(normalized);
  });

  it('uses the same finite-safe boundary for malformed imported and reloaded profiles', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'profile-a',
        profiles: [baseProfile({
          productivityItems: [{
            id: 'imported-task', title: 'Imported task', type: 'task', status: 'pending',
            progress: 'NaN', deferCount: 'Infinity', estimatedMinutes: 'Infinity',
            createdAt: '2026-08-13T09:00:00.000Z',
          }],
          dailyChecklistItems: [{
            id: 'imported-routine', title: 'Imported routine', frequency: 'every_x_days',
            intervalDays: 'Infinity', anchorDate: '2026-08-13', createdAt: '2026-08-13T09:00:00.000Z',
          }],
          importantDates: [{
            id: 'imported-date', title: 'Imported date', type: 'renewal', date: '2026-08-31',
            amount: 'Infinity', createdAt: '2026-08-13T09:00:00.000Z',
          }],
        })],
      },
    });

    expect(prepared.report.canImport).toBe(true);
    const hydrated = normalizeLoadedProfile(prepared.state.profiles[0], adapters, new Date('2026-08-13T12:00:00.000Z'));
    const reloaded = normalizeLoadedProfile(hydrated, adapters, new Date('2026-08-13T12:00:00.000Z'));
    expect(hydrated.productivityItems[0]).toMatchObject({ deferCount: 0, estimatedMinutes: 1 });
    expect(hydrated.dailyChecklistItems[0].intervalDays).toBe(1);
    expect(hydrated.importantDates[0].amount).toBeUndefined();
    expect(reloaded.productivityItems[0]).toEqual(hydrated.productivityItems[0]);
    expect(reloaded.dailyChecklistItems[0]).toEqual(hydrated.dailyChecklistItems[0]);
    expect(reloaded.importantDates[0]).toEqual(hydrated.importantDates[0]);
  });
});

describe('Audit #19 source wiring', () => {
  it('keeps the canonical request lifecycle on all four affected consumers', () => {
    const page = readFileSync('app/app/page.tsx', 'utf8');
    const journal = readFileSync('components/sections/JournalSection.tsx', 'utf8');
    const work = readFileSync('components/sections/WorkHubSection.tsx', 'utf8');
    const lifeHub = readFileSync('components/sections/LifeHubSection.tsx', 'utf8');
    const health = readFileSync('components/sections/HealthSection.tsx', 'utf8');

    expect(page).toContain('getProfileBoundSectionRequest');
    expect(page).toContain('sectionFeatureRequestSignalRef');
    expect(page).toContain('signal: nextSectionFeatureRequestSignal()');
    expect(page).not.toContain('signal: (current?.signal ?? 0) + 1');
    for (const source of [journal, work, lifeHub, health]) {
      expect(source).toContain('isProfileBoundRequestReady');
      expect(source).toContain('claimRequestSignal');
      expect(source).toContain('onRequested');
    }
    expect(journal).toContain('requestedProfileId');
    expect(work).toContain('requestedProfileId');
    expect(lifeHub).toContain('requestedProfileId');
    expect(health).toContain('requestedProfileId');
    expect(lifeHub).toContain('onRequestedViewConsumed?.(requestedViewSignal)');
  });
});
