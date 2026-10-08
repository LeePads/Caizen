'use client';

import {
  Clock3,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { MonetaryNumber } from '@/components/ui/monetary-number';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import { formatPHP } from '@/lib/currency';
import { formatLabel } from '@/lib/utils';
import {
  getInventoryCurrentValueIfKnown,
  getInventoryPurchaseCostIfKnown,
  getInventoryQuantity,
  sumInventorySavings,
} from '@/lib/collections/inventory-metrics';
import { normalizeInventoryCategoryKey } from '@/lib/collections/inventory-taxonomy';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

/* =========================================
   DATE HELPERS
========================================= */

function getDaysAgoLabel(
  value?: Date | string | null
) {
  if (!value) return 'No purchase yet';

  const date =
    new Date(value);

  const diffDays =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          date.getTime()
        ) /
        (
          1000 *
          60 *
          60 *
          24
        )
      )
    );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;

  const months =
    Math.floor(diffDays / 30);

  if (months < 12) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }

  const years =
    Math.floor(diffDays / 365);

  return `${years} year${years > 1 ? 's' : ''} ago`;
}

function getRecencyTone(
  value?: Date | string | null
) {
  if (!value) {
    return { label: 'No date' };
  }

  const diffDays =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          new Date(value).getTime()
        ) /
        (
          1000 *
          60 *
          60 *
          24
        )
      )
    );

  if (diffDays <= 14) {
    return { label: 'Recent' };
  }

  if (diffDays <= 60) {
    return { label: 'Within 2 months' };
  }

  if (diffDays <= 180) {
    return { label: 'Within 6 months' };
  }

  return { label: 'Over 6 months ago' };
}

function getSavingsLabel(value: number | null) {
  if (value === null) return 'Not available';
  if (value === 0) return 'No difference';
  return `${formatPHP(Math.abs(value))} ${value > 0 ? 'saved' : 'above current price'}`;
}

/* =========================================
   CATEGORY CONFIG
========================================= */

const KNOWN_CATEGORIES: Record<string, { label: string }> = {
  personal_tech: { label: 'Personal Tech' },
  utilities: { label: 'Utilities' },
  wearables: { label: 'Wearables' },
  home: { label: 'Home' },
};


function getCategoryStyle(key: string) {
  const known = KNOWN_CATEGORIES[key];
  return {
    label: known?.label || formatLabel(key),
  };
}

/* =========================================
   TYPES
========================================= */

type InventoryCategoryDashboardProps = {
  onCategorySelect?: (
    category: string
  ) => void;

  onSubCategorySelect?: (
    category: string,
    subCategory: string
  ) => void;

  onItemSelect?: (
    itemId: string
  ) => void;

  onShowAll?: () => void;
};

/* =========================================
   COMPONENT
========================================= */

