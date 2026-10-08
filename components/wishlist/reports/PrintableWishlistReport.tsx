'use client';

/* eslint-disable @next/next/no-img-element */
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { formatCurrency } from '@/lib/currency';
import type { CurrencyCode } from '@/lib/types';
import type { WishlistExportDocument, WishlistExportPdfOptions } from '@/lib/collections/wishlist-exports';

const COLORS = ['#568985', '#c79232', '#6f91b6', '#8d719c', '#6e9b72', '#c47a5d', '#89939b'];
const amount = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined) return '—';
  return formatCurrency(value, currency as CurrencyCode);
};
const dateLabel = (value: Date) => value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

function Donut({ document }: { document: WishlistExportDocument }) {
  const { segments, totalEstimated } = document.chart;
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  if (!segments.length || !totalEstimated) return <p className="collection-print-chart-empty">No estimated-cost data available for this breakdown.</p>;
  return (
    <div className="collection-print-donut-wrap">
      <svg className="collection-print-donut" viewBox="0 0 120 120" role="img" aria-label="Estimated Plan cost by category">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="15" />
        {segments.map(segment => {
          const length = circumference * segment.value / totalEstimated;
          const current = offset;
          offset += length;
          return <circle key={segment.label} cx="60" cy="60" r={radius} fill="none" stroke={COLORS[segment.colorIndex % COLORS.length]} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-current} strokeWidth="15" transform="rotate(-90 60 60)" />;
        })}
        <text x="60" y="55" textAnchor="middle" className="collection-print-donut-label">Estimated</text>
        <text x="60" y="67" textAnchor="middle" className="collection-print-donut-total">{amount(totalEstimated, document.currency)}</text>
      </svg>
    </div>
  );
}

export default function PrintableWishlistReport({
  reportDocument,
  pdfOptions = { includeDetails: true, includeNotes: false, includeCategoryChart: true },
  onAfterPrint,
}: {
  reportDocument: WishlistExportDocument;
  pdfOptions?: WishlistExportPdfOptions;
  onAfterPrint?: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('collection-print-active');
    const after = () => onAfterPrint?.();
    window.addEventListener('afterprint', after);
    const timer = window.setTimeout(() => {
      try { window.print(); } catch { onAfterPrint?.(); }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('collection-print-active');
    };
  }, [onAfterPrint]);

  const { summary } = reportDocument;
  return createPortal(
    <div className="collection-print-portal" aria-hidden="true">
      <article className="collection-print-document">
        <header className="collection-print-header">
          <img className="collection-print-logo" src="/icons/caizen-primary-light-3000.png" alt="Caizen" />
          <div><h1>Plans Report</h1><p>{reportDocument.profileName} · {reportDocument.scopeLabel}</p></div>
          <dl><div><dt>Generated</dt><dd>{dateLabel(reportDocument.generatedAt)}</dd></div><div><dt>Filters</dt><dd>{reportDocument.filterSummary}</dd></div></dl>
        </header>
        <section>
          <h2>Summary</h2>
          <div className="collection-print-summary-strip">
            {[
              ['Plans', summary.itemRecords.toLocaleString()],
              ['Estimated total', amount(summary.estimatedTotal, reportDocument.currency)],
              ['Actual paid', amount(summary.actualPaidTotal, reportDocument.currency)],
              ['Categories', summary.categoryCount.toLocaleString()],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>
        <section>
          <h2>Plans breakdown</h2>
          {reportDocument.categories.length ? (
            <div className={`collection-print-breakdown-grid${pdfOptions.includeCategoryChart ? '' : ' collection-print-breakdown-grid--table-only'}`}>
              {pdfOptions.includeCategoryChart ? <Donut document={reportDocument} /> : null}
              <div><h3>Estimated cost by category</h3><table className="collection-print-table"><thead><tr><th>Category</th><th>Plans</th><th>Estimated</th><th>Share</th></tr></thead><tbody>{reportDocument.categories.map(category => <tr key={category.category}><td><span className="collection-print-swatch" style={{ backgroundColor: COLORS[category.chartColorIndex % COLORS.length] }} />{category.category}</td><td>{category.itemRecords}</td><td>{amount(category.estimatedTotal, reportDocument.currency)}</td><td>{category.share === null ? '—' : `${category.share.toFixed(1)}%`}</td></tr>)}</tbody></table></div>
            </div>
          ) : <p className="collection-print-empty">No Plan categories match this export.</p>}
        </section>
        <section><h2>Status and priority</h2><div className="collection-print-counts">{Object.entries(summary.statusCounts).map(([label, count]) => <div key={label}><strong>{label}</strong><span>{count}</span></div>)}{Object.entries(summary.priorityCounts).map(([label, count]) => <div key={`priority-${label}`}><strong>{label} priority</strong><span>{count}</span></div>)}</div></section>
        {pdfOptions.includeDetails ? <section className="collection-print-details"><h2>Plan details</h2>{reportDocument.items.length ? <table className="collection-print-table"><thead><tr><th>Plan</th><th>Type</th><th>Category</th><th>Status</th><th>Estimated</th><th>Actual</th><th>Target date</th><th>Completed date</th></tr></thead><tbody>{reportDocument.items.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.type}</td><td>{item.category}</td><td>{item.status}</td><td>{amount(item.estimatedPrice, reportDocument.currency)}</td><td>{amount(item.actualPrice, reportDocument.currency)}</td><td>{item.targetDate || '—'}</td><td>{item.completedDate || '—'}</td></tr>)}</tbody></table> : <p className="collection-print-empty">No Plans match this export scope.</p>}</section> : null}
        {pdfOptions.includeNotes ? <section className="collection-print-notes"><h2>Notes</h2>{reportDocument.items.some(item => item.notes.trim()) ? <div>{reportDocument.items.filter(item => item.notes.trim()).map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{item.notes}</p></div>)}</div> : <p className="collection-print-empty">No notes are included in this export.</p>}</section> : null}
      </article>
    </div>,
    document.body,
  );
}
