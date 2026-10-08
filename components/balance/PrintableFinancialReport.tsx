'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

import { getTransactionSignedAmount } from '@/lib/transactions';
import { parseLocalDateKey } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/currency';
import type { CurrencyCode } from '@/lib/types';
import type { FinancialExportDocument } from '@/lib/finance/exports';

type Props = {
  reportDocument: FinancialExportDocument;
  includeDetails: boolean;
  onAfterPrint?: () => void;
};

type PrintSlice = {
  label: string;
  amount: number;
  percentage: number;
  color: string;
};

const PRINT_SLICE_COLORS = ['#568985', '#c79232', '#6f9c70', '#b96b61', '#7b8794', '#8a6f9f', '#9aa4aa'];

function amount(value: number, currency: string) {
  return formatCurrency(value, currency as CurrencyCode);
}

function dateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function dateKeyLabel(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  return date?.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) || dateKey;
}

function categoryLabel(
  transaction: FinancialExportDocument['transactions'][number],
  reportDocument: FinancialExportDocument,
) {
  const category = reportDocument.categories.find(item => item.id === transaction.categoryId);
  const subcategory = category?.subcategories.find(item => item.id === transaction.subcategoryId);
  return subcategory ? `${category?.name || 'Category'} > ${subcategory.name}` : category?.name || 'Uncategorized';
}

function walletLabel(walletId: string | undefined, reportDocument: FinancialExportDocument) {
  return reportDocument.wallets.find(wallet => wallet.id === walletId)?.name || (walletId ? 'Unknown wallet' : 'Wallet not connected');
}

export function buildExpensePrintSlices(
  rows: FinancialExportDocument['report']['expenseCategories'],
): PrintSlice[] {
  if (!rows.length) return [];
  const top = rows.slice(0, 6).map((row, index) => ({
    label: row.label,
    amount: row.amount,
    percentage: row.percentage,
    color: PRINT_SLICE_COLORS[index],
  }));
  const remainder = rows.slice(6);
  if (remainder.length) {
    top.push({
      label: 'Other',
      amount: remainder.reduce((total, row) => total + row.amount, 0),
      percentage: remainder.reduce((total, row) => total + row.percentage, 0),
      color: PRINT_SLICE_COLORS[6],
    });
  }
  return top;
}

function ExpenseDonut({ slices, currency }: { slices: PrintSlice[]; currency: string }) {
  let offset = 0;
  return (
    <div className="finance-print-donut-wrap">
      <svg className="finance-print-donut" viewBox="0 0 100 100" role="img" aria-label="Expense category breakdown">
        <circle cx="50" cy="50" r="38" fill="none" stroke="#e8edf0" strokeWidth="18" pathLength="100" />
        {slices.map(slice => {
          const currentOffset = offset;
          offset += slice.percentage;
          return (
            <circle key={`${slice.label}:${currentOffset}`} cx="50" cy="50" r="38" fill="none" stroke={slice.color} strokeWidth="18" pathLength="100" strokeDasharray={`${slice.percentage} ${100 - slice.percentage}`} strokeDashoffset={-currentOffset} transform="rotate(-90 50 50)" />
          );
        })}
        <text x="50" y="48" textAnchor="middle" className="finance-print-donut-label">Expenses</text>
        <text x="50" y="57" textAnchor="middle" className="finance-print-donut-total">{amount(slices.reduce((total, slice) => total + slice.amount, 0), currency)}</text>
      </svg>
    </div>
  );
}

