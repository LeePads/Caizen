'use client';

import { EyeOff } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ReportBalanceTrendPoint } from '@/lib/finance/reports';
import { convertFromBaseCurrency, formatPHP, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';

const NO_SELECTION = '__none__';
const formatAxisAmount = (value: number) => {
  const currency = getEffectiveMoneyInputCurrency();
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
  }).format(convertFromBaseCurrency(value, currency));
};
const lastVisibleBalanceChartDataset = new Map<string, string>();

const CHART_CONFIG = {
  available: { label: 'Available / On hand', color: 'var(--chart-1)' },
  protected: { label: 'Protected / Savings', color: 'var(--chart-2)' },
} satisfies ChartConfig;

type ReportBalanceTrendChartProps = {
  points: ReportBalanceTrendPoint[];
  hasProtectedSeries: boolean;
  hidden: boolean;
  selectedPointKey: string | null;
  onSelectPoint: (pointKey: string | null) => void;
};

type ChartClickState = {
  activePayload?: Array<{ payload?: ReportBalanceTrendPoint }>;
};

function HiddenChart() {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 text-center">
      <EyeOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-bold text-muted-foreground">Amounts hidden</p>
      <p className="text-xs text-muted-foreground">Show balances to view the trend.</p>
    </div>
  );
}

function ReportBalanceTrendChart({
  points,
  hasProtectedSeries,
  hidden,
  selectedPointKey,
  onSelectPoint,
}: ReportBalanceTrendChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeDrawDatasetSignature, setActiveDrawDatasetSignature] = useState<string | null>(null);
  const animationCompletionRef = useRef({ signature: '', completed: 0 });
  const motionMode = useCaizenMotionMode();
  const chartDataSignature = JSON.stringify(points.map(point => [
    point.key, point.shortLabel, point.available, point.protected, point.total,
  ]));
  const chartDataCacheRef = useRef<{
    signature: string;
    data: Array<ReportBalanceTrendPoint & { label: string }>;
  } | null>(null);
  if (chartDataCacheRef.current?.signature !== chartDataSignature) {
    chartDataCacheRef.current = {
      signature: chartDataSignature,
      data: points.map(point => ({ ...point, label: point.shortLabel })),
    };
  }
  const chartData = chartDataCacheRef.current.data;
  const visibleTickCount = Math.max(2, Math.floor(((chartWidth || 320) - 72) / 64));
  const tickInterval = Math.max(0, Math.ceil(points.length / visibleTickCount) - 1);

  useEffect(() => {
    const node = chartRef.current;
    if (!node || hidden) return;
    setChartWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setChartWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hidden]);
  const pointOptions = useMemo(
    () => [
      { value: NO_SELECTION, label: 'No date selected' },
      ...points.map(point => ({ value: point.key, label: point.label })),
    ],
    [points],
  );
  const datasetSignature = useMemo(() => JSON.stringify([
    hasProtectedSeries,
    points.map(point => [point.key, point.available, point.protected, point.total]),
  ]), [hasProtectedSeries, points]);

  useEffect(() => {
    if (hidden || motionMode === 'reduced' || motionMode === 'constrained') {
      setActiveDrawDatasetSignature(null);
    }
    if (hidden || points.length < 2) return;
    let isVisible = false;

    const markVisibleDataset = () => {
      if (!isVisible || lastVisibleBalanceChartDataset.get('money-report-movement') === datasetSignature) return;
      lastVisibleBalanceChartDataset.set('money-report-movement', datasetSignature);
      if (motionMode === 'full' || motionMode === 'android') {
        animationCompletionRef.current = { signature: datasetSignature, completed: 0 };
        setActiveDrawDatasetSignature(datasetSignature);
      }
    };

    const node = chartRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      isVisible = true;
      markVisibleDataset();
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? false;
      markVisibleDataset();
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [datasetSignature, hidden, motionMode, points.length]);

  const drawLine = !hidden
    && (motionMode === 'full' || motionMode === 'android')
    && activeDrawDatasetSignature === datasetSignature;
  const drawDuration = motionMode === 'android' ? 140 : 220;
  const handleLineAnimationEnd = () => {
    const completion = animationCompletionRef.current;
    if (completion.signature !== datasetSignature) return;
    completion.completed += 1;
    if (completion.completed >= (hasProtectedSeries ? 2 : 1)) {
      setActiveDrawDatasetSignature(current => current === datasetSignature ? null : current);
    }
  };

  const handleChartClick = (state?: ChartClickState) => {
    const point = state?.activePayload?.[0]?.payload;
    if (point?.key) onSelectPoint(point.key);
  };

  if (hidden) return <HiddenChart />;

  return (
    <div className="space-y-3">
      <div ref={chartRef}>
        <ChartContainer
          config={CHART_CONFIG}
          className="h-56 w-full min-w-0 aspect-auto @min-[30rem]/report:h-72"
          role="img"
          aria-label="Report balance trend line chart"
        >
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onClick={handleChartClick}
          >
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis
              dataKey="label"
              interval={tickInterval}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={value => formatAxisAmount(Number(value))}
              width={72}
            />
            <ChartTooltip
              content={(
                <ChartTooltipContent
                  labelFormatter={value => String(value)}
                  formatter={(value, name) => (
                    <span>{String(name)}: {formatPHP(Number(value))}</span>
                  )}
                />
              )}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              key={`available:${datasetSignature}`}
              type="monotone"
              dataKey="available"
              stroke="var(--color-available)"
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
              isAnimationActive={drawLine}
              animationBegin={0}
              animationDuration={drawDuration}
              animationEasing="ease-out"
              onAnimationEnd={handleLineAnimationEnd}
            />
            {hasProtectedSeries ? (
              <Line
                key={`protected:${datasetSignature}`}
                type="monotone"
                dataKey="protected"
                stroke="var(--color-protected)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
                isAnimationActive={drawLine}
                animationBegin={0}
                animationDuration={drawDuration}
                animationEasing="ease-out"
                onAnimationEnd={handleLineAnimationEnd}
              />
            ) : null}
          </LineChart>
        </ChartContainer>
      </div>

      <div className="max-w-md">
        <AndroidAdaptiveSelect
          label="View transactions for a trend date"
          value={selectedPointKey || NO_SELECTION}
          options={pointOptions}
          onChange={value => onSelectPoint(value === NO_SELECTION ? null : value)}
          searchable={points.length > 12}
        />
      </div>

      <ul className="sr-only" aria-label="Report balance trend values">
        {points.map(point => (
          <li key={point.key}>
            {point.label}: available {formatPHP(point.available)}, protected {formatPHP(point.protected)}, total {formatPHP(point.total)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(ReportBalanceTrendChart);
