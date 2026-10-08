import { formatCurrency } from '@/lib/currency';
import { parseLocalDateKey, toLocalDateKey } from '@/lib/date-utils';
import type { CurrencyCode, Transaction } from '@/lib/types';
import { getTransactionSignedAmount } from '@/lib/transactions';
import type { FinancialExportDocument } from './exports';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const PDF_MIME = 'application/pdf';

const COLORS = {
  ink: '0.09 0.13 0.15',
  muted: '0.29 0.34 0.36',
  accent: '0.34 0.54 0.52',
  gold: '0.78 0.57 0.20',
  line: '0.78 0.81 0.81',
  soft: '0.94 0.96 0.96',
  softAlt: '0.98 0.99 0.99',
};

type PdfPage = {
  commands: string[];
  cursor: number;
};

function number(value: number) {
  return Number(value.toFixed(2));
}

function pdfText(value: unknown) {
  return String(value ?? '')
    .replaceAll('₱', 'PHP ')
    .replaceAll('€', 'EUR ')
    .replaceAll('£', 'GBP ')
    .replaceAll('¥', 'JPY ')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('−', '-')
    .replaceAll('→', ' -> ')
    .replaceAll('›', '>')
    .replaceAll('·', ' / ')
    .replaceAll('…', '...')
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('’', "'")
    .replace(/[^\x20-\x7E]/g, '?');
}

