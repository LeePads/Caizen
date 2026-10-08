'use client';

import { useMemo, useState } from 'react';
import type { SkincareProduct, SkincareUsageEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  getSkincareUsageBucketsForEvents,
  getSkincareUsageEventsForPeriod,
  getSkincareUsageOverallSummary,
  type SkincareUsageBucket,
  type SkincareUsageRange,
} from '@/lib/skincare/usage';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Range = SkincareUsageRange;

function bucketLabel(bucket: SkincareUsageBucket, range: Range) {
  const start = bucket.start;
  if (range === 'monthly') {
    return start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  if (range === 'weekly') {
    const end = new Date(bucket.end);
    end.setDate(end.getDate() - 1);
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
      ? `${startLabel}-${end.getDate()}`
      : `${startLabel}-${endLabel}`;
  }
  return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function rangeLabel(range: Range) {
  return range === 'daily' ? 'last 30 days' : range === 'weekly' ? 'last 12 weeks' : 'last 12 months';
}

export default function SkincareUsageStats({
  products,
  events,
  now = new Date(),
  onUpdateEvent,
  onDeleteEvent,
}: {
  products: SkincareProduct[];
  events: SkincareUsageEvent[];
  now?: Date;
  onUpdateEvent: (id: string, usedAt: Date) => void;
  onDeleteEvent: (id: string) => void;
}) {
  const [range, setRange] = useState<Range>('daily');
  const [showHistory, setShowHistory] = useState(false);
  const productNames = useMemo(() => new Map(products.map(product => [product.id, product.name])), [products]);
  const periodEvents = useMemo(
    () => getSkincareUsageEventsForPeriod(events, range, now),
    [events, now, range],
  );
  const summary = useMemo(
    () => getSkincareUsageOverallSummary(events, products, range, now),
    [events, now, products, range],
  );
  const buckets = useMemo(
    () => getSkincareUsageBucketsForEvents(periodEvents, range, now),
    [now, periodEvents, range],
  );
  const max = Math.max(1, ...buckets.map(bucket => bucket.count));
  const visibleEvents = showHistory ? periodEvents : periodEvents.slice(0, 10);
  const olderCount = Math.max(0, periodEvents.length - 10);
  const chartWidthClass = buckets.length > 8 ? 'min-w-[28rem]' : 'min-w-full';
  const productNameForEvent = (event: SkincareUsageEvent) =>
    productNames.get(event.productId) || event.productNameSnapshot || 'Deleted product';
  const summaryMetrics = [
    { label: 'Total uses', value: String(summary.totalUses), hint: rangeLabel(range), visible: true },
    { label: 'Most used', value: summary.mostUsedProduct?.productName || '-', hint: summary.mostUsedProduct ? `${summary.mostUsedProduct.count} uses` : 'No usage yet', visible: true },
    { label: 'Recent use', value: summary.lastUsedAt ? summary.lastUsedAt.toLocaleDateString() : '-', hint: 'Last logged event', visible: true },
    { label: 'Today', value: String(summary.todayUses), hint: undefined, visible: range === 'daily' || summary.todayUses > 0 },
    { label: 'This week', value: String(summary.weekUses), hint: undefined, visible: range === 'weekly' || summary.weekUses > 0 },
    { label: 'This month', value: String(summary.monthUses), hint: undefined, visible: range === 'monthly' || summary.monthUses > 0 },
  ].filter(metric => metric.visible);

  return (
    <section className="section-surface p-4 sm:p-5" aria-labelledby="skincare-usage-heading">
      <div>
        <h2 id="skincare-usage-heading" className="text-lg font-black">Usage insights</h2>
        <p className="mt-1 text-xs text-muted-foreground">All logged products, including retained history for deleted products.</p>
      </div>

      <div className="mt-4 inline-flex max-w-full rounded-xl border border-border/60 bg-background/35 p-1" role="tablist" aria-label="Usage timeframe">
        {(['daily', 'weekly', 'monthly'] as Range[]).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={range === value}
            onClick={() => {
              setRange(value);
              setShowHistory(false);
            }}
            className={`min-h-9 rounded-lg px-3 text-xs font-black capitalize transition-colors ${range === value ? 'bg-primary/12 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {value}
          </button>
        ))}
      </div>

      {periodEvents.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/50 py-3 sm:grid-cols-3 xl:grid-cols-6">
            {summaryMetrics.map(metric => (
              <div key={metric.label}>
                <p className="text-[10px] uppercase text-muted-foreground">{metric.label}</p>
                <p className="mt-1 truncate text-sm font-black">{metric.value}</p>
                {metric.hint ? <p className="text-[10px] text-muted-foreground">{metric.hint}</p> : null}
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto pb-2">
            <div className={`flex h-28 items-end gap-1 ${chartWidthClass}`} role="img" aria-label={`${range} skincare usage chart`}>
              {buckets.map(bucket => {
                const label = bucketLabel(bucket, range);
                return (
                  <div key={bucket.key} className="flex min-w-4 flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground">{bucket.count || ''}</span>
                    <Tooltip><TooltipTrigger asChild><div tabIndex={0} role="img" aria-label={`${label}: ${bucket.count} use${bucket.count === 1 ? '' : 's'}`} className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(bucket.count ? 8 : 2, (bucket.count / max) * 82)}%` }}/></TooltipTrigger><TooltipContent>{`${label}: ${bucket.count} use${bucket.count === 1 ? '' : 's'}`}</TooltipContent></Tooltip>
                    <span className="max-w-16 truncate text-[9px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="sr-only">{range} usage buckets: {buckets.map(bucket => `${bucketLabel(bucket, range)} ${bucket.count}`).join(', ')}</p>

          <div className="mt-3">
            <p className="mb-2 text-xs font-bold text-muted-foreground">Usage history</p>
            <div className="space-y-2">
              {visibleEvents.map(event => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate"><strong>{productNameForEvent(event)}</strong> - {event.usedAt.toLocaleString()} - {event.source}</span>
                  <span className="flex gap-1">
                    <input
                      aria-label={`Edit usage timestamp ${event.id}`}
                      type="datetime-local"
                      value={new Date(event.usedAt.getTime() - event.usedAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                      onChange={input => onUpdateEvent(event.id, new Date(input.target.value))}
                      className="control-input h-9 w-44 text-xs"
                    />
                    <button type="button" onClick={() => onDeleteEvent(event.id)} className="min-h-9 rounded-lg border border-red-500/30 px-2 text-red-500">Delete</button>
                  </span>
                </div>
              ))}
            </div>
            {olderCount ? (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setShowHistory(value => !value)}>
                {showHistory ? 'Show latest 10' : `Show older history (${olderCount})`}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/30 p-4">
          <p className="text-sm font-black">{events.length ? `No usage logged in the ${rangeLabel(range)}.` : 'No skincare usage logged yet.'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Log a use from a product card or switch timeframe to view available history.</p>
        </div>
      )}
    </section>
  );
}
