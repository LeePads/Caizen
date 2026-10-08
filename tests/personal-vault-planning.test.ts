import { describe, expect, it } from 'vitest';

import {
  isGlobalSearchResultAvailable,
  searchProfileRecords,
} from '@/lib/global-search';
import { buildLifeHubCalendarEvents } from '@/lib/lifehub/calendar-events';
import { normalizePersonalVaultItems } from '@/lib/personal-vault/normalization';
import { personalVaultPlanningProjection } from '@/lib/personal-vault/planning';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { PersonalVaultItem, Profile } from '@/lib/types';

const date = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12);

const item = (overrides: Partial<PersonalVaultItem> = {}): PersonalVaultItem => ({
  id: 'vault-visible',
  type: 'document',
  subType: 'identity-government',
  title: 'Passport renewal',
  date: date(2026, 8, 31),
  expiryDate: null,
  notes: 'secret reference value and private body',
  link: 'https://private.example/reference',
  referenceHint: 'masked secret',
  favorite: false,
  showTitleInPlanning: true,
  createdAt: date(2026, 1, 1),
  ...overrides,
});

const calendarOptions = {
  rangeStart: date(2026, 8, 1),
  rangeEnd: date(2026, 9, 30),
  filters: { vault: true },
};

describe('Personal Vault PV-D1 planning privacy', () => {
  it('defaults legacy, explicit false, and malformed values to hidden', () => {
    const normalized = normalizePersonalVaultItems([
      { id: 'legacy', type: 'document', title: 'Legacy', date: '2026-08-31' },
      { id: 'false', type: 'document', title: 'False', date: '2026-08-31', showTitleInPlanning: false },
      { id: 'string', type: 'document', title: 'String', date: '2026-08-31', showTitleInPlanning: 'true' },
      { id: 'number', type: 'document', title: 'Number', date: '2026-08-31', showTitleInPlanning: 1 },
    ]);

    expect(normalized.map(entry => entry.showTitleInPlanning)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(normalizePersonalVaultItems(normalized)).toEqual(normalized);
    expect(normalized.every(entry => personalVaultPlanningProjection(entry) === null)).toBe(true);
  });

  it('projects only the opted-in title, type, identity, and planning dates', () => {
    const visible = item({ expiryDate: date(2026, 9, 15) });
    const projection = personalVaultPlanningProjection(visible);

    expect(projection).toEqual({
      id: 'vault-visible',
      title: 'Passport renewal',
      type: 'document',
      date: date(2026, 8, 31),
      expiryDate: date(2026, 9, 15),
    });
    expect(projection).not.toHaveProperty('notes');
    expect(projection).not.toHaveProperty('link');
    expect(projection).not.toHaveProperty('referenceHint');

    const events = buildLifeHubCalendarEvents({
      ...calendarOptions,
      personalVaultItems: [visible],
    });
    expect(events).toEqual([{
      id: 'vault:vault-visible',
      recordId: 'vault-visible',
      title: 'Passport renewal expires',
      date: date(2026, 9, 15),
      type: 'vault expiry',
      source: 'vault',
      section: 'vault',
      priority: 'medium',
    }]);
  });

  it('keeps private, undated, deleted, and other-profile records out of planning', () => {
    const visibleA = item({ id: 'profile-a-visible', title: 'Profile A title' });
    const privateA = item({ id: 'profile-a-private', title: 'Profile A private', showTitleInPlanning: false });
    const visibleB = item({ id: 'profile-b-visible', title: 'Profile B title' });

    const profileAEvents = buildLifeHubCalendarEvents({
      ...calendarOptions,
      personalVaultItems: [visibleA, privateA],
    });
    const profileBEvents = buildLifeHubCalendarEvents({
      ...calendarOptions,
      personalVaultItems: [visibleB],
    });
    const afterDeleteEvents = buildLifeHubCalendarEvents({
      ...calendarOptions,
      personalVaultItems: [],
    });

    expect(profileAEvents.map(event => event.recordId)).toEqual(['profile-a-visible']);
    expect(profileAEvents[0].title).toBe('Profile A title');
    expect(profileBEvents.map(event => event.recordId)).toEqual(['profile-b-visible']);
    expect(profileBEvents.some(event => event.title === 'Profile A title')).toBe(false);
    expect(afterDeleteEvents).toEqual([]);
    expect(buildLifeHubCalendarEvents({
      ...calendarOptions,
      personalVaultItems: [item({ id: 'undated', date: null })],
    })).toEqual([]);
  });

  it('round-trips explicit values through import preparation and restore normalization', () => {
    const prepared = prepareImport({
      currentProfileId: 'profile-a',
      profiles: [{
        id: 'profile-a',
        personalVaultItems: [
          { id: 'true', type: 'document', title: 'Visible', date: '2026-08-31', showTitleInPlanning: true },
          { id: 'false', type: 'document', title: 'Hidden', date: '2026-08-31', showTitleInPlanning: false },
          { id: 'legacy', type: 'document', title: 'Legacy', date: '2026-08-31' },
          { id: 'malformed', type: 'document', title: 'Malformed', date: '2026-08-31', showTitleInPlanning: 'yes' },
        ],
      }],
    });
    const imported = prepared.state.profiles[0].personalVaultItems;

    expect(prepared.report.canImport).toBe(true);
    expect(imported.map(entry => entry.showTitleInPlanning)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(JSON.parse(JSON.stringify(imported[0])).showTitleInPlanning).toBe(true);
    expect(normalizePersonalVaultItems([imported[0]])[0].showTitleInPlanning).toBe(true);
  });

  it('keeps planning opt-in independent from Vault Search privacy and exact identity', () => {
    const profile = {
      personalVaultItems: [item()],
    } as unknown as Profile;
    const titleResult = searchProfileRecords(profile, 'Passport renewal')[0];

    expect(titleResult).toMatchObject({
      recordId: 'vault-visible',
      recordType: 'personal-item',
      section: 'personalhub',
    });
    expect(searchProfileRecords(profile, 'secret reference')).toEqual([]);
    expect(searchProfileRecords(profile, 'masked secret')).toEqual([]);
    expect(isGlobalSearchResultAvailable(profile, titleResult)).toBe(true);
    expect(isGlobalSearchResultAvailable({ personalVaultItems: [] } as unknown as Profile, titleResult)).toBe(false);
  });
});