function escapePdfString(value: unknown) {
  return pdfText(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function textCommand(value: unknown, x: number, y: number, size: number, font = 'F1', color = COLORS.ink) {
  return `${color} rg BT /${font} ${number(size)} Tf ${number(x)} ${number(y)} Td (${escapePdfString(value)}) Tj ET`;
}

function fillRect(x: number, y: number, width: number, height: number, color: string) {
  return `q ${color} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f Q`;
}

function strokeRect(x: number, y: number, width: number, height: number, color: string) {
  return `q ${color} RG 0.6 w ${number(x)} ${number(y)} ${number(width)} ${number(height)} re S Q`;
}

function horizontalRule(x: number, y: number, width: number, color = COLORS.line) {
  return `q ${color} RG 0.6 w ${number(x)} ${number(y)} m ${number(x + width)} ${number(y)} l S Q`;
}

function verticalRule(x: number, y: number, height: number, color = COLORS.line) {
  return `q ${color} RG 0.6 w ${number(x)} ${number(y)} m ${number(x)} ${number(y + height)} l S Q`;
}

function wrapText(value: unknown, width: number, size: number, maxLines = 3) {
  const text = pdfText(value).trim();
  if (!text) return [''];
  const maxCharacters = Math.max(8, Math.floor(width / (size * 0.5)));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  words.forEach(word => {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      return;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const trimmed = lines.slice(0, maxLines);
  const last = trimmed[maxLines - 1] || '';
  trimmed[maxLines - 1] = `${last.slice(0, Math.max(1, maxCharacters - 3))}...`;
  return trimmed;
}

function dateKeyLabel(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  return date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || dateKey;
}

function reportPeriodLabel(document: FinancialExportDocument) {
  const bounds = document.report.bounds;
  if (!bounds) return 'Selected period';
  if (bounds.startDateKey === bounds.endDateKey) return dateKeyLabel(bounds.startDateKey);
  return `${dateKeyLabel(bounds.startDateKey)} - ${dateKeyLabel(bounds.endDateKey)}`;
}

function pdfMoney(value: number, currency: CurrencyCode) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  const sign = numeric < 0 ? '-' : '';
  const formatted = formatCurrency(Math.abs(numeric), currency);
  const digits = formatted.replace(/[^0-9.,]/g, '') || '0.00';
  return `${sign}${currency} ${digits}`;
}

function pdfPercent(value: number | null) {
  if (value === null) return 'No prior data';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function walletLabel(walletId: string | undefined, document: FinancialExportDocument) {
  return document.wallets.find(wallet => wallet.id === walletId)?.name || 'Unknown wallet';
}

function categoryLabel(transaction: Transaction, document: FinancialExportDocument) {
  const category = document.categories.find(item => item.id === transaction.categoryId);
  const subcategory = category?.subcategories.find(item => item.id === transaction.subcategoryId);
  return subcategory ? `${category?.name || 'Category'} > ${subcategory.name}` : category?.name || 'Uncategorized';
}

function transactionDetailRows(document: FinancialExportDocument) {
  return document.transactions.map(transaction => {
    const signed = transaction.type === 'transfer'
      ? Math.abs(transaction.amount)
      : getTransactionSignedAmount(transaction) || 0;
    const route = `${walletLabel(transaction.walletId, document)} -> ${walletLabel(transaction.destinationWalletId, document)}`;
    const context = transaction.type === 'transfer'
      ? transaction.notes || 'Transfer'
      : [transaction.payee, transaction.notes].filter(Boolean).join(' / ') || '-';
    const primary = transaction.type === 'transfer'
      ? route
      : transaction.type === 'adjustment'
        ? 'Balance adjustment'
        : categoryLabel(transaction, document);
    const status = transaction.excludeFromReports && transaction.type !== 'transfer'
      ? 'Excluded'
      : transaction.type === 'transfer' && transaction.fee
        ? `Fee ${pdfMoney(transaction.fee, document.currency)}`
        : transaction.type === 'adjustment'
          ? transaction.adjustmentDirection === 'decrease' ? 'Subtract from balance' : 'Add to balance'
          : 'Included';

    return [
      dateKeyLabel(toLocalDateKey(transaction.date)),
      primary,
      walletLabel(transaction.walletId, document),
      context,
      `${pdfMoney(signed, document.currency)}${transaction.fee ? ` (fee ${pdfMoney(transaction.fee, document.currency)})` : ''}`,
      status,
    ];
  });
}

class PdfLayout {
  readonly pages: PdfPage[] = [];

  constructor() {
    this.addPage();
  }

  private get current() {
    return this.pages[this.pages.length - 1];
  }

  private addPage() {
    this.pages.push({ commands: [], cursor: PAGE_HEIGHT - MARGIN_TOP });
  }

  private ensure(height: number) {
    if (this.current.cursor - height < MARGIN_BOTTOM) this.addPage();
  }

  private advance(height: number) {
    this.current.cursor -= height;
  }

  private drawText(value: unknown, x: number, y: number, size: number, font = 'F1', color = COLORS.ink) {
    this.current.commands.push(textCommand(value, x, y, size, font, color));
  }

  private drawWrapped(value: unknown, x: number, width: number, size = 8.5, color = COLORS.muted, maxLines = 3) {
    const lines = wrapText(value, width, size, maxLines);
    const lineHeight = size + 2.5;
    this.ensure(lines.length * lineHeight);
    lines.forEach((line, index) => this.drawText(line, x, this.current.cursor - size - index * lineHeight, size, 'F1', color));
    this.advance(lines.length * lineHeight);
  }

  title(document: FinancialExportDocument) {
    this.drawText('CAIZEN', MARGIN_X, this.current.cursor, 11, 'F2', COLORS.gold);
    this.advance(23);
    this.drawText('Money Report', MARGIN_X, this.current.cursor, 24, 'F2', COLORS.ink);
    this.advance(26);
    this.drawText(reportPeriodLabel(document), MARGIN_X, this.current.cursor, 10, 'F1', COLORS.accent);
    this.drawText(`Generated ${document.generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, PAGE_WIDTH - MARGIN_X - 185, this.current.cursor, 8, 'F1', COLORS.muted);
    this.advance(10);
    this.drawText(`Currency ${document.currency}`, PAGE_WIDTH - MARGIN_X - 185, this.current.cursor, 8, 'F1', COLORS.muted);
    this.advance(28);
    this.current.commands.push(horizontalRule(MARGIN_X, this.current.cursor, CONTENT_WIDTH, COLORS.accent));
    this.advance(24);
  }

  section(title: string, minimumHeight = 96) {
    this.ensure(minimumHeight);
    this.current.commands.push(fillRect(MARGIN_X, this.current.cursor - 20, CONTENT_WIDTH, 20, COLORS.soft));
    this.current.commands.push(horizontalRule(MARGIN_X, this.current.cursor - 20, CONTENT_WIDTH, COLORS.line));
    this.drawText(title, MARGIN_X + 8, this.current.cursor - 13, 11, 'F2', COLORS.ink);
    this.advance(31);
  }

  note(value: string) {
    this.drawWrapped(value, MARGIN_X, CONTENT_WIDTH, 8, COLORS.muted, 3);
    this.advance(5);
  }

  summary(document: FinancialExportDocument) {
    this.section('Summary');
    this.ensure(62);
    const top = this.current.cursor;
    const height = 54;
    const width = CONTENT_WIDTH / 4;
    this.current.commands.push(fillRect(MARGIN_X, top - height, CONTENT_WIDTH, height, COLORS.softAlt));
    this.current.commands.push(strokeRect(MARGIN_X, top - height, CONTENT_WIDTH, height, COLORS.line));
    const values = [
      ['Income', pdfMoney(document.report.summary.income, document.currency), COLORS.accent],
      ['Expense', pdfMoney(document.report.summary.expense, document.currency), COLORS.gold],
      ['Net', pdfMoney(document.report.summary.net, document.currency), COLORS.ink],
      ['Transactions', document.report.periodTransactionCount.toLocaleString(), COLORS.ink],
    ] as const;
    values.forEach(([label, value, color], index) => {
      const x = MARGIN_X + index * width + 9;
      if (index > 0) this.current.commands.push(verticalRule(x - 9, top - height, height, COLORS.line));
      this.drawText(label, x, top - 17, 7.5, 'F2', COLORS.muted);
      const lines = wrapText(value, width - 18, 10, 2);
      lines.forEach((line, lineIndex) => this.drawText(line, x, top - 34 - lineIndex * 12, 10, 'F2', color));
    });
    this.advance(height + 15);
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    const headerHeight = 23;
    const xStart = MARGIN_X;
    const drawHeader = () => {
      this.current.commands.push(fillRect(xStart, this.current.cursor - headerHeight, CONTENT_WIDTH, headerHeight, COLORS.soft));
      let x = xStart;
      headers.forEach((header, index) => {
        const lines = wrapText(header, widths[index] - 10, 7.2, 2);
        lines.forEach((line, lineIndex) => this.drawText(line, x + 5, this.current.cursor - 14 - lineIndex * 8, 7.2, 'F2', COLORS.ink));
        x += widths[index];
      });
      this.current.commands.push(horizontalRule(xStart, this.current.cursor - headerHeight, CONTENT_WIDTH, COLORS.line));
      this.advance(headerHeight);
    };

    this.ensure(headerHeight + 35);
    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => wrapText(cell, widths[index] - 10, 7.5, 3));
      const lineCount = Math.max(1, ...cellLines.map(lines => lines.length));
      const rowHeight = Math.max(22, lineCount * 9.5 + 8);
      if (this.current.cursor - rowHeight < MARGIN_BOTTOM) {
        this.addPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) this.current.commands.push(fillRect(xStart, this.current.cursor - rowHeight, CONTENT_WIDTH, rowHeight, COLORS.softAlt));
      let x = xStart;
      cellLines.forEach((lines, cellIndex) => {
        lines.forEach((line, lineIndex) => this.drawText(line, x + 5, this.current.cursor - 14 - lineIndex * 9.5, 7.5, 'F1', COLORS.ink));
        x += widths[cellIndex];
      });
      this.current.commands.push(horizontalRule(xStart, this.current.cursor - rowHeight, CONTENT_WIDTH, COLORS.line));
      this.advance(rowHeight);
    });
    this.advance(12);
  }

  footer(pageIndex: number, pageCount: number) {
    this.current.commands.push(horizontalRule(MARGIN_X, 32, CONTENT_WIDTH, COLORS.line));
    this.drawText(`Caizen Balance Report  /  Page ${pageIndex + 1} of ${pageCount}`, PAGE_WIDTH - MARGIN_X - 180, 20, 7, 'F1', COLORS.muted);
  }
}

function buildPdfBytes(layout: PdfLayout) {
  const encoder = new TextEncoder();
  const objects = [''];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length - 1;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const regularFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];

  layout.pages.forEach(page => {
    const content = page.commands.join('\n');
    const contentLength = encoder.encode(content).length;
    const contentId = addObject(`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.slice(1).forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(output).length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(output);
}

export function buildFinancialPdf(document: FinancialExportDocument, includeDetails = false) {
  const layout = new PdfLayout();
  layout.title(document);
  layout.summary(document);

  if (document.report.comparison) {
    layout.section(`Compared with previous ${document.report.comparison.kind}`);
    layout.table(
      ['Metric', 'Change', 'Percentage'],
      [
        ['Income', pdfMoney(document.report.comparison.delta.income, document.currency), pdfPercent(document.report.comparison.percent.income)],
        ['Expense', pdfMoney(document.report.comparison.delta.expense, document.currency), pdfPercent(document.report.comparison.percent.expense)],
        ['Net', pdfMoney(document.report.comparison.delta.net, document.currency), pdfPercent(document.report.comparison.percent.net)],
      ],
      [170, 170, 171],
    );
  }

  layout.section('Balance Trend', 126);
  if (document.report.balanceTrend.points.length) {
    layout.note(document.report.balanceTrend.note);
    layout.table(
      ['Date', 'Available / on hand', 'Protected / savings', 'Total balance'],
      document.report.balanceTrend.points.map(point => [
        point.startDateKey === point.endDateKey
          ? dateKeyLabel(point.startDateKey)
          : `${dateKeyLabel(point.startDateKey)} - ${dateKeyLabel(point.endDateKey)}`,
        pdfMoney(point.available, document.currency),
        document.report.balanceTrend.hasProtectedSeries ? pdfMoney(point.protected, document.currency) : '-',
        pdfMoney(point.total, document.currency),
      ]),
      [130, 130, 130, 121],
    );
  } else {
    layout.note('No wallet balance trend is available for this period.');
  }

  layout.section('Expense breakdown');
  if (document.report.expenseCategories.length) {
    layout.table(
      ['Category', 'Amount', 'Percentage', 'Transactions'],
      document.report.expenseCategories.map(row => [row.label, pdfMoney(row.amount, document.currency), `${row.percentage.toFixed(1)}%`, row.transactionCount.toLocaleString()]),
      [218, 100, 80, 113],
    );
  } else {
    layout.note('No expense data in this period.');
  }

  layout.section('Income breakdown');
  if (document.report.incomeCategories.length) {
    layout.table(
      ['Category', 'Amount', 'Percentage', 'Transactions'],
      document.report.incomeCategories.map(row => [row.label, pdfMoney(row.amount, document.currency), `${row.percentage.toFixed(1)}%`, row.transactionCount.toLocaleString()]),
      [218, 100, 80, 113],
    );
  } else {
    layout.note('No income data in this period.');
  }

  if (document.report.wallets.length) {
    layout.section('Wallet movement');
    layout.table(
      ['Wallet', 'Income', 'Expense', 'Net movement'],
      document.report.wallets.map(row => [row.label, pdfMoney(row.income, document.currency), pdfMoney(row.expense, document.currency), pdfMoney(row.net, document.currency)]),
      [190, 105, 105, 111],
    );
  }

  if (document.report.budget) {
    layout.section('Budget versus actual');
    layout.table(
      ['Category / subcategory', 'Allocated', 'Spent', 'Remaining', 'Over by'],
      document.report.budget.metrics.map(metric => {
        const category = document.categories.find(item => item.id === metric.budget.categoryId);
        const subcategory = category?.subcategories.find(item => item.id === metric.budget.subcategoryId);
        const label = subcategory ? `${category?.name || 'Category'} > ${subcategory.name}` : category?.name || 'Category';
        return [label, pdfMoney(metric.allocated, document.currency), pdfMoney(metric.spent, document.currency), pdfMoney(metric.remaining, document.currency), pdfMoney(metric.overBy, document.currency)];
      }),
      [150, 100, 100, 85, 76],
    );
  }

  if (includeDetails) {
    layout.section('Transactions');
    if (document.transactions.length) {
      layout.table(
        ['Date', 'Category or route', 'Wallet', 'Payee / note', 'Amount', 'Status'],
        transactionDetailRows(document),
        [56, 112, 85, 135, 63, 60],
      );
    } else {
      layout.note('No transactions in this period.');
    }
  }

  layout.pages.forEach((page, index) => layout.footer(index, layout.pages.length));
  return new Blob([buildPdfBytes(layout)], { type: PDF_MIME });
}
