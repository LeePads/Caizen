import { downloadReportBlob } from '@/lib/reports/export-utils';

/** Compatibility wrapper for mature Balance exports. */
export function downloadFinanceBlob(blob: Blob, fileName: string) {
  downloadReportBlob(blob, fileName);
}
