// Order mirrors the intended mental model: current situation (Overview),
// where money lives (Wallets), what happened (Transactions), future money
// (Cash flow), analysis (Reports), then future purchases (Purchase plans).
// IDs are the source of truth for routing/deep-links, so reordering here is
// display-only and safe.
export const BALANCE_VIEW_OPTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'plan', label: 'Cash flow' },
  { id: 'reports', label: 'Reports' },
  { id: 'plans', label: 'Purchase plans' },
] as const;

export type MoneyView = (typeof BALANCE_VIEW_OPTIONS)[number]['id'];

const BALANCE_VIEW_IDS = BALANCE_VIEW_OPTIONS.map(option => option.id);

export function isMoneyView(value: unknown): value is MoneyView {
  return typeof value === 'string' && BALANCE_VIEW_IDS.includes(value as MoneyView);
}

export function buildBalanceViewHash(view: MoneyView) {
  return `#balance/${view}`;
}

export function parseBalanceViewHash(hash: string): MoneyView | null {
  const parts = hash.replace(/^#/, '').split('/');
  if (parts.length !== 2 || parts[0] !== 'balance' || !isMoneyView(parts[1])) {
    return null;
  }

  return parts[1];
}
