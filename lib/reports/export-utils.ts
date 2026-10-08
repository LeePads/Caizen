import { toLocalDateKey } from '@/lib/date-utils';

export function sanitizeExportFileName(input: string) {
  return input
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^[.\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .slice(0, 120) || 'caizen-export';
}

export function getLocalReportDateLabel(date: Date = new Date()) {
  return toLocalDateKey(date);
}

export function downloadReportBlob(blob: Blob, fileName: string) {
  if (typeof document === 'undefined') {
    throw new Error('Downloads are only available in a browser.');
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

