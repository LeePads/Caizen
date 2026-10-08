'use client';

import { EyeOff } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatPHP } from '@/lib/currency';
import type { ReportBreakdownRow } from '@/lib/finance/reports';

const BREAKDOWN_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#6f91b6',
  '#8d719c',
  '#6e9b72',
  '#c47a5d',
  '#89939b',
  '#b07089',
  '#6a8f9a',
];

const CHART_CONFIG = {
  amount: { label: 'Amount', color: 'var(--chart-1)' },
} satisfies ChartConfig;

type Props = {
  rows: ReportBreakdownRow[];
  hidden: boolean;
  direction: 'expense' | 'income';
  androidPresentation?: boolean;
};

type ChartRow = ReportBreakdownRow & { fill: string };

function ReportBreakdownChart({ rows, hidden, direction, androidPresentation = false }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartData = useMemo<ChartRow[]>(
    () => rows.map((row, index) => ({
      ...row,
      fill: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
    })),
    [rows],
  );
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  if (hidden) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 text-center">
        <EyeOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-bold text-muted-foreground">Amounts hidden</p>
        <p className="text-xs text-muted-foreground">Show balances to view this breakdown.</p>
      </div>
    );
  }

  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">No {direction} data in this period.</p>;
  }

  const chart = (
    <div className={androidPresentation ? 'android-report-breakdown-chart-region relative mx-auto min-w-0' : 'relative mx-auto h-52 w-full max-w-[14rem] min-w-0'}>
      <ChartContainer
        config={CHART_CONFIG}
        className={androidPresentation ? 'android-report-breakdown-chart-container' : 'h-full w-full aspect-square'}
        responsiveAspect={androidPresentation ? 1 : undefined}
        role="img"
        aria-label={`${direction} category breakdown pie chart`}
      >
        <PieChart margin={androidPresentation ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined}>
          <Pie
            data={chartData}
            dataKey="amount"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={androidPresentation ? '62%' : '54%'}
            outerRadius={androidPresentation ? '90%' : '78%'}
            paddingAngle={rows.length > 1 ? 2 : 0}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {chartData.map((row, index) => (
              <Cell
                key={row.id}
                fill={row.fill}
                opacity={activeIndex === null || activeIndex === index ? 1 : 0.62}
              />
            ))}
          </Pie>
          <ChartTooltip
            content={(
              <ChartTooltipContent
                hideLabel
                formatter={(value, name, item) => {
                  const row = item.payload as ChartRow;
                  return (
                    <div className="flex min-w-[13rem] items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{row.label || String(name)}</span>
                      <span className="font-mono tabular-nums">{formatPHP(Number(value))}</span>
                      <span className="text-muted-foreground">{row.percentage.toFixed(0)}%</span>
                    </div>
                  );
                }}
              />
            )}
          />
        </PieChart>
      </ChartContainer>
      {!androidPresentation ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-label text-muted-foreground">Total {direction}</span>
          <span className="mt-1 max-w-[50%] break-words text-sm font-bold tabular-nums text-foreground">{formatPHP(total)}</span>
        </div>
      ) : null}
    </div>
  );

  if (androidPresentation) {
    return (
      <div className="android-report-breakdown">
        <div className="android-report-breakdown-chart">{chart}</div>
        <div className="android-report-breakdown-total" aria-label={`Total ${direction}`}>
          <span>Total {direction}</span>
          <strong>{formatPHP(total)}</strong>
        </div>
        <div className="android-report-breakdown-list" aria-label={`${direction} category breakdown`}>
          {chartData.map(row => (
            <div key={row.id} className="android-report-breakdown-row">
              <span className="android-report-breakdown-category">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} aria-hidden="true" />
                <span className="min-w-0 break-words font-bold">{row.label}</span>
              </span>
              <span className="font-bold tabular-nums">{formatPHP(row.amount)}</span>
              <span className="w-12 text-right font-bold tabular-nums text-muted-foreground">{row.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 @min-[34rem]/report:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] @min-[34rem]/report:items-center">
      {chart}

      <dl className="min-w-0" aria-label={`${direction} category breakdown`}>
        {chartData.map(row => (
          <div key={row.id} className="grid min-w-0 gap-1 border-b border-border/40 py-3 last:border-0 @min-[30rem]/report:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @min-[30rem]/report:gap-3">
            <dt className="flex min-w-0 items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} aria-hidden="true" />
              <span className="min-w-0 break-words text-sm font-bold">{row.label}</span>
            </dt>
            <dd className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pl-4.5 text-sm tabular-nums @min-[30rem]/report:justify-end @min-[30rem]/report:pl-0">
              <span className="min-w-0 break-words font-bold">{formatPHP(row.amount)}</span>
              <span className="text-muted-foreground">{row.percentage.toFixed(0)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default memo(ReportBreakdownChart);
