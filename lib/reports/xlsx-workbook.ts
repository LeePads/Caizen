import { strToU8, zipSync } from 'fflate';

import { toFiniteMoney } from '@/lib/money';

export type XlsxValue = string | number | boolean | null | undefined;

export type XlsxCell = {
  value: XlsxValue;
  style?: number;
};

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  widths?: number[];
  filter?: boolean;
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

const stylesXml = () => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';

function workbookXml(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRelationships(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
}

export const xlsxHeader = (values: string[]): XlsxCell[] => values.map(value => ({ value, style: 1 }));
export const xlsxMoneyCell = (value: number): XlsxCell => ({ value: toFiniteMoney(value), style: 2 });
export const xlsxPercentCell = (value: number): XlsxCell => ({ value: toFiniteMoney(value / 100), style: 3 });

export function buildXlsxWorkbook(sheets: XlsxSheet[]) {
  if (!sheets.length) throw new Error('At least one worksheet is required.');
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

