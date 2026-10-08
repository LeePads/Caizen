import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Balance focused remediation contracts', () => {
  it('keeps forecast allocation language separate from actual movement', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    expect(balance).toContain('Monthly forecast estimate');
    expect(balance).toContain("Remove from this month\'s forecast");
    expect(balance).toContain('does not record an actual transaction');
  });

  it('keeps privacy and dialog semantics on the Balance surfaces', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    expect(balance).toContain('useSyncExternalStore');
    expect(read('components/modals/WalletModal.tsx')).toContain('<CaizenFormDialog');
    expect(read('components/ui/section-kit.tsx')).toContain('role="dialog"');
    expect(read('components/modals/WishlistModal.tsx')).toContain('balancesHidden');
    expect(read('components/balance/TransactionModal.tsx')).toContain('Discard transaction changes?');
    expect(balance).toContain('Discard budget changes?');
  });
});
