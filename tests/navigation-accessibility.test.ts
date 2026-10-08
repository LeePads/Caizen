import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('navigation accessibility contracts', () => {
  it('keeps compact labels visual while exposing full destination names', () => {
    const page = read('app/app/page.tsx');
    const moreSheet = read('components/native/AndroidMoreSheet.tsx');

    expect(page).toContain("if (label === 'Dashboard') return 'Dash';");
    expect(page).toContain("if (label === 'Inventory') return 'Items';");
    expect(page).toContain("if (label === 'Skincare') return 'Skin';");
    expect(page).toContain("if (label === 'Entertainment') return 'Media';");
    expect(page).toContain("if (label === 'Personal Vault') return 'Vault';");
    expect(page).toContain("aria-label={tab.id === 'entertainment' && entertainmentUpdateCount > 0 ?");
    expect(page).toContain("'updates'}` : tab.label}");
    expect(page).toContain('label: tab.label');
    expect(moreSheet).toContain("aria-current={active ? 'page' : undefined}");
    expect(moreSheet).toContain('aria-hidden="true">Current</span>');
  });

  it('preserves active semantics and makes desktop tabs addressable for auto-scroll', () => {
    const page = read('app/app/page.tsx');

    expect(page).toContain('data-nav-tab-id={tab.id}');
    expect(page).toContain("aria-current={activeTab === tab.id ? 'page' : undefined}");
    expect(page).toContain('desktopNavScrollRef');
    expect(page).toContain('ResizeObserver');
    expect(page).toContain('scrollContainer.scrollTo({');
    expect(page).toContain("behavior: reduceMotion ? 'auto' : 'smooth'");
  });

  it('exposes desktop overflow state to assistive technology and the visual affordance', () => {
    const page = read('app/app/page.tsx');
    const css = read('app/globals.css');

    expect(page).toContain('data-has-overflow={desktopNavScrollState.hasOverflow ? \'true\' : \'false\'}');
    expect(page).toContain('data-can-scroll-left={desktopNavScrollState.canScrollLeft ? \'true\' : \'false\'}');
    expect(page).toContain('data-can-scroll-right={desktopNavScrollState.canScrollRight ? \'true\' : \'false\'}');
    expect(page).toContain('More Caizen sections are available. Scroll horizontally to view them.');
    expect(page).toContain("aria-describedby={desktopNavScrollState.hasOverflow ? 'caizen-desktop-nav-overflow-hint' : undefined}");
    expect(css).toContain('.caizen-desktop-nav-scroll-shell[data-can-scroll-left=\'true\']::before');
    expect(css).toContain('.caizen-desktop-nav-scroll-shell[data-can-scroll-right=\'true\']::after');
  });

  it('uses the native 48px close target for Android More', () => {
    const moreSheet = read('components/native/AndroidMoreSheet.tsx');

    expect(moreSheet).toContain('className="android-icon-button cz-more-close"');
    expect(moreSheet).toContain('aria-label="Close More"');
  });

  it('keeps Balance views semantic, addressable, and sticky without changing root navigation', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    const page = read('app/app/page.tsx');
    const css = read('app/globals.css');

    expect(balance).toContain('<Tabs');
    expect(balance).toContain('<TabsList className="balance-view-tabs" aria-label="Balance views">');
    expect(balance).toContain('<TabsTrigger');
    expect(balance).toContain('<TabsContent value="transactions"');
    expect(balance).toContain('<TabsContent value="reports"');
    expect(balance).toContain('caizen-tab');
    expect(balance).toContain('parseBalanceViewHash');
    expect(balance).toContain('aria-label="Balance views"');
    expect(page).toContain('isMoneyView(sectionFeatureRequest.feature)');
    expect(page).toContain('initialView={lastBalanceView}');
    expect(page).toContain('parseBalanceViewHash(window.location.hash)');
    expect(css).toContain('.balance-subnav-sticky');
    expect(css).toContain("html[data-capacitor='true'] .balance-subnav-sticky");
  });
});
