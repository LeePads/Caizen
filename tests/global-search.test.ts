import { describe, expect, it } from 'vitest';
import {
  isGlobalSearchResultAvailable,
  searchProfileRecords,
} from '@/lib/global-search';
import type { Profile } from '@/lib/types';

describe('privacy-safe global record search', () => {
  it('finds local records by metadata and returns deep-link hints', () => {
    const profile = {
      productivityItems: [{ id: 'task-1', title: 'Renew passport', type: 'task', status: 'pending' }],
      importantDates: [{ id: 'date-1', title: 'Passport appointment', type: 'event' }],
      journalEntries: [{ id: 'journal-1', title: 'Travel planning', mood: 'focused', content: 'private body text' }],
    } as unknown as Profile;

    const results = searchProfileRecords(profile, 'passport');
    expect(results.map(result => result.recordId)).toEqual(['date-1', 'task-1']);
    expect(results[0]).toMatchObject({ section: 'lifehub', feature: 'dates' });
  });

  it('does not search private journal or vault bodies by default', () => {
    const profile = {
      journalEntries: [{ id: 'journal-1', title: 'Weekly note', content: 'secret passport number' }],
      personalVaultItems: [{ id: 'vault-1', title: 'Travel folder', notes: 'secret passport number' }],
    } as unknown as Profile;

    expect(searchProfileRecords(profile, 'secret passport')).toEqual([]);
  });

  it('ranks an exact record title above shared category metadata', () => {
    const profile = {
      productivityItems: [
        { id: 'task-1', title: 'Renew passport', type: 'task', status: 'pending' },
        { id: 'task-2', title: 'Travel checklist', type: 'task', status: 'pending' },
      ],
      journalEntries: [{ id: 'journal-1', title: 'Passport appointment', mood: 'focused' }],
    } as unknown as Profile;

    expect(searchProfileRecords(profile, 'Passport appointment')[0]).toMatchObject({
      recordId: 'journal-1',
      recordType: 'journal-entry',
    });
  });

  it('covers the canonical local record domains without private bodies', () => {
    const profile = {
      wallets: [{ id: 'wallet-1', name: 'Daily spending', type: 'free_spending' }],
      upcomingMoneyItems: [{ id: 'money-1', title: 'Pay rent', direction: 'outgoing', amount: 1000 }],
      inventoryItems: [{ id: 'inventory-1', name: 'Camera', category: 'electronics' }],
      wishlistItems: [{ id: 'wish-1', name: 'Noise cancelling headphones', category: 'tech' }],
      games: [{ id: 'game-1', title: 'Hades', status: 'playing' }],
      gameGuides: [{ id: 'guide-1', title: 'Hades build guide', category: 'builds' }],
      mediaItems: [{ id: 'media-1', title: 'The Bear', type: 'series', status: 'planned' }],
      musicItems: [{ id: 'music-1', title: 'Focus Mix', type: 'playlist' }],
      personalVaultItems: [{ id: 'vault-1', title: 'Passport folder', type: 'document', notes: 'private' }],
      skincareProducts: [{ id: 'skin-1', name: 'Daily cleanser', category: 'Face', frequency: 'Daily', schedule: 'morning' }],
      supplements: [{ id: 'supp-1', name: 'Vitamin D', type: 'vitamin' }],
      health: {
        weightEntries: [{ id: 'weight-1', weightKg: 70, date: new Date('2026-01-01') }],
        foodEntries: [{ id: 'food-1', name: 'Oatmeal', mealType: 'breakfast', date: new Date('2026-01-01') }],
        activityEntries: [{ id: 'activity-1', activity: 'Morning run', date: new Date('2026-01-01') }],
        sleepEntries: [{ id: 'sleep-1', hours: 8, date: new Date('2026-01-01') }],
        workoutPlans: [{ id: 'plan-1', name: 'Strength plan' }],
        foodTemplates: [{ id: 'food-template-1', name: 'Oats' }],
        mealTemplates: [{ id: 'meal-template-1', name: 'Quick breakfast', mealType: 'breakfast', rows: [] }],
      },
    } as unknown as Profile;

    const resultTypes = new Set(
      searchProfileRecords(profile, 'daily').map(result => result.recordType),
    );
    expect(resultTypes).toContain('wallet');
    expect(searchProfileRecords(profile, 'private')).toEqual([]);
    expect(searchProfileRecords(profile, 'camera')[0]).toMatchObject({ section: 'inventory' });
    expect(searchProfileRecords(profile, 'Hades build')[0]).toMatchObject({
      recordId: 'guide-1',
      section: 'entertainment',
      feature: 'game-guide',
    });
  });

  it('checks stale results against the active profile before navigation', () => {
    const profile = {
      inventoryItems: [{ id: 'inventory-1', name: 'Camera' }],
    } as unknown as Profile;
    const result = searchProfileRecords(profile, 'camera')[0];

    expect(isGlobalSearchResultAvailable(profile, result)).toBe(true);
    expect(isGlobalSearchResultAvailable(
      { inventoryItems: [] } as unknown as Profile,
      result,
    )).toBe(false);
  });

  it('searches safe Work Hub metadata without indexing private bodies or reference links', () => {
    const profile = {
      workItems: [{
        id: 'bug-1',
        type: 'note',
        title: 'Checkout regression',
        status: 'active',
        projectId: 'project-1',
        description: 'The checkout button fails after an expired session.',
        stepsToReproduce: 'Open checkout and let the session expire.',
        ticketLink: 'https://tracker.example/CAI-123',
      }],
    } as unknown as Profile;

    expect(searchProfileRecords(profile, 'Checkout regression')[0]).toMatchObject({
      recordId: 'bug-1',
      section: 'workhub',
      feature: 'work-item',
    });
    expect(searchProfileRecords(profile, 'CAI-123')).toEqual([]);
    expect(searchProfileRecords(profile, 'checkout button')).toEqual([]);
    expect(isGlobalSearchResultAvailable(profile, searchProfileRecords(profile, 'Checkout regression')[0])).toBe(true);
  });

  it('keeps managed Work attachment filenames and content out of Search', () => {
    const profile = {
      workItems: [{
        id: 'task-attachment',
        type: 'task',
        title: 'Prepare release notes',
        status: 'active',
        attachmentAssetIds: ['asset-work-1'],
      }],
    } as unknown as Profile;

    expect(searchProfileRecords(profile, 'report.pdf')).toEqual([]);
    expect(searchProfileRecords(profile, 'private attachment text')).toEqual([]);
    expect(searchProfileRecords(profile, 'Prepare release notes')[0]).toMatchObject({
      recordId: 'task-attachment',
      recordType: 'work-item',
    });
  });
});

