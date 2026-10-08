import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Audit #11 remediation contracts', () => {
  it('uses canonical money/date and safe profile normalizers', () => {
    const balance = read('lib/balance.ts');
    const profile = read('lib/profile/normalize-profile.ts');
    const upcoming = read('lib/upcoming-money.ts');

    expect(balance).toContain('normalizeBalanceProjectionRow');
    expect(balance).toContain('normalizeBalanceCheckIn');
    expect(balance).toContain('sumMoney');
    expect(profile).toContain('normalizeFinancialCategory');
    expect(profile).toContain('normalizeWalletType');
    expect(upcoming).toContain('parseLocalDateValue');
    expect(upcoming).toContain('addMoney');
  });

  it('consumes section requests, scopes profile remounts, and preserves exact routing', () => {
    const panel = read('components/balance/UpcomingMoneyPanel.tsx');
    const page = read('app/app/page.tsx');
    const balance = read('components/sections/BalanceSection.tsx');

    expect(panel).toContain('consumedRequestSignalRef');
    expect(panel).toContain('resolveUpcomingMoneyRequest');
    expect(panel).toContain('hidden={hidden}');
    expect(page).toContain('sectionRequestProfileIdRef');
    expect(page).toContain('key={`${activeTab}:${appContext.currentProfileId}`}');
    expect(page).toContain('profileId: appContext.currentProfileId');
    expect(balance).toContain('aria-label={`Edit wallet ${wallet.name}`}');
    expect(balance).toContain('pointer-events-none');
  });
});
