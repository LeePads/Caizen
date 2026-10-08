import type { FoodEntry, FoodMeasurementUnit } from '../types';

export const FOOD_MEASUREMENT_UNITS: FoodMeasurementUnit[] = [
  'g',
  'quantity',
  'tablespoon',
  'teaspoon',
  'ml',
  'serving',
  'can',
];

export type FoodEntryUnit = FoodMeasurementUnit | 'legacy';

export type ParsedFoodServing = {
  amount: number | null;
  unit: FoodEntryUnit;
  /** The label retained from a legacy serving string such as “1 bowl”. */
  legacyLabel?: string;
  /** The original serving string, kept so unchanged legacy records round-trip exactly. */
  originalServing?: string;
};

const servingAmountPattern = /^\s*[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*(.*)$/;
const recognizedServingPattern = new RegExp(
  `^\\s*[-+]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)\\s*(${FOOD_MEASUREMENT_UNITS
    .slice()
    .sort((left, right) => right.length - left.length)
    .join('|')})\\s*$`,
  'i',
);

function parseServingAmount(entry: FoodEntry): number | null {
  const amount = Number(entry.amount ?? String(entry.serving || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function servingLabel(value: string): string {
  const match = servingAmountPattern.exec(value);
  return (match?.[1] || '').trim() || 'Original unit';
}

export function parseFoodEntryServing(entry: FoodEntry): ParsedFoodServing {
  const originalServing = String(entry.serving || '').trim();
  const amount = parseServingAmount(entry);

  if (entry.unit && FOOD_MEASUREMENT_UNITS.includes(entry.unit)) {
    return { amount, unit: entry.unit, originalServing: originalServing || undefined };
  }

  const recognizedMatch = recognizedServingPattern.exec(originalServing);
  if (recognizedMatch) {
    const recognizedUnit = recognizedMatch[1].toLowerCase() as FoodMeasurementUnit;
    return { amount, unit: recognizedUnit, originalServing: originalServing || undefined };
  }

  return {
    amount,
    unit: 'legacy',
    legacyLabel: servingLabel(originalServing),
    originalServing: originalServing || undefined,
  };
}

export function formatFoodServing(
  amount: string,
  unit: FoodEntryUnit,
  legacyLabel?: string,
  originalServing?: string,
): string {
  if (!amount.trim()) return '';
  if (unit !== 'legacy') return `${amount}${unit}`;

  const originalAmount = originalServing
    ? Number(originalServing.replace(/[^0-9.]/g, ''))
    : Number.NaN;
  if (originalServing && Number.isFinite(originalAmount) && originalAmount === Number(amount)) {
    return originalServing;
  }

  return `${amount}${legacyLabel ? ` ${legacyLabel}` : ''}`.trim();
}