export default function PrintableFinancialReport({ reportDocument, includeDetails, onAfterPrint }: Props) {
  useEffect(() => {
    document.body.classList.add('finance-print-active');
    const after = () => onAfterPrint?.();
    window.addEventListener('afterprint', after);
    const timer = window.setTimeout(() => {
      try { window.print(); } catch { onAfterPrint?.(); }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('finance-print-active');
    };
  }, [onAfterPrint]);
  const { report, currency } = reportDocument;
  const period = report.bounds
    ? `${dateKeyLabel(report.bounds.startDateKey)}${report.bounds.startDateKey === report.bounds.endDateKey ? '' : ` – ${dateKeyLabel(report.bounds.endDateKey)}`}`
    : 'Selected period';
  const expenseSlices = buildExpensePrintSlices(report.expenseCategories);
  const otherSlice = expenseSlices.find(slice => slice.label === 'Other');

  return createPortal(
    <div className="finance-print-portal" aria-hidden="true">
      <article className="finance-print-document">
        <header className="finance-print-header">
          <Image className="finance-print-logo" src="/icons/caizen-primary-light-3000.png" alt="Caizen" width={48} height={48} />
          <div>
            <p className="finance-print-brand">CAIZEN</p>
            <p className="finance-print-kicker">Personal finance</p>
            <h1>Money Report</h1>
            <p className="finance-print-period">{period}</p>
          </div>
          <dl>
            <div><dt>Generated</dt><dd>{reportDocument.generatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
            <div><dt>Currency</dt><dd>{currency}</dd></div>
          </dl>
        </header>

        <section>
          <h2>Summary</h2>
          <div className="finance-print-summary-strip">
            <div><span>Income</span><strong className="finance-print-income">{amount(report.summary.income, currency)}</strong></div>
            <div><span>Expense</span><strong className="finance-print-expense">{amount(report.summary.expense, currency)}</strong></div>
            <div><span>Net</span><strong>{amount(report.summary.net, currency)}</strong></div>
            <div><span>Transactions</span><strong>{report.periodTransactionCount.toLocaleString()}</strong></div>
          </div>
        </section>

        {report.comparison ? (
          <section>
            <h2>Compared with previous {report.comparison.kind}</h2>
            <table className="finance-print-table">
              <thead><tr><th>Metric</th><th>Change</th><th>Percentage</th></tr></thead>
              <tbody>
                {([
                  ['Income', report.comparison.delta.income, report.comparison.percent.income],
                  ['Expense', report.comparison.delta.expense, report.comparison.percent.expense],
                  ['Net', report.comparison.delta.net, report.comparison.percent.net],
                ] as const).map(([label, delta, percent]) => (
                  <tr key={label}><td>{label}</td><td>{delta === 0 ? amount(0, currency) : `${delta > 0 ? '+' : '−'}${amount(Math.abs(delta), currency)}`}</td><td>{percent === null ? 'No prior data' : `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {report.balanceTrend.points.length ? (
          <section>
            <h2>Balance trend</h2>
            <p className="finance-print-note">{report.balanceTrend.note}</p>
            <table className="finance-print-table">
              <thead><tr><th>Date</th><th>Available / on hand</th><th>Protected / savings</th><th>Total balance</th></tr></thead>
              <tbody>{report.balanceTrend.points.map(point => (
                <tr key={point.key}><td>{point.startDateKey === point.endDateKey ? dateKeyLabel(point.startDateKey) : `${dateKeyLabel(point.startDateKey)} – ${dateKeyLabel(point.endDateKey)}`}</td><td>{amount(point.available, currency)}</td><td>{report.balanceTrend.hasProtectedSeries ? amount(point.protected, currency) : '—'}</td><td>{amount(point.total, currency)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        ) : null}

        <section>
          <h2>Expense breakdown</h2>
          {!report.expenseCategories.length ? <p className="finance-print-empty">No expense data in this period.</p> : null}
          {report.expenseCategories.length ? (
            <div className="finance-print-breakdown">
              <ExpenseDonut slices={expenseSlices} currency={currency} />
              <table className="finance-print-table finance-print-breakdown-table">
                <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
                <tbody>{report.expenseCategories.map(row => {
                  const slice = expenseSlices.find(item => item.label === row.label) || otherSlice;
                  return (
                    <tr key={`expense-${row.id}`}>
                      <td>
                        <span className="finance-print-category-label">
                          {slice ? <span className="finance-print-legend-swatch" style={{ backgroundColor: slice.color }} aria-hidden="true" /> : null}
                          <span>{row.label}</span>
                        </span>
                      </td>
                      <td>{amount(row.amount, currency)}</td>
                      <td>{row.percentage.toFixed(1)}%</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {otherSlice ? <p className="finance-print-breakdown-note">Categories sharing the gray swatch are grouped as Other in the donut.</p> : null}
            </div>
          ) : null}
        </section>

        <section>
          <h2>Income breakdown</h2>
          {!report.incomeCategories.length ? <p className="finance-print-empty">No income data in this period.</p> : null}
          {report.incomeCategories.length ? (
            <table className="finance-print-table">
              <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
              <tbody>{report.incomeCategories.map(row => <tr key={`income-${row.id}`}><td>{row.label}</td><td>{amount(row.amount, currency)}</td><td>{row.percentage.toFixed(1)}%</td></tr>)}</tbody>
            </table>
          ) : null}
        </section>

        {report.wallets.length ? (
          <section>
            <h2>Wallet movement</h2>
            <table className="finance-print-table">
              <thead><tr><th>Wallet</th><th>Income</th><th>Expense</th><th>Net movement</th></tr></thead>
              <tbody>{report.wallets.map(row => <tr key={row.id}><td>{row.label}</td><td>{amount(row.income, currency)}</td><td>{amount(row.expense, currency)}</td><td>{amount(row.net, currency)}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null}

        {report.budget ? (
          <section>
            <h2>Budget versus actual</h2>
            <table className="finance-print-table">
              <thead><tr><th>Scope</th><th>Allocated</th><th>Spent</th><th>Remaining</th><th>Over by</th></tr></thead>
              <tbody>{report.budget.metrics.map(metric => {
                const category = reportDocument.categories.find(item => item.id === metric.budget.categoryId);
                const subcategory = category?.subcategories.find(item => item.id === metric.budget.subcategoryId);
                const label = subcategory ? `${category?.name || 'Category'} > ${subcategory.name}` : category?.name || 'Category';
                return <tr key={metric.budget.id}><td>{label}</td><td>{amount(metric.allocated, currency)}</td><td>{amount(metric.spent, currency)}</td><td>{amount(metric.remaining, currency)}</td><td>{amount(metric.overBy, currency)}</td></tr>;
              })}</tbody>
            </table>
          </section>
        ) : null}

        {includeDetails ? (
          <section className="finance-print-page-break">
            <h2>Transactions</h2>
            <table className="finance-print-table">
              <thead><tr><th>Date</th><th>Category or transfer route</th><th>Wallet</th><th>Paid to / received from / note</th><th>Amount</th><th>Report status</th></tr></thead>
              <tbody>{reportDocument.transactions.map(transaction => {
                const signed = transaction.type === 'transfer' ? Math.abs(transaction.amount) : getTransactionSignedAmount(transaction) || 0;
                const route = `${walletLabel(transaction.walletId, reportDocument)} → ${walletLabel(transaction.destinationWalletId, reportDocument)}`;
                const context = transaction.type === 'transfer' ? transaction.notes || 'Transfer' : [transaction.payee, transaction.notes].filter(Boolean).join(' · ') || '—';
                const primary = transaction.type === 'transfer' ? route : transaction.type === 'adjustment' ? 'Balance adjustment' : categoryLabel(transaction, reportDocument);
                const status = transaction.excludeFromReports && transaction.type !== 'transfer'
                  ? 'Excluded'
                  : transaction.type === 'transfer' && transaction.fee
                    ? `Fee ${amount(transaction.fee, currency)}`
                    : transaction.type === 'adjustment'
                      ? transaction.adjustmentDirection === 'decrease' ? 'Subtract from balance' : 'Add to balance'
                      : 'Included';
                return <tr key={transaction.id}><td>{dateLabel(transaction.date)}</td><td>{primary}</td><td>{walletLabel(transaction.walletId, reportDocument)}</td><td>{context}</td><td>{amount(signed, currency)}{transaction.fee ? ` (fee ${amount(transaction.fee, currency)})` : ''}</td><td>{status}</td></tr>;
              })}</tbody>
            </table>
          </section>
        ) : null}
      </article>
    </div>,
    document.body,
  );
}
