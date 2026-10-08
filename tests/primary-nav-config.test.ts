import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIMARY_NAV_TABS,
  sanitizePrimaryNavTabs,
} from '@/lib/native/primary-nav-config';

const validIds = [
  'dashboard', 'health', 'journal', 'lifehub', 'music',
  'balance', 'inventory', 'wishlist', 'workhub', 'personal',
];

describe('configurable main navigation validation', () => {
  it('accepts a valid reordered selection of 3-5 destinations', () => {
    expect(sanitizePrimaryNavTabs(['music', 'balance', 'dashboard'], validIds))
      .toEqual(['music', 'balance', 'dashboard']);
    expect(sanitizePrimaryNavTabs(['dashboard', 'health', 'journal', 'lifehub', 'music'], validIds))
      .toEqual(['dashboard', 'health', 'journal', 'lifehub', 'music']);
  });

  it('falls back to defaults when fewer than 3 destinations are selected', () => {
    expect(sanitizePrimaryNavTabs(['dashboard', 'health'], validIds))
      .toEqual(DEFAULT_PRIMARY_NAV_TABS);
  });

  it('falls back to defaults when more than 5 destinations are selected', () => {
    expect(sanitizePrimaryNavTabs(validIds, validIds)).toEqual(DEFAULT_PRIMARY_NAV_TABS);
  });

  it('drops unknown/invalid destination ids rather than crashing', () => {
    expect(sanitizePrimaryNavTabs(['dashboard', 'not-a-real-tab', 'health', 'journal'], validIds))
      .toEqual(['dashboard', 'health', 'journal']);
  });

  it('removes duplicate destination ids', () => {
    expect(sanitizePrimaryNavTabs(['dashboard', 'health', 'dashboard', 'journal'], validIds))
      .toEqual(['dashboard', 'health', 'journal']);
  });

  it('falls back to defaults for corrupt (non-array) saved config', () => {
    expect(sanitizePrimaryNavTabs('not-an-array', validIds)).toEqual(DEFAULT_PRIMARY_NAV_TABS);
    expect(sanitizePrimaryNavTabs(null, validIds)).toEqual(DEFAULT_PRIMARY_NAV_TABS);
    expect(sanitizePrimaryNavTabs(undefined, validIds)).toEqual(DEFAULT_PRIMARY_NAV_TABS);
  });

  it('restoring defaults always yields a valid in-range selection', () => {
    const restored = sanitizePrimaryNavTabs(DEFAULT_PRIMARY_NAV_TABS, validIds);
    expect(restored.length).toBeGreaterThanOrEqual(3);
    expect(restored.length).toBeLessThanOrEqual(5);
  });
});
