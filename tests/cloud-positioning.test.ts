import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Cloud Backup positioning contract', () => {
  it('uses Cloud Backup language in user-facing Cloud surfaces', () => {
    const modal = read('components/modals/CloudSyncModal.tsx');
    const settings = read('components/settings/SettingsDataPanel.tsx');
    const androidSettings = read('components/native/AndroidSettingsHub.tsx');
    const page = read('app/app/page.tsx');
    const cloud = read('lib/cloud-backup.ts');
    const docs = read('docs/BACKUP-SYNC.md');

    expect(modal).toContain('Automatic Backup');
    expect(modal).toContain('expectedProfileId: profileId');
    expect(settings).toContain('profile snapshot for recovery and continuity across devices');
    expect(settings).toContain('Automatic Cloud Backup');
    expect(androidSettings).toContain('per-profile snapshots');
    expect(androidSettings).toContain('not live');
    expect(page).toContain('Cloud Backup needs attention');
    expect(cloud).toContain('Automatic Cloud Backup paused');
    expect(docs).toContain('Automatic Cloud Backup');
    expect(docs).toContain('not live collaboration');

    for (const source of [modal, settings, androidSettings, page]) {
      expect(source).not.toContain('Automatic Cloud Sync');
      expect(source).not.toContain('Cloud Sync needs attention');
    }
  });
});
