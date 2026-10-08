'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@/lib/currency';
import type { CurrencyCode } from '@/lib/types';

import type {
  InventoryExportDocument,
  InventoryExportPdfOptions,
} from '@/lib/collections/inventory-exports';

type Props = {
  reportDocument: InventoryExportDocument;
  pdfOptions?: InventoryExportPdfOptions;
  onAfterPrint?: () => void;
};

const CHART_COLORS = ['#568985', '#c79232', '#6f91b6', '#8d719c', '#6e9b72', '#c47a5d', '#89939b'];
const STATUS_ORDER = ['Using', 'Stored', 'Maintenance', 'Replace soon', 'Retired', 'Archived'];

function amount(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return '—';
  return formatCurrency(value, currency as CurrencyCode);
}

function dateLabel(value: Date) {
  return value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function DonutChart({ reportDocument }: { reportDocument: InventoryExportDocument }) {
  const { segments, totalCurrentValue } = reportDocument.chart;
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!segments.length || totalCurrentValue === null || totalCurrentValue === 0) {
    return <p className="inventory-print-chart-empty">No current-value data available for this breakdown.</p>;
  }

  return (
    <div className="inventory-print-donut-wrap">
      <svg className="inventory-print-donut" viewBox="0 0 120 120" role="img" aria-label="Known current value by inventory category">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="15" />
        {segments.map(segment => {
          const length = circumference * (segment.value / totalCurrentValue);
          const dash = `${length} ${circumference - length}`;
          const currentOffset = offset;
          offset += length;
          return (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={CHART_COLORS[segment.colorIndex % CHART_COLORS.length]}
              strokeDasharray={dash}
              strokeDashoffset={-currentOffset}
              strokeWidth="15"
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text x="60" y="55" textAnchor="middle" className="inventory-print-donut-label">Current Value</text>
        <text x="60" y="67" textAnchor="middle" className="inventory-print-donut-total">{amount(totalCurrentValue, reportDocument.currency)}</text>
      </svg>
    </div>
  );
}

export default function PrintableInventoryReport({ reportDocument, pdfOptions = { includeDetails: true, includeNotes: false, includeCategoryChart: true }, onAfterPrint }: Props) {
  useEffect(() => {
    const handleAfterPrint = () => onAfterPrint?.();
    window.addEventListener('afterprint', handleAfterPrint);
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        onAfterPrint?.();
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [onAfterPrint]);

  const { summary } = reportDocument;
  const summaryItems = [
    ['Items', summary.itemRecords.toLocaleString()],
    ['Known Purchase Cost', amount(summary.purchaseCostTotal, reportDocument.currency)],
    ['Known Current Value', amount(summary.currentValueTotal, reportDocument.currency)],
    ['Savings vs Current Price', amount(summary.savingsVsCurrentPriceTotal, reportDocument.currency)],
    ['Replacement Cost', amount(summary.replacementCostTotal, reportDocument.currency)],
    ['Categories', summary.categoryCount.toLocaleString()],
  ];
  const statusRows = STATUS_ORDER
    .filter(status => summary.statusCounts[status])
    .map(status => [status, summary.statusCounts[status]] as const);
  Object.entries(summary.statusCounts).forEach(([status, count]) => {
    if (!STATUS_ORDER.includes(status)) statusRows.push([status, count]);
  });

  return createPortal(
    <div className="inventory-print-portal" aria-hidden="true">
      <article className="inventory-print-document">
        <header className="inventory-print-header">
          <img className="inventory-print-logo" src="/icons/caizen-primary-light-3000.png" alt="Caizen" />
          <div>
            <h1>Inventory Report</h1>
            <p className="inventory-print-scope">{reportDocument.profileName} · {reportDocument.scopeLabel}</p>
          </div>
          <dl>
            <div><dt>Generated</dt><dd>{dateLabel(reportDocument.generatedAt)}</dd></div>
            <div><dt>Filters</dt><dd>{reportDocument.filterSummary}</dd></div>
          </dl>
        </header>

        <section>
          <h2>Summary</h2>
          <div className="inventory-print-summary-strip">
            {summaryItems.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          {summary.replacementEstimateCount ? (
            <p className="inventory-print-note">Replacement cost includes {summary.replacementEstimateCount.toLocaleString()} item record{summary.replacementEstimateCount === 1 ? '' : 's'} with an estimate.</p>
          ) : null}
          {summary.purchaseCostKnownCount < summary.itemRecords || summary.currentValueKnownCount < summary.itemRecords ? (
            <p className="inventory-print-note">
              Known price coverage: Purchase Cost {summary.purchaseCostKnownCount.toLocaleString()}/{summary.itemRecords.toLocaleString()} records · Current Value {summary.currentValueKnownCount.toLocaleString()}/{summary.itemRecords.toLocaleString()} records.
            </p>
          ) : null}
          {summary.savingsEstimateCount ? (
            <p className="inventory-print-note">Savings versus current price includes {summary.savingsEstimateCount.toLocaleString()} item record{summary.savingsEstimateCount === 1 ? '' : 's'} with both values available.</p>
          ) : null}
        </section>

        <section>
          <h2>Portfolio breakdown</h2>
          {reportDocument.categories.length ? (
            <div className={`inventory-print-breakdown-grid${pdfOptions.includeCategoryChart ? '' : ' inventory-print-breakdown-grid--table-only'}`}>
              {pdfOptions.includeCategoryChart ? <DonutChart reportDocument={reportDocument} /> : null}
              <div className="inventory-print-category-table-wrap">
                <h3>Inventory by category</h3>
                <table className="inventory-print-table">
                  <thead><tr><th>Category</th><th>Items</th><th>Known purchase cost</th><th>Known current value</th><th>Savings vs current price</th><th>Share</th></tr></thead>
                  <tbody>{reportDocument.categories.map(category => (
                    <tr key={category.category}>
                      <td><span className="inventory-print-swatch" style={{ backgroundColor: CHART_COLORS[category.chartColorIndex % CHART_COLORS.length] }} />{category.category}</td>
                      <td>{category.itemRecords.toLocaleString()}</td>
                      <td>{amount(category.purchaseCostTotal, reportDocument.currency)}<small className="inventory-print-note">{category.purchaseCostKnownCount}/{category.itemRecords} records</small></td>
                      <td>{amount(category.currentValueTotal, reportDocument.currency)}<small className="inventory-print-note">{category.currentValueKnownCount}/{category.itemRecords} records</small></td>
                      <td>{amount(category.savingsVsCurrentPriceTotal, reportDocument.currency)}</td>
                      <td>{category.share === null ? '—' : `${category.share.toFixed(1)}%`}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ) : <p className="inventory-print-empty">No category records are included in this export.</p>}
        </section>

        <section>
          <h2>Status</h2>
          {statusRows.length ? (
            <div className="inventory-print-status-list">
              {statusRows.map(([status, count]) => (
                <div key={status}><span className="inventory-print-status-marker" /> <strong>{status}</strong><span>{count.toLocaleString()}</span></div>
              ))}
            </div>
          ) : <p className="inventory-print-empty">No status records are included in this export.</p>}
        </section>

        {pdfOptions.includeDetails ? (
          <section className="inventory-print-items-section">
            <h2>Item details</h2>
            {reportDocument.items.length ? (
              <table className="inventory-print-table inventory-print-items-table">
                <thead><tr><th>Item</th><th>Category / subcategory</th><th>Qty / unit</th><th>Purchase</th><th>Current</th><th>Savings vs current price</th><th>Replacement</th><th>Status</th><th>Location</th></tr></thead>
                <tbody>{reportDocument.items.map((item, index) => (
                  <tr key={`${item.name}-${item.acquired}-${index}`}>
                    <td>{item.name}</td>
                    <td>{[item.category, item.subcategory].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{item.quantity.toLocaleString()} {item.unit}</td>
                    <td>{amount(item.purchaseCost, reportDocument.currency)}</td>
                    <td>{amount(item.currentValue, reportDocument.currency)}</td>
                    <td>{amount(item.savingsVsCurrentPrice, reportDocument.currency)}</td>
                    <td>{amount(item.replacementCost, reportDocument.currency)}</td>
                    <td>{item.status}</td>
                    <td>{item.location || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="inventory-print-empty">No inventory items match this export scope.</p>}
          </section>
        ) : null}

        {pdfOptions.includeNotes ? (
          <section className="inventory-print-notes-section">
            <h2>Notes</h2>
            {reportDocument.items.some(item => item.notes.trim()) ? (
              <div className="inventory-print-notes-list">
                {reportDocument.items.filter(item => item.notes.trim()).map((item, index) => (
                  <div key={`${item.name}-note-${index}`}><strong>{item.name}</strong><p>{item.notes}</p></div>
                ))}
              </div>
            ) : <p className="inventory-print-empty">No notes are included in this export.</p>}
          </section>
        ) : null}
      </article>
    </div>,
    document.body,
  );
}
