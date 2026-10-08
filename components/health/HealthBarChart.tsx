'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type HealthBarChartPoint = {
  label: string;
  value: number;
  hasData: boolean;
  title: string;
};

/** Charts with this many points or fewer label every bucket. */
const FULL_LABEL_POINT_LIMIT = 12;
const MIN_SPARSE_LABEL_WIDTH = 44;

/**
 * Label density follows the points actually rendered, not a nominal range.
 * Week (7), Month (4), and Year (12) charts always label every bucket; denser
 * charts thin labels to fit the measured width.
 */
export function getHealthChartLabelInterval(pointCount: number, availableWidth = 0) {
  if (pointCount <= FULL_LABEL_POINT_LIMIT) return 1;
  if (availableWidth <= 0) return Math.ceil(pointCount / 6);
  const labelsThatFit = Math.max(2, Math.floor(availableWidth / MIN_SPARSE_LABEL_WIDTH));
  return Math.max(1, Math.ceil(pointCount / labelsThatFit));
}

function getHealthChartDensity(pointCount: number, availableWidth: number) {
  if (pointCount <= 7) return { minPointWidth: 28, gap: 8 };
  if (pointCount <= FULL_LABEL_POINT_LIMIT) return { minPointWidth: 16, gap: 4 };
  if (pointCount <= 31) return availableWidth > 620
    ? { minPointWidth: 14, gap: 2 }
    : { minPointWidth: 10, gap: 0 };
  if (pointCount <= 100) return { minPointWidth: 6, gap: 0 };
  return { minPointWidth: 3, gap: 0 };
}

export function HealthBarChart({
  points,
  colorClass,
  chartLabel,
}: {
  points: HealthBarChartPoint[];
  colorClass: string;
  chartLabel: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const labelInterval = getHealthChartLabelInterval(points.length, availableWidth);
  const labelsEveryPoint = labelInterval === 1;
  const maximum = Math.max(0, ...points.filter(point => point.hasData).map(point => point.value));
  const density = getHealthChartDensity(points.length, availableWidth);
  const minimumContentWidth = points.length * density.minPointWidth + Math.max(0, points.length - 1) * density.gap;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const updateWidth = () => {
      const nextWidth = Math.max(0, chart.clientWidth - 32);
      setAvailableWidth(current => current === nextWidth ? current : nextWidth);
    };

    updateWidth();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateWidth);
    observer?.observe(chart);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    setNeedsScroll(minimumContentWidth > availableWidth);
  }, [availableWidth, minimumContentWidth]);

  return (
    <>
    <div
      ref={chartRef}
      className={`caizen-health-trends-chart h-48 rounded-xl border border-border/60 bg-muted/15 p-4 ${needsScroll ? 'overflow-x-auto overscroll-x-contain' : 'overflow-x-hidden'}`}
      aria-label={chartLabel}
      aria-hidden="true"
    >
      <div
        className="flex h-full snap-x snap-proximity items-end"
        style={{
          gap: `${density.gap}px`,
          minWidth: needsScroll ? `${minimumContentWidth}px` : '100%',
        }}
      >
        {points.map((point, index) => {
          const showLabel = index % labelInterval === 0 || index === points.length - 1;
          const positive = point.hasData && point.value > 0 && maximum > 0;
          const markerHeight = positive ? `${(point.value / maximum) * 100}%` : point.hasData ? '2px' : '3px';

          return (
            <div
              key={`${point.label}-${index}`}
              className={`caizen-health-trends-bar-group flex h-full snap-start flex-col items-center gap-2 ${needsScroll ? 'shrink-0' : 'min-w-0 flex-1'}`}
              style={needsScroll ? { width: density.minPointWidth } : undefined}
            >
              <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                <Tooltip><TooltipTrigger asChild><div tabIndex={0} role="img" aria-label={point.title}
                  className={`caizen-health-trends-bar w-full max-w-12 ${positive ? `rounded-t-lg ${colorClass}` : point.hasData ? `rounded-full ${colorClass}` : 'rounded-full border border-dashed border-border/70 bg-transparent'}`}
                  style={{
                    '--trend-height': markerHeight,
                    '--trend-delay': `${Math.min(index * 16, 180)}ms`,
                  } as CSSProperties}
                /></TooltipTrigger><TooltipContent>{point.title}</TooltipContent></Tooltip>
              </div>
              <span className={`min-h-4 text-caption text-muted-foreground ${labelsEveryPoint ? 'w-full break-words text-center leading-tight' : `whitespace-nowrap ${index === 0 ? 'self-start' : index === points.length - 1 ? 'self-end' : ''}`}`}>
                {showLabel ? point.label : '\u00a0'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
    {needsScroll ? <p className="mt-2 text-caption text-muted-foreground" aria-hidden="true">Swipe or scroll to see all dates.</p> : null}
    </>
  );
}
