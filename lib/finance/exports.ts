import { strToU8, zipSync } from 'fflate';

import { toLocalDateKey } from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import { convertFromBaseCurrency } from '@/lib/currency';
import { sanitizeExportFileName } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import {
  buildFinancialReport,
  filterTransactionsByReportPeriod,
  getReportPeriodBounds,
  type FinancialReport,
  type ReportPeriod,
  type ReportPeriodKind,
} from '@/lib/finance/reports';
import {
  getTransactionReportableAmounts,
  getTransactionSignedAmount,
} from '@/lib/transactions';
import type {
  Budget,
  CurrencyCode,
  FinancialCategory,
  Transaction,
  Wallet,
} from '@/lib/types';

export type FinancialExportFormat = 'csv' | 'xlsx' | 'pdf';

export type FinancialExportDocument = {
  period: ReportPeriod;
  report: FinancialReport;
  transactions: Transaction[];
  currency: CurrencyCode;
  generatedAt: Date;
  categories: FinancialCategory[];
  wallets: Wallet[];
};

export type ExportPeriodChoice = ReportPeriodKind | 'all';

export const TRANSACTION_CSV_HEADERS = [
  'ID',
  'Note',
  'Amount',
  'Category',
  'Account',
  'Currency',
  'Date',
  'Event',
  'Exclude Report',
  'Caizen Type',
  'Subcategory',
  'Payee',
  'Destination Account',
  'Fee',
  'Adjustment Direction',
  'Caizen Source',
  'Caizen Source Key',
] as const;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function categoryDetails(transaction: Transaction, categories: FinancialCategory[]) {
  const category = categories.find(item => item.id === transaction.categoryId);
  const subcategory = category?.subcategories.find(item => item.id === transaction.subcategoryId);
  return {
    category: category?.name?.trim() || '',
    subcategory: subcategory?.name?.trim() || '',
  };
}

function walletName(walletId: string | undefined, wallets: Wallet[]) {
  if (!walletId) return '';
  return wallets.find(wallet => wallet.id === walletId)?.name?.trim() || 'Unknown wallet';
}

function sourceKey(transaction: Transaction) {
  return transaction.sourceKey || `transaction-csv:export:${transaction.id}`;
}

function csvDate(value: Date) {
  return toLocalDateKey(value);
}

function exportType(transaction: Transaction) {
  return transaction.type === 'adjustment'
    ? 'adjustment'
    : transaction.type;
}

function csvRowsForTransaction(
  transaction: Transaction,
  categories: FinancialCategory[],
  wallets: Wallet[],
  currency: CurrencyCode,
) {
  const details = categoryDetails(transaction, categories);
  const source = transaction.source || 'manual';
  const stableKey = sourceKey(transaction);
  const excluded = transaction.excludeFromReports ? 'TRUE' : 'FALSE';

  if (transaction.type === 'transfer') {
    const sourceWallet = walletName(transaction.walletId, wallets);
    const destinationWallet = walletName(transaction.destinationWalletId, wallets);
    const note = transaction.notes || '';
    return [
      [
        `${transaction.id}:outgoing`,
        note,
        -Math.abs(toFiniteMoney(transaction.amount)),
        details.category,
        sourceWallet,
        currency,
        csvDate(transaction.date),
        'Outgoing transfer',
        excluded,
        'transfer',
        details.subcategory,
        transaction.payee || '',
        destinationWallet,
        transaction.fee ? toFiniteMoney(transaction.fee) : '',
        '',
        source,
        stableKey,
      ],
      [
        `${transaction.id}:incoming`,
        note,
        Math.abs(toFiniteMoney(transaction.amount)),
        '',
        destinationWallet,
        currency,
        csvDate(transaction.date),
        'Incoming transfer',
        excluded,
        'transfer',
        '',
        '',
        '',
        '',
        '',
        source,
        stableKey,
      ],
    ];
  }

  const signedAmount = getTransactionSignedAmount(transaction) ?? 0;
  const type = exportType(transaction);
  return [[
    transaction.id,
    transaction.notes || '',
    toFiniteMoney(signedAmount),
    details.category,
    walletName(transaction.walletId, wallets),
    currency,
    csvDate(transaction.date),
    type === 'adjustment' ? 'Adjustment' : type === 'income' ? 'Income' : 'Expense',
    excluded,
    type,
    details.subcategory,
    transaction.payee || '',
    '',
    '',
    transaction.adjustmentDirection || '',
    source,
    stableKey,
  ]];
}

