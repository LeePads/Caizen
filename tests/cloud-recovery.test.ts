import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyCloudRecovery,
  getCloudRecoveryPrompt,
  resolveCloudRecoveryOnboarding,
  type CloudRecoveryClassificationInput,
  type CloudRecoveryDiscovery,
} from '@/lib/cloud-recovery';
import {
  getCloudRecoveryFingerprint,
  getCloudRecoveryOfferState,
  hasCloudRecoveryDecision,
  recordCloudRecoveryDecision,
} from '@/lib/cloud-recovery-state';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

const backup = {
  id: 'backup-1',
  userId: 'user-1',
  profileId: 'profile-1',
  schemaVersion: 3,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

const baseInput = (): CloudRecoveryClassificationInput => ({
  backup,
  localProfileExists: true,
  isCurrentProfile: true,
  isPristine: false,
  localUpdatedAt: '2026-08-15T00:00:00.000Z',
  marker: {
    userId: 'user-1',
    profileId: 'profile-1',
    localUpdatedAt: '2026-08-14T00:00:00.000Z',
    cloudUpdatedAt: '2026-08-14T00:00:00.000Z',
    syncedAt: '2026-08-14T00:00:00.000Z',
  },
});

describe('Cloud recovery discovery classification', () => {
  afterEach(async () => {
    await resetCaizenDatabaseForTests();
  });

  it('classifies every background comparison state without authorizing a restore', () => {
    expect(classifyCloudRecovery({ ...baseInput(), backup: null })).toBe('no-backup');
    expect(classifyCloudRecovery({ ...baseInput(), isPristine: true })).toBe('pristine-device-backup');
    expect(classifyCloudRecovery({
      ...baseInput(),
      localUpdatedAt: '2026-08-15T00:01:00.000Z',
      marker: { ...baseInput().marker!, cloudUpdatedAt: backup.updatedAt },
    })).toBe('matching-local-newer');
    expect(classifyCloudRecovery({
      ...baseInput(),
      localUpdatedAt: '2026-08-14T00:00:00.000Z',
      marker: { ...baseInput().marker!, cloudUpdatedAt: '2026-08-14T00:00:00.000Z' },
    })).toBe('matching-cloud-newer');
    expect(classifyCloudRecovery({
      ...baseInput(),
      localUpdatedAt: backup.updatedAt,
      marker: { ...baseInput().marker!, localUpdatedAt: backup.updatedAt, cloudUpdatedAt: backup.updatedAt },
    })).toBe('matching-equal');
    expect(classifyCloudRecovery({ ...baseInput(), localUpdatedAt: backup.updatedAt })).toBe('both-changed');
    expect(classifyCloudRecovery({
      ...baseInput(),
      marker: null,
      localUpdatedAt: '2026-08-13T00:00:00.000Z',
    })).toBe('matching-no-baseline');
    expect(classifyCloudRecovery({
      ...baseInput(),
      localUpdatedAt: '2026-08-15T00:01:00.000Z',
      marker: { ...baseInput().marker!, cloudUpdatedAt: '2026-08-15T00:02:00.000Z' },
    })).toBe('both-changed');
    expect(classifyCloudRecovery({
      ...baseInput(),
      localProfileExists: false,
    })).toBe('cloud-only-profile');
  });

  it('keeps normal same-profile continuation non-blocking while preserving conflict prompts', () => {
    expect(getCloudRecoveryPrompt('matching-cloud-newer')).toBe('notice');
    expect(getCloudRecoveryPrompt('cloud-only-profile')).toBe('notice');
    expect(getCloudRecoveryPrompt('matching-no-baseline')).toBe('modal');
    expect(getCloudRecoveryPrompt('both-changed')).toBe('modal');
  });
});

describe('Cloud recovery offer suppression state', () => {
  afterEach(async () => {
    await resetCaizenDatabaseForTests();
  });

  it('is account-scoped, idempotent per fingerprint, and bounded', async () => {
    const fingerprint = getCloudRecoveryFingerprint({
      backupId: backup.id,
      profileId: backup.profileId,
      schemaVersion: backup.schemaVersion,
      updatedAt: backup.updatedAt,
    });
    expect(await hasCloudRecoveryDecision('user-1', fingerprint)).toBe(false);

    await recordCloudRecoveryDecision({
      accountId: 'user-1',
      fingerprint,
      profileId: backup.profileId,
      decision: 'dismissed',
    });
    expect(await hasCloudRecoveryDecision('user-1', fingerprint)).toBe(true);
    expect(await hasCloudRecoveryDecision('user-2', fingerprint)).toBe(false);

    await recordCloudRecoveryDecision({
      accountId: 'user-1',
      fingerprint,
      profileId: backup.profileId,
      decision: 'reviewed',
    });
    const state = await getCloudRecoveryOfferState('user-1');
    expect(state.accounts[0]?.entries).toHaveLength(1);
    expect(state.accounts[0]?.entries[0]?.decision).toBe('reviewed');

    for (let index = 0; index < 35; index += 1) {
      await recordCloudRecoveryDecision({
        accountId: 'user-1',
        fingerprint: `fingerprint-${index}`,
        profileId: backup.profileId,
        decision: 'dismissed',
      });
    }
    expect((await getCloudRecoveryOfferState('user-1')).accounts[0]?.entries).toHaveLength(32);
  });

  it('handles the complete first-device discovery set after one profile is selected', async () => {
    const makeCandidate = (
      id: string,
      profileId: string,
      prompt: 'modal' | 'notice' = 'modal',
    ) => ({
      backup: {
        id,
        userId: 'user-1',
        profileId,
        schemaVersion: 3,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: `2026-08-15T00:0${id.slice(-1)}:00.000Z`,
      },
      classification: prompt === 'notice' ? 'cloud-only-profile' as const : 'pristine-device-backup' as const,
      prompt,
      isCurrentProfile: false,
      localUpdatedAt: null,
      cloudUpdatedAt: '2026-08-15T00:00:00.000Z',
      media: { count: 0, bytes: 0 },
    });
    const discovery: CloudRecoveryDiscovery = {
      userId: 'user-1',
      discoveredAt: '2026-08-15T00:00:00.000Z',
      candidates: [
        makeCandidate('backup-other', 'profile-other', 'notice'),
        makeCandidate('backup-main', 'profile-main'),
      ],
      mediaByProfile: {},
    };

    await resolveCloudRecoveryOnboarding(discovery, 'backup-main', 'restored');

    const state = await getCloudRecoveryOfferState('user-1');
    expect(state.accounts[0]?.entries).toHaveLength(2);
    expect(state.accounts[0]?.entries.find(entry => entry.profileId === 'profile-main')?.decision)
      .toBe('restored');
    expect(state.accounts[0]?.entries.find(entry => entry.profileId === 'profile-other')?.decision)
      .toBe('dismissed');

    const laterFingerprint = getCloudRecoveryFingerprint({
      backupId: 'backup-new',
      profileId: 'profile-other',
      schemaVersion: 3,
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(await hasCloudRecoveryDecision('user-1', laterFingerprint)).toBe(false);
    expect(await hasCloudRecoveryDecision('user-2', laterFingerprint)).toBe(false);
  });
});
