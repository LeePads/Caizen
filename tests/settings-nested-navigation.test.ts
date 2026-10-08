import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard: opening Cloud, Backup/Restore, or Trash from Android
 * Settings must leave AndroidSettingsHub mounted underneath the peer modal.
 */
describe('AndroidSettingsHub nested destinations stay mounted', () => {
  const source = readFileSync(
    resolve(__dirname, '..', 'app', 'app', 'page.tsx'),
    'utf8',
  );

  const androidSettingsBlock =
    source.match(/<AndroidSettingsHub[\s\S]*?\/>/)?.[0] ?? '';

  it('renders the Android Settings hub with its destination handlers', () => {
    expect(androidSettingsBlock).not.toBe('');
    expect(androidSettingsBlock.length).toBeGreaterThan(200);
    expect(androidSettingsBlock).toContain('onCloud=');
    expect(androidSettingsBlock).toContain('onExport=');
    expect(androidSettingsBlock).toContain('onImport=');
    expect(androidSettingsBlock).toContain('onTrash=');
  });

  it('does not close the Settings hub when opening Cloud', () => {
    const onCloud =
      androidSettingsBlock.match(
        /onCloud=\{\(\) => \{[\s\S]*?\}\}/,
      )?.[0] ?? '';

    expect(onCloud).not.toBe('');
    expect(onCloud).not.toContain('setShowSettingsHub(false)');
  });

  it('does not close the Settings hub when opening Backup export/import', () => {
    const onExport =
      androidSettingsBlock.match(
        /onExport=\{\(\) => \{[\s\S]*?\}\}/,
      )?.[0] ?? '';

    const onImport =
      androidSettingsBlock.match(
        /onImport=\{\(\) => \{[\s\S]*?\}\}/,
      )?.[0] ?? '';

    expect(onExport).not.toBe('');
    expect(onImport).not.toBe('');
    expect(onExport).not.toContain('setShowSettingsHub(false)');
    expect(onImport).not.toContain('setShowSettingsHub(false)');
  });

  it('does not close the Settings hub when opening Trash', () => {
    const onTrash =
      androidSettingsBlock.match(
        /onTrash=\{\(\) => \{[\s\S]*?\}\}/,
      )?.[0] ?? '';

    expect(onTrash).not.toBe('');
    expect(onTrash).not.toContain('setShowSettingsHub(false)');
  });
});

describe('GlobalTrashModal registers with the overlay stack', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '..',
      'components',
      'modals',
      'GlobalTrashModal.tsx',
    ),
    'utf8',
  );

  it('uses the shared overlay lifecycle instead of a raw Escape listener', () => {
    expect(source).toContain('useOverlayLifecycle(isOpen, close, { containerRef: modalPanelRef });');
    expect(source).not.toContain("addEventListener('keydown'");
  });
});

