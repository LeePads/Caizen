import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Settings backup controls', () => {
  it('keeps complete transfer primary and explains managed media coverage', () => {
    const settings = read('components/settings/SettingsDataPanel.tsx');
    expect(settings).toContain('label="Local transfer format"');
    expect(settings).toContain("{ value: 'complete', label: 'Complete (.caizen)' }");
    expect(settings).toContain('Profile data + managed photos/files. Recommended for moving Caizen.');
    expect(settings).toContain("{ value: 'data', label: 'Data only (.json)' }");
    expect(settings).toContain('Managed local photos/files are not included.');
    expect(settings).toContain('onClick={onExport}');
    expect(settings).toContain('onClick={onImport}');
  });
  it('shares transfer actions on web and Android and keeps Cloud Backup separate', () => {
    const settings = read('components/settings/SettingsHub.tsx');
    expect(settings).toContain('<SettingsDataPanel transferFormat={transferFormat}');
    expect(settings).toContain('onExport={onExport}');
    expect(settings).toContain('onImport={onImport}');
    const android = read('components/native/AndroidSettingsHub.tsx');
    expect(android).toContain('label="Local transfer format"');
    expect(android).toContain('value={transferFormat}');
    expect(android).toContain('onClick={onExport}');
    expect(android).toContain('onClick={onImport}');
    expect(android).toContain('Choose and preview a .caizen file');
    expect(android).toContain('Choose and preview a JSON file');
    const panel = read('components/settings/SettingsDataPanel.tsx');
    expect(panel).toContain('Manage Cloud Backup');
    expect(panel).toContain('profile-scoped and is not live sync');
  });
  it('routes selected formats through existing complete and data-only flows', () => {
    const modal = read('components/modals/BackupManagerModal.tsx');
    const page = read('app/app/page.tsx');
    expect(page).toContain("setBackupMode(transferFormat === 'complete' ? 'export-complete' : 'export-data')");
    expect(page).toContain("setBackupMode(transferFormat === 'complete' ? 'import-complete' : 'import-data')");
    for (const mode of ['export-complete', 'import-complete', 'export-data', 'import-data']) expect(modal).toContain("'" + mode + "'");
    for (const contract of ['preflightCompleteBackup', 'downloadBackupBlob', 'previewCompleteBackup', 'restoreCompleteBackup', 'accept={inputAccept}', 'Nothing on this device was changed.']) expect(modal).toContain(contract);
  });
});