export function resolveExportPeriod(
  choice: ExportPeriodChoice,
  transactions: Transaction[],
  now = new Date(),
): ReportPeriod {
  if (choice !== 'all') return { kind: choice, anchorDateKey: toLocalDateKey(now) };

  const dateKeys = transactions
    .map(transaction => toLocalDateKey(transaction.date))
    .filter(Boolean)
    .sort();
  const startDateKey = dateKeys[0] || toLocalDateKey(now);
  const endDateKey = dateKeys[dateKeys.length - 1] || startDateKey;
  return {
    kind: 'custom',
    anchorDateKey: startDateKey,
    startDateKey,
    endDateKey,
  };
}

export function buildFinancialExportDocument({
  transactions,
  categories,
  wallets,
  budgets = [],
  currency,
  period,
  generatedAt = new Date(),
  now = generatedAt,
}: {
  transactions: Transaction[];
  categories: FinancialCategory[];
  wallets: Wallet[];
  budgets?: Budget[];
  currency: CurrencyCode;
  period: ReportPeriod;
  generatedAt?: Date;
  now?: Date;
}): FinancialExportDocument {
  const report = buildFinancialReport({
    transactions,
    categories,
    wallets,
    budgets,
    period,
    now,
  });
  return {
    period,
    report,
    transactions: filterTransactionsByReportPeriod(transactions, period, now),
    currency,
    generatedAt: new Date(generatedAt),
    categories,
    wallets,
  };
}

export function buildTransactionCsv(document: FinancialExportDocument) {
  const rows = [
    [...TRANSACTION_CSV_HEADERS],
    ...document.transactions.flatMap(transaction =>
      csvRowsForTransaction(transaction, document.categories, document.wallets, document.currency)),
  ];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export { sanitizeExportFileName } from '@/lib/reports/export-utils';

function periodFileLabel(period: ReportPeriod) {
  const bounds = getReportPeriodBounds(period);
  if (!bounds) return 'custom-period';
  if (period.kind === 'month') return bounds.startDateKey.slice(0, 7);
  if (period.kind === 'year') return bounds.startDateKey.slice(0, 4);
  if (period.kind === 'quarter') {
    const month = Number(bounds.startDateKey.slice(5, 7));
    return `Q${Math.floor((month - 1) / 3) + 1}-${bounds.startDateKey.slice(0, 4)}`;
  }
  if (period.kind === 'custom') return `${bounds.startDateKey}-to-${bounds.endDateKey}`;
  return `${bounds.startDateKey}-to-${bounds.endDateKey}`;
}

export function getFinancialExportFileName(
  format: FinancialExportFormat,
  period: ReportPeriod,
) {
  const extension = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'pdf';
  const prefix = format === 'csv'
    ? 'Caizen-Transactions'
    : format === 'pdf'
      ? 'Caizen-Balance-Report'
      : 'Caizen-Financial-Report';
  return `${sanitizeExportFileName(`${prefix}-${periodFileLabel(period)}`)}.${extension}`;
}

type XlsxValue = string | number | boolean | null | undefined;
type XlsxCell = { value: XlsxValue; style?: number };

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function xlsxCell(cell: XlsxCell, column: number, row: number) {
  if (cell.value === null || cell.value === undefined || cell.value === '') return '';
  const reference = `${columnName(column)}${row}`;
  const style = cell.style === undefined ? '' : ` s="${cell.style}"`;
  if (typeof cell.value === 'number') {
    return `<c r="${reference}"${style} t="n"><v>${xmlEscape(toFiniteMoney(cell.value))}</v></c>`;
  }
  if (typeof cell.value === 'boolean') {
    return `<c r="${reference}"${style} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
}

function sheetXml(rows: XlsxCell[][], options: { widths?: number[]; filter?: boolean } = {}) {
  const maxColumns = Math.max(1, ...rows.map(row => row.length));
  const maxRow = Math.max(1, rows.length);
  const widthXml = (options.widths || []).map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join('');
  const rowXml = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => xlsxCell(cell, columnIndex, rowIndex + 1)).join('')}</row>`,
  ).join('');
  const filter = options.filter && rows.length > 1
    ? `<autoFilter ref="A1:${columnName(maxColumns - 1)}${maxRow}"/>`
    : '';
  const panes = options.filter
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(maxColumns - 1)}${maxRow}"/>${panes}${widthXml ? `<cols>${widthXml}</cols>` : ''}<sheetData>${rowXml}</sheetData>${filter}</worksheet>`;
}

