import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('naming and mobile density contracts', () => {
  it('uses Money and Personal Vault in visible navigation while preserving internal ids', () => {
    const page = read('app/app/page.tsx');
    const personalVault = read('components/sections/PersonalVaultSection.tsx');
    const search = read('lib/global-search.ts');

    expect(page).toContain("id: 'balance',");
    expect(page).toContain("label: 'Money',");
    expect(page).toContain("id: 'personalhub',");
    expect(page).toContain("label: 'Personal Vault',");
    expect(page).toContain("if (label === 'Personal Vault') return 'Vault';");
    expect(page).not.toContain("activeTab === 'balance' ? 'Finance'");
    expect(page).not.toContain("['Personal Hub'");
    expect(personalVault).toContain('Personal Vault');
    expect(personalVault).not.toContain('Personal Hub');
    expect(search).toContain("add('personalhub'");
    expect(search).toContain('Personal Vault');
  });

  it('keeps Cloud Backup action language distinct from account identity and compound destinations', () => {
    const page = read('app/app/page.tsx');
    const profileSwitcher = read('components/layout/ProfileSwitcher.tsx');
    const moreSheet = read('components/native/AndroidMoreSheet.tsx');
    const landingModal = read('components/landing/CloudLoginModal.tsx');

    expect(page).toContain("title: 'Open Cloud Backup'");
    expect(page).toContain("cloudStatus={cloudStatusSummary}");
    expect(page).toContain("'Signed in / not backed up'");
    expect(profileSwitcher).toContain("cloudStatus = 'Signed out'");
    expect(moreSheet).toContain("label: 'Cloud & Backup'");
    expect(landingModal).toContain('Cloud Backup');
    expect(landingModal).toContain('<CaizenFormDialog title="Cloud Backup"');
    expect(landingModal).toContain("router.push('/app/?cloud=1')");
  });

  it('raises the confirmed narrow controls without broad compact-text replacement', () => {
    const css = read('app/globals.css');
    const entertainment = read('components/sections/EntertainmentSection.tsx');
    const music = read('components/sections/MusicSection.tsx');
    const journal = read('components/sections/JournalSection.tsx');

    expect(css).toContain("html:not([data-capacitor='true']) :is(.caizen-mobile-tab, .caizen-mobile-more)");
    expect(css).toContain('font-size: 0.6875rem;');
    expect(css).toContain('var(--android-touch-target)');
    expect(entertainment).toContain('!min-h-11');
    expect(entertainment).toContain('text-xs font-bold');
    expect(music).toContain('music-view-control min-h-11 min-w-11');
    expect(journal.match(/journal-calendar-control/g)).toHaveLength(3);
    expect(journal).toContain('aria-label="Previous month"');
    expect(journal).toContain('<span>Timeline</span>');
  });

  it('uses an absolute app title so the root template does not duplicate Caizen', () => {
    expect(read('app/app/layout.tsx')).toContain("title: { absolute: 'Caizen' }");
  });
});
