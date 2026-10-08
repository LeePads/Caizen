import { afterEach, describe, expect, it } from 'vitest';

import {
  normalizeWorkAttachmentIds,
  normalizeWorkItemAttachments,
} from '@/lib/work-attachments';
import { prepareImport } from '@/lib/storage/import-integrity';
import {
  collectMediaReferenceIds,
  remapMediaReferences,
  sanitizeMediaReferences,
} from '@/lib/storage/media-references';
import { saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset, getMediaBlob, listOwnerMedia } from '@/lib/storage/media-repository';
import { mediaStorage, releaseMediaDisplayUrl } from '@/lib/storage/media-storage';
import {
  processPendingMediaCleanup,
  queueMediaCleanup,
} from '@/lib/storage/media-cleanup';

afterEach(async () => {
  localStorage.clear();
  await resetCaizenDatabaseForTests();
});

describe('Work Hub managed attachment contracts', () => {
  it('normalizes supported Work references deterministically and strips unsupported ones', () => {
    const project = normalizeWorkItemAttachments({
      type: 'project',
      attachmentAssetIds: [' asset-a ', 'asset-a', '', 42, null, 'asset-b'],
    });
    expect(project.attachmentAssetIds).toEqual(['asset-a', 'asset-b']);
    expect(normalizeWorkItemAttachments(project)).toEqual(project);

    expect(normalizeWorkAttachmentIds(null)).toBeUndefined();
    expect(normalizeWorkAttachmentIds('asset-a')).toBeUndefined();
    expect(normalizeWorkItemAttachments({
      type: 'note',
      attachmentAssetIds: ['should-not-be-created'],
    })).not.toHaveProperty('attachmentAssetIds');
    expect(normalizeWorkItemAttachments({
      type: 'file',
      attachmentAssetIds: ['should-not-be-created'],
    })).not.toHaveProperty('attachmentAssetIds');
  });

  it('keeps Work references portable through generic media remap and sanitization', () => {
    const source = {
      workItems: [{
        id: 'task-1',
        type: 'task',
        attachmentAssetIds: ['work-a', 'work-b'],
      }],
    };
    expect([...collectMediaReferenceIds(source)]).toEqual(['work-a', 'work-b']);
    expect(remapMediaReferences(source, new Map([['work-a', 'restored-a']]))).toEqual({
      workItems: [{ id: 'task-1', type: 'task', attachmentAssetIds: ['restored-a', 'work-b'] }],
    });
    expect(sanitizeMediaReferences(source, new Set(['work-b']))).toEqual({
      workItems: [{ id: 'task-1', type: 'task', attachmentAssetIds: ['work-b'] }],
    });
  });

  it('normalizes imported Work attachment arrays without loosening import validation', () => {
    const prepared = prepareImport({
      profiles: [{
        id: 'profile-work',
        workItems: [
          {
            id: 'project-1',
            type: 'project',
            title: 'Project',
            attachmentAssetIds: ['work-a', 'work-a', ' ', 9],
          },
          {
            id: 'resource-1',
            type: 'file',
            title: 'External reference',
            attachmentAssetIds: ['must-be-ignored'],
          },
        ],
      }],
      currentProfileId: 'profile-work',
    });

    expect(prepared.report.canImport).toBe(true);
    expect(prepared.state.profiles[0].workItems).toEqual([
      expect.objectContaining({ id: 'project-1', attachmentAssetIds: ['work-a'] }),
      expect.not.objectContaining({ attachmentAssetIds: expect.anything() }),
    ]);
  });

  it('gives duplicate filenames independent managed identities and keeps ownership profile-scoped', async () => {
    const first = await mediaStorage.save(
      new Blob(['first'], { type: 'text/plain' }),
      {
        profileId: 'profile-a',
        ownerType: 'work',
        ownerId: 'task-a',
        role: 'attachment',
        fileName: 'report.txt',
      },
    );
    const second = await mediaStorage.save(
      new Blob(['second'], { type: 'text/plain' }),
      {
        profileId: 'profile-a',
        ownerType: 'work',
        ownerId: 'task-a',
        role: 'attachment',
        fileName: 'report.txt',
      },
    );

    expect(first.id).not.toBe(second.id);
    expect(first.fileName).toBe(second.fileName);
    expect((await listOwnerMedia('work', 'task-a')).map(asset => asset.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(await listOwnerMedia('work', 'task-a')).toHaveLength(2);
    await expect(mediaStorage.read(first.id, 'profile-b')).rejects.toThrow(/another profile/);
    await expect(mediaStorage.getDisplayUrl(first.id, 'thumbnail', 'profile-a')).resolves.toMatch(/^blob:/);
    await expect(mediaStorage.getDisplayUrl(first.id, 'thumbnail', 'profile-b')).rejects.toThrow(/another profile/);
    releaseMediaDisplayUrl(first.id, 'thumbnail');
    expect(await getMediaBlob(first.id, 'full')).toBeDefined();
  });

  it('preserves shared Work references and removes the last unreferenced asset through the durable queue', async () => {
    const shared = await mediaStorage.save(
      new Blob(['shared'], { type: 'text/plain' }),
      {
        profileId: 'profile-a',
        ownerType: 'work',
        ownerId: 'task-a',
        role: 'attachment',
        fileName: 'shared.txt',
      },
    );
    const orphan = await mediaStorage.save(
      new Blob(['orphan'], { type: 'text/plain' }),
      {
        profileId: 'profile-a',
        ownerType: 'work',
        ownerId: 'task-a',
        role: 'attachment',
        fileName: 'orphan.txt',
      },
    );
    await saveAppState({
      profiles: [{
        id: 'profile-a',
        workItems: [
          { id: 'project-a', type: 'project', attachmentAssetIds: [shared.id] },
          { id: 'task-a', type: 'task', attachmentAssetIds: [shared.id] },
        ],
      }] as any,
      currentProfileId: 'profile-a',
    });

    queueMediaCleanup({
      profileId: 'profile-a',
      assetIds: [shared.id, orphan.id],
      reason: 'attachment-detached',
    });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 1, pendingJobs: 0 });
    expect(await getMediaAsset(shared.id)).toBeDefined();
    expect(await getMediaAsset(orphan.id)).toBeUndefined();
  });
});
