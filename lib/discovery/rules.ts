// Deterministic, rule-based "next useful feature" suggestions. No ML, no
// network calls, no ranking model — a short ordered list of high-confidence
// checks against data the profile already has. Consumed by both the
// Dashboard contextual card and Mochi's discovery presentation, so the
// logic (and its target routes) only exists once.

export type DashboardNavigationTarget =
  | string
  | { section: string; feature?: string; recordId?: string };

export type DiscoverySuggestion = {
  id: string;
  section: string;
  feature: string;
  title: string;
  description?: string;
  actionLabel: string;
  target: DashboardNavigationTarget;
};

type MinimalFoodEntry = {
  name: string;
  date: Date | string;
  sourceMealTemplateId?: string;
};

type MinimalInventoryItem = {
  id: string;
  name: string;
  purchaseDate: Date | string;
  photoAssetIds?: string[];
  receiptAssetIds?: string[];
};

export type DiscoveryContext = {
  foodEntries: MinimalFoodEntry[];
  mealTemplateCount: number;
  wallets: unknown[];
  activeWishlistCount: number;
  dailyChecklistItemCount: number;
  productivityItemCount: number;
  inventoryItems: MinimalInventoryItem[];
};

const REPEATED_MEAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const REPEATED_MEAL_MIN_COUNT = 3;
const ROUTINE_CANDIDATE_TASK_COUNT = 5;
const MONEY_ACTIVE_WALLET_COUNT = 1;

function toTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

function findRepeatedUnsavedMeal(entries: MinimalFoodEntry[]): string | null {
  const cutoff = Date.now() - REPEATED_MEAL_WINDOW_MS;
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.sourceMealTemplateId) continue;
    if (toTime(entry.date) < cutoff) continue;
    const key = entry.name.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }

  return bestCount >= REPEATED_MEAL_MIN_COUNT ? best : null;
}

function findIncompleteInventoryItem(items: MinimalInventoryItem[]): MinimalInventoryItem | null {
  const incomplete = items.filter(
    item => !(item.photoAssetIds?.length) && !(item.receiptAssetIds?.length),
  );
  if (!incomplete.length) return null;
  return incomplete.slice().sort((a, b) => toTime(b.purchaseDate) - toTime(a.purchaseDate))[0];
}

/**
 * Returns the single highest-value applicable suggestion, or null when
 * nothing is relevant. Never returns more than one — this is meant to be a
 * quiet nudge, not a feed.
 */
export function getDiscoverySuggestion(context: DiscoveryContext): DiscoverySuggestion | null {
  const repeatedMeal = context.mealTemplateCount === 0
    ? findRepeatedUnsavedMeal(context.foodEntries)
    : null;
  if (repeatedMeal) {
    return {
      id: 'food-save-meal',
      section: 'health',
      feature: 'saved',
      title: 'Save this meal for next time',
      description: `You've logged "${titleCase(repeatedMeal)}" a few times. Food Library saves it for faster logging.`,
      actionLabel: 'Open Food Library',
      target: { section: 'health', feature: 'saved' },
    };
  }

  if (context.wallets.length >= MONEY_ACTIVE_WALLET_COUNT && context.activeWishlistCount === 0) {
    return {
      id: 'money-spending-plan',
      section: 'balance',
      feature: 'plans',
      title: 'Planning a bigger purchase?',
      description: 'Purchase plans help you save toward something specific before you buy it.',
      actionLabel: 'Try Purchase plans',
      target: { section: 'balance', feature: 'plans' },
    };
  }

  if (
    context.dailyChecklistItemCount === 0 &&
    context.productivityItemCount >= ROUTINE_CANDIDATE_TASK_COUNT
  ) {
    return {
      id: 'lifehub-routines',
      section: 'lifehub',
      feature: 'routine',
      title: 'This looks recurring',
      description: 'Routines track a repeating habit without recreating a task every time.',
      actionLabel: 'Open Routines',
      target: { section: 'lifehub', feature: 'routine' },
    };
  }

  const incompleteItem = findIncompleteInventoryItem(context.inventoryItems);
  if (incompleteItem) {
    return {
      id: 'inventory-complete-item',
      section: 'inventory',
      feature: 'item',
      title: 'Add a receipt or photo',
      description: `Keep "${incompleteItem.name}" complete with a receipt or photo.`,
      actionLabel: 'Open item',
      target: { section: 'inventory', feature: 'item', recordId: incompleteItem.id },
    };
  }

  return null;
}
