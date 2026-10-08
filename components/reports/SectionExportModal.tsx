'use client';

import type { ReactNode } from 'react';
import { Download, Printer } from 'lucide-react';

import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';

export type SectionExportFormatOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

export type SectionExportModalProps<T extends string = string> = {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  format: T;
  formatOptions: Array<SectionExportFormatOption<T>>;
  onFormatChange: (value: T) => void;
  fileName: string;
  busy: boolean;
  error?: string;
  success?: string;
  onExport: () => void;
  exportLabel?: string;
  printFormat?: T;
  notice?: ReactNode;
  afterFileNameNotice?: ReactNode;
  children?: ReactNode;
  canExport?: boolean;
  panelClassName?: string;
};

export function SectionExportModal<T extends string>({
  title,
  eyebrow = 'Local-only export',
  onClose,
  format,
  formatOptions,
  onFormatChange,
  fileName,
  busy,
  error,
  success,
  onExport,
  exportLabel,
  printFormat,
  notice,
  afterFileNameNotice,
  children,
  canExport = true,
  panelClassName,
}: SectionExportModalProps<T>) {
  const isPrint = printFormat !== undefined && format === printFormat;
  const actions = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="button" onClick={onExport} disabled={busy || !canExport} aria-busy={busy || undefined} className="h-auto min-h-11 whitespace-normal text-center">
        {isPrint ? <Printer className="mr-2 h-4 w-4 shrink-0" /> : <Download className="mr-2 h-4 w-4 shrink-0" />}
        {busy ? 'Preparing export…' : exportLabel || (isPrint ? 'Print / Save PDF' : 'Export')}
      </Button>
    </div>
  );
  return (
    <CaizenFormDialog title={title} eyebrow={eyebrow} onClose={onClose} onBeforeClose={() => !busy} maxWidthClass="max-w-2xl" bodyClassName="space-y-5" panelClassName={panelClassName} footer={actions}>
      <fieldset disabled={busy} className="min-w-0 space-y-5" aria-label="Export options">
      {notice}

      <AndroidAdaptiveSelect
        label="Export format"
        value={format}
        options={formatOptions}
        onChange={value => onFormatChange(value as T)}
        searchable={false}
      />

      {children}

      <div className="rounded-xl border border-border/55 bg-muted/20 px-3 py-3 text-sm">
        <p className="font-bold">File name</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{fileName}</p>
      </div>

      {afterFileNameNotice}
      </fieldset>

      {error ? <p className="text-sm font-semibold text-destructive" role="alert">{error}</p> : null}
      {success ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">{success}</p> : null}

    </CaizenFormDialog>
  );
}

