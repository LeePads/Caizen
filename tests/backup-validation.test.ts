import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { assertDataOnlyJsonSize, MAX_DATA_ONLY_JSON_BYTES, previewCompleteBackup } from '@/lib/storage/backup-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

const archiveBlob = (entries: Record<string, Uint8Array>) =>
  new Blob([zipSync(entries)]) as Blob;

describe('complete backup validation', () => {
  it('rejects missing manifests', async () => {
    await expect(
      previewCompleteBackup(archiveBlob({ 'data.json': strToU8('{}') })),
    ).rejects.toThrow(/manifest/);
  });

  it('rejects path traversal entries', async () => {
    const manifest = {
      format: 'caizen-backup',
      version: 1,
      createdAt: new Date(0).toISOString(),
      appVersion: 'test',
      profileCount: 0,
      recordCount: 0,
      mediaCount: 0,
      totalMediaBytes: 0,
    };
    await expect(
      previewCompleteBackup(
        archiveBlob({
          '../escape.txt': strToU8('x'),
          'manifest.json': strToU8(JSON.stringify(manifest)),
          'data.json': strToU8(JSON.stringify({ profiles: [], currentProfileId: '' })),
          'media/index.json': strToU8('[]'),
        }),
      ),
    ).rejects.toThrow(/unsafe path/);
  });

  it('rejects unsupported backup versions', async () => {
    const manifest = {
      format: 'caizen-backup',
      version: 99,
      createdAt: new Date(0).toISOString(),
      appVersion: 'test',
      profileCount: 0,
      recordCount: 0,
      mediaCount: 0,
      totalMediaBytes: 0,
    };
    await expect(
      previewCompleteBackup(
        archiveBlob({
          'manifest.json': strToU8(JSON.stringify(manifest)),
          'data.json': strToU8(JSON.stringify({ profiles: [], currentProfileId: '' })),
          'media/index.json': strToU8('[]'),
        }),
      ),
    ).rejects.toThrow(/invalid/);
  });
});

describe('data-only import size guard', () => {
  it('accepts the configured bound and rejects larger input before parsing', () => {
    expect(() => assertDataOnlyJsonSize(MAX_DATA_ONLY_JSON_BYTES)).not.toThrow();
    expect(() => assertDataOnlyJsonSize(MAX_DATA_ONLY_JSON_BYTES + 1)).toThrow(/50 MiB/);
  });
});