const header = (values: string[]): XlsxCell[] => values.map(value => ({ value, style: 1 }));
const moneyCell = (value: number, document: FinancialExportDocument): XlsxCell => ({
  value: toFiniteMoney(convertFromBaseCurrency(value, document.currency)),
  style: 2,
});
const percentCell = (value: number): XlsxCell => ({ value: toFiniteMoney(value / 100), style: 3 });

function buildSummaryRows(document: FinancialExportDocument): XlsxCell[][] {
  const { report } = document;
  const bounds = report.bounds;
  const rows: XlsxCell[][] = [
    [{ value: 'Caizen Financial Report', style: 1 }],
    [{ value: 'Period' }, { value: bounds ? `${bounds.startDateKey} to ${bounds.endDateKey}` : 'Invalid period' }],
    [{ value: 'Generated' }, { value: document.generatedAt.toLocaleString() }],
    [{ value: 'Currency' }, { value: document.currency }],
    [],
    header(['Summary', 'Amount']),
    [{ value: 'Income' }, moneyCell(report.summary.income, document)],
    [{ value: 'Expense' }, moneyCell(report.summary.expense, document)],
    [{ value: 'Net' }, moneyCell(report.summary.net, document)],
    [{ value: 'Transactions' }, { value: report.periodTransactionCount }],
  ];

  if (report.comparison) {
    rows.push([], header([`Compared with previous ${report.comparison.kind}`, 'Change', 'Percent']));
    rows.push(
      [{ value: 'Income' }, moneyCell(report.comparison.delta.income, document), percentCell(report.comparison.percent.income || 0)],
      [{ value: 'Expense' }, moneyCell(report.comparison.delta.expense, document), percentCell(report.comparison.percent.expense || 0)],
      [{ value: 'Net' }, moneyCell(report.comparison.delta.net, document), percentCell(report.comparison.percent.net || 0)],
    );
  }

  rows.push([], header(['Monthly trend', 'Income', 'Expense', 'Net']));
  report.monthlyTrend.forEach(point => {
    rows.push([{ value: point.monthKey }, moneyCell(point.income, document), moneyCell(point.expense, document), moneyCell(point.net, document)]);
  });

  if (report.budget) {
    rows.push([], header(['Budget versus actual', 'Amount']));
    rows.push(
      [{ value: 'Allocated' }, moneyCell(report.budget.summary.allocated, document)],
      [{ value: 'Spent' }, moneyCell(report.budget.summary.spent, document)],
      [{ value: 'Remaining' }, moneyCell(report.budget.summary.remaining, document)],
      [{ value: 'Over by' }, moneyCell(report.budget.summary.overBy, document)],
    );
  }
  return rows;
}

function buildTransactionRows(document: FinancialExportDocument): XlsxCell[][] {
  const rows: XlsxCell[][] = [header([
    'Date', 'ID', 'Type', 'Category', 'Subcategory', 'Wallet', 'Destination wallet',
    'Payee', 'Notes', 'Amount', 'Fee', 'Excluded', 'Reportable income', 'Reportable expense', 'Source',
  ])];
  document.transactions.forEach(transaction => {
    const details = categoryDetails(transaction, document.categories);
    const reportable = getTransactionReportableAmounts(transaction);
    const amount = transaction.type === 'transfer'
      ? Math.abs(toFiniteMoney(transaction.amount))
      : getTransactionSignedAmount(transaction) || 0;
    rows.push([
      { value: csvDate(transaction.date) },
      { value: transaction.id },
      { value: exportType(transaction) },
      { value: details.category },
      { value: details.subcategory },
      { value: walletName(transaction.walletId, document.wallets) },
      { value: walletName(transaction.destinationWalletId, document.wallets) },
      { value: transaction.payee || '' },
      { value: transaction.notes || '' },
      moneyCell(amount, document),
      moneyCell(transaction.fee || 0, document),
      { value: transaction.excludeFromReports ? 'Yes' : 'No' },
      moneyCell(reportable.income, document),
      moneyCell(reportable.expense, document),
      { value: transaction.source || 'manual' },
    ]);
  });
  return rows;
}

function buildCategoryRows(document: FinancialExportDocument): XlsxCell[][] {
  const rows: XlsxCell[][] = [header(['Direction', 'Category', 'Amount', 'Percentage', 'Transaction count'])];
  [...document.report.incomeCategories.map(row => ({ ...row, direction: 'Income' })), ...document.report.expenseCategories.map(row => ({ ...row, direction: 'Expense' }))]
    .forEach(row => rows.push([
      { value: row.direction },
      { value: row.label },
      moneyCell(row.amount, document),
      percentCell(row.percentage),
      { value: row.transactionCount },
    ]));
  return rows;
}

