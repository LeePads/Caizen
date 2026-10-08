import { describe, expect, it } from 'vitest';
import {
  normalizeOnboardingPriorities,
  orderTabsForOnboarding,
  primaryTabsForOnboarding,
  shouldShowOnboarding,
} from '@/lib/onboarding';

describe('first-run onboarding visibility', () => {
  it('shows Welcome for the provider-created default profile while setup is pending', () => {
    expect(shouldShowOnboarding({
      setupCompleted: false,
      onboardingPending: true,
      hasStoredProfiles: true,
    })).toBe(true);
  });

  it('does not show Welcome for an existing profile once setup is complete', () => {
    expect(shouldShowOnboarding({
      setupCompleted: true,
      onboardingPending: false,
      hasStoredProfiles: true,
    })).toBe(false);
  });

  it('shows product onboarding after safe native entry', () => {
    expect(shouldShowOnboarding({
      setupCompleted: false,
      onboardingPending: true,
      hasStoredProfiles: true,
    })).toBe(true);
  });

  it('replays only when explicitly pending and preserves upgraded profiles', () => {
    expect(shouldShowOnboarding({ setupCompleted: true, onboardingPending: true, hasStoredProfiles: true })).toBe(true);
    expect(shouldShowOnboarding({ setupCompleted: false, onboardingPending: false, hasStoredProfiles: true })).toBe(false);
  });
});

describe('first-run priorities', () => {
  it('reorders existing tabs without hiding any section', () => {
    expect(orderTabsForOnboarding(['dashboard', 'balance', 'health', 'inventory'], ['inventory', 'balance']))
      .toEqual(['dashboard', 'inventory', 'balance', 'health']);
  });

  it('keeps Dashboard pinned and a valid minimum set on Android', () => {
    expect(primaryTabsForOnboarding(['workhub'])).toEqual(['dashboard', 'workhub', 'lifehub']);
  });

  it('keeps only three distinct valid priorities from a recovered draft', () => {
    expect(normalizeOnboardingPriorities(['health', 'health', 'balance', 'invalid', 'lifehub', 'workhub']))
      .toEqual(['health', 'balance', 'lifehub']);
  });
});

