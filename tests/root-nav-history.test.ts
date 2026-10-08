import { beforeEach, describe, expect, it } from 'vitest';

import {
  consumePreviousRootSection,
  hasPreviousRootSection,
  landOnDashboardViaBack,
  recordRootSection,
  resetRootSectionHistory,
} from '@/lib/native/root-nav-history';

describe('Android root section history (explicit, not browser history)', () => {
  beforeEach(() => {
    resetRootSectionHistory();
  });

  it('has no previous root immediately after the first section is recorded', () => {
    recordRootSection('dashboard');
    expect(hasPreviousRootSection()).toBe(false);
  });

  it('tracks only the immediately previous root section', () => {
    recordRootSection('dashboard');
    recordRootSection('health');
    expect(hasPreviousRootSection()).toBe(true);
    expect(consumePreviousRootSection()).toBe('dashboard');
  });

  it('does not grow with repeated tab switching - only one hop back is available', () => {
    recordRootSection('dashboard');
    recordRootSection('health');
    recordRootSection('journal');
    recordRootSection('workhub');

    // Back from workhub returns to journal (the immediately previous root),
    // never all the way back through health/dashboard.
    expect(consumePreviousRootSection()).toBe('journal');
  });

  it('consumes the previous root at most once', () => {
    recordRootSection('dashboard');
    recordRootSection('health');

    expect(consumePreviousRootSection()).toBe('dashboard');
    expect(hasPreviousRootSection()).toBe(false);
    expect(consumePreviousRootSection()).toBeNull();
  });

  it('does not create a ping-pong when the app re-records the section it just navigated back to', () => {
    recordRootSection('dashboard');
    recordRootSection('health');
    recordRootSection('journal');

    // Back handler consumes journal -> health, then React re-renders and
    // the section-change effect calls recordRootSection('health') again.
    const target = consumePreviousRootSection();
    expect(target).toBe('health');
    recordRootSection('health');

    // A second Back press must fall through toward Dashboard, not bounce
    // back to journal.
    expect(hasPreviousRootSection()).toBe(false);
  });

  it('landing on Dashboard via Back fallthrough clears history so Back then exits', () => {
    recordRootSection('dashboard');
    recordRootSection('health');

    // No previous root queued (single section visited) - Back falls
    // through to Dashboard.
    landOnDashboardViaBack();
    recordRootSection('dashboard'); // React re-render after the navigation event

    expect(hasPreviousRootSection()).toBe(false);
  });
});
