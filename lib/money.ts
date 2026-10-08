const MONEY_SCALE = 100;

const finiteNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Caizen money inputs use cents as their deterministic precision boundary.
 * Rounding at the domain boundary prevents binary floating-point residue from
 * leaking into derived totals while preserving negative values where the
 * owning domain supports them.
 */
export const roundMoney = (value: unknown): number => {
  const number = finiteNumber(value);
  const epsilon = number === 0 ? 0 : Math.sign(number) * Number.EPSILON;
  return Math.round((number + epsilon) * MONEY_SCALE) / MONEY_SCALE;
};

export const toFiniteMoney = (value: unknown): number => roundMoney(value);

export const addMoney = (left: unknown, right: unknown): number =>
  roundMoney(toFiniteMoney(left) + toFiniteMoney(right));

export const sumMoney = (values: Iterable<unknown>): number => {
  let cents = 0;
  for (const value of values) {
    cents += Math.round(toFiniteMoney(value) * MONEY_SCALE);
  }
  return cents / MONEY_SCALE;
};
