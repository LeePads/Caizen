import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createCompleteBackup, restoreCompleteBackup } from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState, type StoredAppState } from '@/lib/storage/app-repository';
import {
  getMediaBlob,
  getMediaAsset,
  listMediaAssets,
  putMediaAsset,
  putMediaBlob,
} from '@/lib/storage/media-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import type { MediaAsset } from '@/lib/types';
import { clearCloudMediaCache } from '@/lib/storage/media-cache';
import { getMediaResidency } from '@/lib/storage/media-residency';
import { mediaStorage } from '@/lib/storage/media-storage';

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  createdAt: '2024-01-01T08:00:00+08:00',
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
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
  balanceCheckIns: [],
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    noXTrackers: [],
  },
  ...overrides,
});

const state = (profiles: unknown[]): StoredAppState => ({
  profiles: profiles as StoredAppState['profiles'],
  currentProfileId: profiles.length ? (profiles[0] as { id: string }).id : '',
});

const pdf = (body: string) => new Uint8Array(
  new TextEncoder().encode(`%PDF-1.4\n${body}`),
);

const asset = (id: string, profileId: string): MediaAsset => ({
  id,
  profileId,
  ownerType: 'inventory',
  ownerId: 'item-1',
  role: 'attachment',
  fileName: 'document.pdf',
  mimeType: 'application/pdf',
  sizeBytes: pdf('old').byteLength,
  syncStatus: 'synced',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('complete restore media isolation', () => {
  it('keeps complete-archive bytes local after a clean-device restore and cache cleanup', async () => {
    const source = state([profile('portable', {
      inventoryItems: [{
        id: 'item-portable',
        name: 'Portable file',
        photoAssetIds: ['portable-asset'],
        purchaseDate: '2026-02-01',
      }],
    })]);
    await saveAppState(source);
    const sourceAsset = {
      ...asset('portable-asset', 'portable'),
      fileName: 'portable.pdf',
      sizeBytes: pdf('portable').byteLength,
      remotePath: 'account/portable/portable-asset/portable-asset.pdf',
      syncStatus: 'synced' as const,
    };
    await putMediaAsset(sourceAsset);
    await putMediaBlob(sourceAsset.id, new Blob([pdf('portable')], { type: sourceAsset.mimeType }), 'full');

    const archive = await createCompleteBackup();
    await resetCaizenDatabaseForTests();

    const result = await restoreCompleteBackup(archive, 'replace');
    expect(result.status).toBe('success');
    const restored = await getMediaAsset('portable-asset');
    expect(restored).toMatchObject({ remotePath: undefined, syncStatus: 'local-only' });
    expect(await getMediaResidency(restored!)).toBe('local-only');

    await expect(clearCloudMediaCache()).resolves.toEqual([]);
    await expect(mediaStorage.read('portable-asset', 'portable')).resolves.toMatchObject({ size: pdf('portable').byteLength });
  });

  it('materializes supported legacy inline media before packaging a complete archive', async () => {
    const inline = `data:text/plain;base64,${btoa('legacy bytes')}`;
    await saveAppState(state([profile('legacy', {
      inventoryItems: [{
        id: 'legacy-item',
        name: 'Legacy item',
        image: inline,
        purchaseDate: '2026-02-01',
      }],
    })]));

    const archive = await createCompleteBackup();
    const unpacked = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(unpacked['manifest.json']));
    const archivedState = JSON.parse(strFromU8(unpacked['data.json']));
    const archivedMedia = JSON.parse(strFromU8(unpacked['media/index.json']));
    expect(archivedState.profiles[0].inventoryItems[0].image).toBeUndefined();
    expect(archivedState.profiles[0].inventoryItems[0].photoAssetIds).toHaveLength(1);
    expect(archivedMedia).toHaveLength(1);
    expect(unpacked[manifest.media[0].archivePath]).toBeDefined();

    const persisted = await loadAppState();
    expect((persisted?.profiles[0] as any).inventoryItems[0].image).toBeUndefined();
    expect((await listMediaAssets())).toHaveLength(1);
  });

  it('rejects same-size tampered archive bytes when a checksum is recorded', async () => {
    const source = state([profile('checksummed', {
      inventoryItems: [{
        id: 'item-checksum',
        name: 'Checksummed file',
        photoAssetIds: ['checksum-asset'],
        purchaseDate: '2026-02-01',
      }],
    })]);
    await saveAppState(source);
    const original = pdf('old');
    const sourceAsset = {
      ...asset('checksum-asset', 'checksummed'),
      sizeBytes: original.byteLength,
      syncStatus: 'local-only' as const,
    };
    await putMediaAsset(sourceAsset);
    await putMediaBlob(sourceAsset.id, new Blob([original], { type: sourceAsset.mimeType }), 'full');
    const archive = await createCompleteBackup();
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const mediaPath = Object.keys(entries).find(name => name.startsWith('media/files/'))!;
    const tampered = new Uint8Array(entries[mediaPath]);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] === 120 ? 121 : 120;
    entries[mediaPath] = tampered;

    await expect(
      restoreCompleteBackup(new Blob([zipSync(entries)]), 'replace'),
    ).rejects.toThrow(/checksum/);
  });

  it('remaps colliding media IDs and preserves the existing asset', async () => {
    await saveAppState(state([
      profile('local', {
        inventoryItems: [{
          id: 'item-1',
          name: 'Local item',
          photoAssetIds: ['asset-collision'],
          purchaseDate: '2026-01-01',
        }],
      }),
    ]));

    const existing = asset('asset-collision', 'local');
    await putMediaAsset(existing);
    const oldBytes = new Blob([pdf('old')], { type: existing.mimeType });
    await putMediaBlob(existing.id, oldBytes, 'full');

    const importedAsset = { ...asset('asset-collision', 'incoming'), sizeBytes: pdf('new').byteLength };
    const imported = state([
      profile('incoming', {
        inventoryItems: [{
          id: 'item-1',
          name: 'Imported item',
          photoAssetIds: ['asset-collision'],
          purchaseDate: '2026-02-01',
        }],
      }),
    ]);
    const manifest = {
      format: 'caizen-backup',
      version: 2,
      createdAt: '2026-08-09T00:00:00.000Z',
      schemaVersion: 1,
      profiles: [{ id: 'incoming', name: 'incoming' }],
      media: [{
        id: importedAsset.id,
        archivePath: 'media/files/asset-collision.pdf',
        fileName: importedAsset.fileName,
        mimeType: importedAsset.mimeType,
        sizeBytes: importedAsset.sizeBytes,
      }],
    };
    const archive = new Blob([zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data.json': strToU8(JSON.stringify(imported)),
      'media/index.json': strToU8(JSON.stringify([importedAsset])),
      'media/files/asset-collision.pdf': pdf('new'),
    })]);

    const result = await restoreCompleteBackup(archive, 'new-profiles');
    expect(result.status).toBe('success');

    const media = await listMediaAssets();
    expect(media).toHaveLength(2);
    expect(await getMediaAsset(existing.id)).toEqual(existing);
    expect(await (await getMediaBlob(existing.id, 'full'))?.text()).toContain('old');

    const after = await loadAppState();
    const importedProfile = after?.profiles.find(profile => profile.id !== 'local');
    const importedPhotoId = (importedProfile?.inventoryItems?.[0] as { photoAssetIds?: string[] })
      ?.photoAssetIds?.[0];
    expect(importedPhotoId).toBeTruthy();
    expect(importedPhotoId).not.toBe(existing.id);
    expect(await getMediaAsset(importedPhotoId!)).toMatchObject({ profileId: importedProfile?.id });
    expect(await (await getMediaBlob(importedPhotoId!, 'full'))?.text()).toContain('new');
  });

  it('rejects a v2 backup with dangling media references before replacing data', async () => {
    await saveAppState(state([profile('local', {
      transactions: [{ id: 'keep', date: '2026-01-01' }],
    })]));

    const imported = state([profile('incoming', {
      inventoryItems: [{
        id: 'item-1',
        name: 'Broken import',
        purchaseDate: '2026-02-01',
        photoAssetIds: ['missing-asset'],
      }],
    })]);
    const manifest = {
      format: 'caizen-backup',
      version: 2,
      createdAt: '2026-08-09T00:00:00.000Z',
      schemaVersion: 1,
      profiles: [{ id: 'incoming', name: 'incoming' }],
      media: [],
    };
    const archive = new Blob([zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'data.json': strToU8(JSON.stringify(imported)),
      'media/index.json': strToU8('[]'),
    })]);

    await expect(restoreCompleteBackup(archive, 'replace')).rejects.toThrow(/missing from its media index/);
    const after = await loadAppState();
    expect(after?.profiles.map(profile => profile.id)).toEqual(['local']);
    expect((after?.profiles[0] as any).transactions[0].id).toBe('keep');
  });
});