function buildBreakdownRows(
  document: FinancialExportDocument,
  direction: 'income' | 'expense',
): XlsxCell[][] {
  const rows = direction === 'income'
    ? document.report.incomeCategories
    : document.report.expenseCategories;
  return [
    header(['Category', 'Amount', 'Percentage', 'Transaction count']),
    ...rows.map(row => [
      { value: row.label },
      moneyCell(row.amount, document),
      percentCell(row.percentage),
      { value: row.transactionCount },
    ]),
  ];
}

function buildBalanceTrendRows(document: FinancialExportDocument): XlsxCell[][] {
  return [
    header(['Date', 'Available balance', 'Protected / savings balance', 'Total balance']),
    ...document.report.balanceTrend.points.map(point => [
      { value: point.startDateKey === point.endDateKey ? point.startDateKey : `${point.startDateKey} to ${point.endDateKey}` },
      moneyCell(point.available, document),
      moneyCell(point.protected, document),
      moneyCell(point.total, document),
    ]),
  ];
}

function buildWalletRows(document: FinancialExportDocument): XlsxCell[][] {
  return [
    header(['Wallet', 'Reportable income', 'Reportable expense', 'Net movement', 'Transaction count']),
    ...document.report.wallets.map(row => [
      { value: row.label },
      moneyCell(row.income, document),
      moneyCell(row.expense, document),
      moneyCell(row.net, document),
      { value: row.transactionCount },
    ]),
  ];
}

function buildBudgetRows(document: FinancialExportDocument): XlsxCell[][] | null {
  if (!document.report.budget) return null;
  return [
    header(['Category / subcategory', 'Allocated', 'Spent', 'Remaining', 'Over by', 'Status']),
    ...document.report.budget.metrics.map(metric => {
      const category = document.categories.find(item => item.id === metric.budget.categoryId);
      const subcategory = category?.subcategories.find(item => item.id === metric.budget.subcategoryId);
      return [
        { value: subcategory ? `${category?.name || 'Category'} › ${subcategory.name}` : category?.name || 'Category' },
        moneyCell(metric.allocated, document),
        moneyCell(metric.spent, document),
        moneyCell(metric.remaining, document),
        moneyCell(metric.overBy, document),
        { value: metric.status === 'over-budget' ? 'Over budget' : 'On track' },
      ];
    }),
  ];
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
}

function workbookXml(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRelationships(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
}

export function buildXlsxReport(document: FinancialExportDocument) {
  const sheets: Array<{ name: string; rows: XlsxCell[][]; widths: number[]; filter?: boolean }> = [
    { name: 'Summary', rows: buildSummaryRows(document), widths: [28, 24, 18, 18] },
    { name: 'Transactions', rows: buildTransactionRows(document), widths: [14, 26, 14, 18, 18, 18, 18, 18, 34, 16, 16, 12, 18, 18, 18], filter: true },
    { name: 'Expense Breakdown', rows: buildBreakdownRows(document, 'expense'), widths: [28, 20, 16, 18], filter: true },
    { name: 'Income Breakdown', rows: buildBreakdownRows(document, 'income'), widths: [28, 20, 16, 18], filter: true },
    ...(document.report.balanceTrend.points.length
      ? [{ name: 'Balance Trend', rows: buildBalanceTrendRows(document), widths: [24, 22, 28, 20], filter: true }]
      : []),
    { name: 'Categories', rows: buildCategoryRows(document), widths: [14, 26, 16, 16, 18], filter: true },
    { name: 'Wallets', rows: buildWalletRows(document), widths: [24, 18, 18, 18, 18], filter: true },
  ];
  const budgetRows = buildBudgetRows(document);
  if (budgetRows) sheets.push({ name: 'Budgets', rows: budgetRows, widths: [30, 18, 18, 18, 18, 18], filter: true });

  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml(sheets.length)),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(workbookXml(sheets.map(sheet => sheet.name))),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelationships(sheets.map(sheet => sheet.name))),
    'xl/styles.xml': strToU8(stylesXml()),
  };
  sheets.forEach((sheet, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows, { widths: sheet.widths, filter: sheet.filter }));
  });
  return new Blob([zipSync(entries, { level: 6 })], { type: XLSX_MIME });
}

export function getExportDocumentTransactions(document: FinancialExportDocument) {
  return document.transactions;
}