export default function InventoryCategoryDashboard({
  onCategorySelect,
  onSubCategorySelect,
  onItemSelect,
  onShowAll,
}: InventoryCategoryDashboardProps) {
  const { inventoryItems } =
    useAppContext();
  const currentHoldings = inventoryItems.filter(item => item.status !== 'archived');

  /* =========================================
     CATEGORY DATA
  ========================================= */

  const categoryKeys = Array.from(
    new Set(currentHoldings.map(item => normalizeInventoryCategoryKey(item.category))),
  ).sort((a, b) => {
    const aKnown = Boolean(KNOWN_CATEGORIES[a]);
    const bKnown = Boolean(KNOWN_CATEGORIES[b]);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return a.localeCompare(b);
  });

  const calculateCategoryData = (
    categoryKey: string
  ) => {
    const items =
      currentHoldings.filter(
        item =>
          normalizeInventoryCategoryKey(
            item.category
          ) === categoryKey
      );

    const valueKnownCount = items.filter(item => getInventoryCurrentValueIfKnown(item) !== null).length;
    const marketWorth = valueKnownCount
      ? items.reduce((sum, item) => sum + (getInventoryCurrentValueIfKnown(item) ?? 0) * getInventoryQuantity(item), 0)
      : null;

    const valueChange = sumInventorySavings(items);
    const savingsKnownCount = items.filter(item => getInventoryCurrentValueIfKnown(item) !== null && getInventoryPurchaseCostIfKnown(item) !== null).length;

    const subcategories =
      items.reduce(
        (acc, item) => {
          const rawLabel =
            item.subCategory?.trim() ||
            'Uncategorized';

          const key = rawLabel.toLocaleLowerCase().replace(/\s+/g, ' ');

          const existing = acc[key];

          acc[key] = {
            // Keep the first-seen casing/spacing as the readable label,
            // while still combining case/whitespace variants of the same
            // subcategory into a single tag.
            label: existing?.label || rawLabel,
            units: (existing?.units || 0) + getInventoryQuantity(item),
          };

          return acc;
        },
        {} as Record<string, { label: string; units: number }>
      );

    const latestItem =
      [...items].sort(
        (a, b) =>
          new Date(
            b.purchaseDate
          ).getTime() -
          new Date(
            a.purchaseDate
          ).getTime()
      )[0];

    return {
      count: items.length,
      valueKnownCount,
      marketWorth,
      valueChange,
      savingsKnownCount,
      subcategories,
      latestItem,
    };
  };

  /* =========================================
     GRAND TOTALS
  ========================================= */

  const purchaseCostKnownCount = currentHoldings.filter(item => getInventoryPurchaseCostIfKnown(item) !== null).length;
  const currentValueKnownCount = currentHoldings.filter(item => getInventoryCurrentValueIfKnown(item) !== null).length;
  const savingsKnownCount = currentHoldings.filter(item => getInventoryCurrentValueIfKnown(item) !== null && getInventoryPurchaseCostIfKnown(item) !== null).length;
  const totalInvestment = purchaseCostKnownCount
    ? currentHoldings.reduce((sum, item) => sum + (getInventoryPurchaseCostIfKnown(item) ?? 0) * getInventoryQuantity(item), 0)
    : null;
  const totalMarketWorth = currentValueKnownCount
    ? currentHoldings.reduce((sum, item) => sum + (getInventoryCurrentValueIfKnown(item) ?? 0) * getInventoryQuantity(item), 0)
    : null;
  const totalValueChange = sumInventorySavings(currentHoldings);

  /* =========================================
     EMPTY STATE
  ========================================= */

  if (
    currentHoldings.length === 0
  ) {
    return (
      <Card className="border-dashed border-border/60 bg-card/95 shadow-none">
        <CardContent className="py-10 text-center">
          <h3 className="text-lg font-bold">No current holdings</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Archived records remain available in Inventory, but are excluded from current totals.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* CATEGORY GRID */}
      <div
        className="
          grid grid-cols-1 gap-5
          md:grid-cols-2
          xl:grid-cols-4
        "
      >
        {categoryKeys.map(categoryKey => {
          const cat = { key: categoryKey, ...getCategoryStyle(categoryKey) };
          const {
             count,
             valueKnownCount,
             marketWorth,
            valueChange,
            savingsKnownCount,
            subcategories,
            latestItem,
          } =
            calculateCategoryData(
              cat.key
            );

          const percentage =
            totalMarketWorth !== null && marketWorth !== null && totalMarketWorth > 0
              ? (marketWorth / totalMarketWorth) * 100
              : 0;
          const valueShare =
            totalMarketWorth !== null && marketWorth !== null && totalMarketWorth > 0
              ? `${percentage.toFixed(1)}% of ${currentValueKnownCount === currentHoldings.length ? 'inventory value' : 'known value'}`
              : null;

          const latestTone =
            getRecencyTone(
              latestItem?.purchaseDate
            );

          return (
            <Card key={cat.key} className="border-border/60 bg-card/95 shadow-none">
              <CardContent className="p-4 sm:p-5">
                {/* TOP */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold">
                      {cat.label}
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {count} item{count !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onCategorySelect?.(cat.key)}
                    className="min-h-11 shrink-0 rounded-xl border border-border/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`View ${cat.label} category`}
                  >
                    View category
                  </button>
                </div>

                {/* VALUE */}
                <div className="mt-6">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Current Value
                  </p>

                  <p className="mt-2 text-xl font-bold tracking-tight tabular-nums">
                    <MonetaryNumber formatted={marketWorth === null ? 'Not entered' : formatPHP(marketWorth)} hidden={false} />
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    {valueKnownCount < count || valueShare ? (
                      <p className="text-xs text-muted-foreground">
                        {valueKnownCount < count ? `${valueKnownCount} of ${count} items valued` : valueShare}
                        {valueKnownCount < count && valueShare ? ` · ${valueShare}` : ''}
                      </p>
                    ) : null}

                    <p
                      className={`
                        flex items-center gap-1
                        text-xs font-semibold
                        ${valueChange === null || valueChange === 0
                          ? 'text-muted-foreground'
                          : valueChange > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-destructive'
                        }
                      `}
                    >
                      <span className="sr-only">Savings: </span>
                      <MonetaryNumber formatted={getSavingsLabel(valueChange)} hidden={false} />
                    </p>
                  </div>
                  {savingsKnownCount > 0 && savingsKnownCount < count ? (
                    <p className="mt-2 text-xs text-muted-foreground">{savingsKnownCount} of {count} items comparable</p>
                  ) : null}
                </div>

                {/* LAST BOUGHT */}
                <button
                  type="button"
                  disabled={!latestItem}
                  onClick={e => {
                    e.stopPropagation();

                    if (
                      latestItem?.id
                    ) {
                      onItemSelect?.(
                        latestItem.id
                      );
                    }
                  }}
                  className="
                    mt-4
                    w-full
                    rounded-2xl
                    border border-border/50
                    bg-background/40
                    p-3
                    text-left
                    transition-all
                    hover:border-primary/30
                    hover:bg-background/60
                    disabled:cursor-default
                    disabled:hover:border-border/50
                    disabled:hover:bg-background/40
                  "
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Last purchased
                    </p>

                    <span className="text-xs text-muted-foreground">{latestTone.label}</span>
                  </div>

                  <OverflowTooltip text={latestItem?.name ||
                      'No item yet'}><p className="mt-2 truncate text-sm font-black">
                    {latestItem?.name ||
                      'No item yet'}
                  </p></OverflowTooltip>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {getDaysAgoLabel(
                        latestItem?.purchaseDate
                      )}
                    </p>

                    <p className="text-xs font-bold text-muted-foreground">
                      {latestItem
                        ? (getInventoryPurchaseCostIfKnown(latestItem) === null ? 'Not entered' : formatPHP(getInventoryPurchaseCostIfKnown(latestItem)!))
                        : '—'}
                    </p>
                  </div>
                </button>

                {/* SUBCATEGORIES */}
                {Object.keys(subcategories).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(
                      subcategories
                    )
                      .filter(
                        ([, entry]) =>
                          entry.units >
                          0
                      )
                      .map(
                        ([
                          key,
                          entry,
                        ]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={e => {
                              e.stopPropagation();

                              onSubCategorySelect?.(
                                cat.key,
                                entry.label
                              );
                            }}
                            className="rounded-md px-1 py-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:bg-muted hover:text-primary hover:underline"
                          >
                            {entry.units} {entry.label}
                          </button>
                        )
                      )}
                  </div>
                )}

                {/* PROGRESS */}
                <div className="mt-5">
                  <div
                    className="
                      h-2.5
                      overflow-hidden
                      rounded-full
                      bg-muted/60
                    "
                  >
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* TOTALS */}
      <div className="border-t border-border/60 pt-4">
        <div className="px-1">
          <div
            className="
              grid gap-4
              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            <button
              type="button"
              onClick={onShowAll}
              className="rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                Purchase Cost
              </p>

              <div className="mt-2">
                <p className="text-xl font-bold tabular-nums">
                  <MonetaryNumber formatted={totalInvestment === null ? 'Not entered' : formatPHP(totalInvestment)} hidden={false} />
                </p>
                {purchaseCostKnownCount < currentHoldings.length ? <p className="mt-1 text-xs text-muted-foreground">{purchaseCostKnownCount} of {currentHoldings.length} items with cost recorded</p> : null}
              </div>
            </button>

            <button
              type="button"
              onClick={onShowAll}
              className="rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                Current Value
              </p>

              <div className="mt-2">
                <p className="text-xl font-bold tabular-nums">
                  <MonetaryNumber formatted={totalMarketWorth === null ? 'Not entered' : formatPHP(totalMarketWorth)} hidden={false} />
                </p>
                {currentValueKnownCount < currentHoldings.length ? <p className="mt-1 text-xs text-muted-foreground">{currentValueKnownCount} of {currentHoldings.length} items valued</p> : null}
              </div>
            </button>

            <button
              type="button"
              onClick={onShowAll}
              className="rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                Savings
              </p>

              <div className="mt-2">
                <p className={`text-xl font-bold tabular-nums ${totalValueChange !== null && totalValueChange !== 0 ? (totalValueChange > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive') : ''}`}>
                  <MonetaryNumber formatted={getSavingsLabel(totalValueChange)} hidden={false} />
                </p>
                {savingsKnownCount > 0 && savingsKnownCount < currentHoldings.length ? <p className="mt-1 text-xs text-muted-foreground">{savingsKnownCount} of {currentHoldings.length} items comparable</p> : null}
              </div>
            </button>

            <button
              type="button"
              onClick={onShowAll}
              className="rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                Total Items
              </p>

              <div className="mt-2">
                <p className="text-xl font-bold tabular-nums">
                  {currentHoldings.length}
                </p>
              </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  Across {categoryKeys.length} {categoryKeys.length === 1 ? 'category' : 'categories'}
                </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
