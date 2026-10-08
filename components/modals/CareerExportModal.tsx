'use client';

import { useMemo, useRef, useState } from 'react';

import PrintableCareerReport from '@/components/personal-vault/reports/PrintableCareerReport';
import { SectionExportModal } from '@/components/reports/SectionExportModal';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { buildCareerCredentialsCsv, buildCareerCoursesCsv, buildCareerExportDocument, buildCareerSkillsCsv, buildCareerXlsx, getCareerExportFileName, resolveCareerExportRecords, type CareerExportCustomFilters, type CareerExportDocument, type CareerExportFormat, type CareerExportPdfOptions, type CareerExportScope } from '@/lib/collections/career-exports';
import { downloadReportBlob } from '@/lib/reports/export-utils';
import type { CareerCourse, CareerCredential, CareerSkill, PersonalVaultItem } from '@/lib/types';

type Props = {
  profileName: string;
  skills: CareerSkill[];
  courses: CareerCourse[];
  credentials: CareerCredential[];
  legacyItems: PersonalVaultItem[];
  current: { skills: CareerSkill[]; courses: CareerCourse[]; credentials: CareerCredential[]; legacyItems: PersonalVaultItem[] };
  currentSummary: string;
  currentFilterSummary: string;
  initialScope?: CareerExportScope;
  onClose: () => void;
};

const FORMATS = [
  { value: 'pdf' as const, label: 'PDF / Print report', description: 'A printable summary with optional details and notes.' },
  { value: 'xlsx' as const, label: 'Excel report', description: 'Summary and separate Career worksheets.' },
  { value: 'skills-csv' as const, label: 'Skills CSV', description: 'Skills and their related courses and certificates.' },
  { value: 'courses-csv' as const, label: 'Courses CSV', description: 'Courses and their related skills and certificates.' },
  { value: 'credentials-csv' as const, label: 'Certificates CSV', description: 'Certificates and whether a proof file is attached.' },
];
const SCOPES = [{ value: 'current', label: 'Current view' }, { value: 'all', label: 'All Career records' }, { value: 'custom', label: 'Custom report' }];
const RECORD_TYPES = [{ value: 'all', label: 'All record types' }, { value: 'skills', label: 'Skills' }, { value: 'courses', label: 'Courses' }, { value: 'credentials', label: 'Certificates' }, { value: 'legacy', label: 'Saved Career references' }];
const LEVELS = [{ value: 'all', label: 'All skill levels' }, ...(['Learning', 'Familiar', 'Proficient', 'Advanced'] as const).map(value => ({ value, label: value }))];
const STATUSES = [{ value: 'all', label: 'All course statuses' }, ...(['Planned', 'In progress', 'Completed'] as const).map(value => ({ value, label: value }))];
const EXPIRY = [{ value: 'all', label: 'All expiry states' }, ...(['Valid', 'Expiring soon', 'Expired', 'No expiry'] as const).map(value => ({ value, label: value }))];
const DEFAULT_FILTERS: CareerExportCustomFilters = { recordType: 'all', skillLevel: 'all', courseStatus: 'all', expiryStatus: 'all', search: '' };

function filtersForType(filters: CareerExportCustomFilters, recordType: CareerExportCustomFilters['recordType']): CareerExportCustomFilters {
  return {
    ...filters,
    recordType,
    skillLevel: recordType === 'all' || recordType === 'skills' ? filters.skillLevel : 'all',
    courseStatus: recordType === 'all' || recordType === 'courses' ? filters.courseStatus : 'all',
    expiryStatus: recordType === 'all' || recordType === 'credentials' ? filters.expiryStatus : 'all',
  };
}

function formatRecordType(format: CareerExportFormat): CareerExportCustomFilters['recordType'] {
  return format === 'skills-csv' ? 'skills' : format === 'courses-csv' ? 'courses' : format === 'credentials-csv' ? 'credentials' : 'all';
}

export default function CareerExportModal({ profileName, skills, courses, credentials, legacyItems, current, currentSummary, currentFilterSummary, initialScope = 'all', onClose }: Props) {
  const [format, setFormat] = useState<CareerExportFormat>('pdf');
  const [scope, setScope] = useState<CareerExportScope>(initialScope);
  const [filters, setFilters] = useState<CareerExportCustomFilters>(DEFAULT_FILTERS);
  const [pdfOptions, setPdfOptions] = useState<CareerExportPdfOptions>({ includeDetails: true, includeNotes: false, includeLegacyItems: true });
  const [busy, setBusy] = useState(false);
  const exportingRef = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [printDocument, setPrintDocument] = useState<CareerExportDocument | null>(null);
  const [generatedAt] = useState(() => new Date());
  const fileName = getCareerExportFileName(format, generatedAt);
  const selected = useMemo(() => resolveCareerExportRecords({ scope, skills, courses, credentials, legacyItems, current, customFilters: filters }), [courses, credentials, current, filters, legacyItems, scope, skills]);
  const reportRecords = format === 'pdf' && !pdfOptions.includeLegacyItems ? { ...selected, legacyItems: [] } : selected;
  const exportCount = format === 'skills-csv' ? selected.skills.length
    : format === 'courses-csv' ? selected.courses.length
      : format === 'credentials-csv' ? selected.credentials.length
        : reportRecords.skills.length + reportRecords.courses.length + reportRecords.credentials.length + reportRecords.legacyItems.length;
  const csvType = formatRecordType(format);
  const showSkillFilter = filters.recordType === 'all' || filters.recordType === 'skills';
  const showCourseFilter = filters.recordType === 'all' || filters.recordType === 'courses';
  const showExpiryFilter = filters.recordType === 'all' || filters.recordType === 'credentials';
  const totalCount = skills.length + courses.length + credentials.length + legacyItems.length;
  const scopeLabel = scope === 'current' ? currentSummary : scope === 'custom' ? 'Choose from all Career records using the filters below.' : `All Career records: ${totalCount.toLocaleString()} ${totalCount === 1 ? 'record' : 'records'}.`;
  const filterSummary = scope === 'custom' ? [filters.recordType !== 'all' ? `Record type: ${RECORD_TYPES.find(option => option.value === filters.recordType)?.label || filters.recordType}` : '', filters.skillLevel !== 'all' ? `Skill level: ${filters.skillLevel}` : '', filters.courseStatus !== 'all' ? `Course status: ${filters.courseStatus}` : '', filters.expiryStatus !== 'all' ? `Expiry: ${filters.expiryStatus}` : '', filters.search.trim() ? `Search: ${filters.search.trim()}` : ''].filter(Boolean).join(' · ') || 'No custom filters' : scope === 'current' ? currentFilterSummary : 'No active filters';

  const update = <K extends keyof CareerExportCustomFilters>(key: K, value: CareerExportCustomFilters[K]) => {
    setFilters(currentFilters => {
      const next = { ...currentFilters, [key]: value };
      return filtersForType(next, next.recordType);
    });
    setError(''); setSuccess('');
  };
  const changeFormat = (value: CareerExportFormat) => {
    setFormat(value);
    setFilters(currentFilters => filtersForType(currentFilters, formatRecordType(value)));
    setSuccess(''); setError('');
  };
  const exportFile = () => {
    if (exportingRef.current || exportCount === 0) return;
    exportingRef.current = true;
    setBusy(true); setError(''); setSuccess('');
    try {
      const document = buildCareerExportDocument({ profileName, generatedAt, scope, scopeLabel, filterSummary, records: reportRecords });
      if (format === 'pdf') { setPrintDocument(document); return; }
      const content = format === 'xlsx' ? buildCareerXlsx(document) : new Blob([format === 'skills-csv' ? buildCareerSkillsCsv(document) : format === 'courses-csv' ? buildCareerCoursesCsv(document) : buildCareerCredentialsCsv(document)], { type: 'text/csv;charset=utf-8' });
      downloadReportBlob(content, fileName); setBusy(false); setSuccess(`Download started: ${fileName}`);
      queueMicrotask(() => { exportingRef.current = false; });
    } catch (exportError) { exportingRef.current = false; setBusy(false); setError(exportError instanceof Error ? exportError.message : 'The Career export could not be prepared.'); }
  };

  return <>
    <SectionExportModal title="Export Career" eyebrow="" onClose={onClose} format={format} formatOptions={FORMATS} onFormatChange={changeFormat} fileName={fileName} busy={busy} error={error} success={success} onExport={exportFile} canExport={exportCount > 0} printFormat="pdf" afterFileNameNotice={<div className="space-y-1 text-xs text-muted-foreground"><p>Attached files are not included. Excel and CSV include available links and show whether proof is attached.</p>{format === 'pdf' ? <p>For a clean PDF, turn off Headers and footers in the print dialog.</p> : null}</div>}>
      <div className="space-y-4">
        <AndroidAdaptiveSelect label="Export scope" value={scope} options={SCOPES} onChange={value => { setScope(value as CareerExportScope); setSuccess(''); setError(''); }} searchable={false} />
        {scope === 'custom' ? <div className="grid gap-4 border-t border-border/50 pt-4 sm:grid-cols-2">
          {csvType === 'all' ? <AndroidAdaptiveSelect label="Record type" value={filters.recordType} options={RECORD_TYPES} onChange={value => update('recordType', value as CareerExportCustomFilters['recordType'])} searchable={false} /> : <p className="text-sm font-semibold">{RECORD_TYPES.find(option => option.value === csvType)?.label} only</p>}
          {showSkillFilter ? <AndroidAdaptiveSelect label="Skill level" value={filters.skillLevel} options={LEVELS} onChange={value => update('skillLevel', value as CareerExportCustomFilters['skillLevel'])} searchable={false} /> : null}
          {showCourseFilter ? <AndroidAdaptiveSelect label="Course status" value={filters.courseStatus} options={STATUSES} onChange={value => update('courseStatus', value as CareerExportCustomFilters['courseStatus'])} searchable={false} /> : null}
          {showExpiryFilter ? <AndroidAdaptiveSelect label="Certificate expiry" value={filters.expiryStatus} options={EXPIRY} onChange={value => update('expiryStatus', value as CareerExportCustomFilters['expiryStatus'])} searchable={false} /> : null}
          <label className="block min-w-0 space-y-1.5 text-sm font-semibold sm:col-span-2"><span>Search</span><input className="control-input w-full" value={filters.search} onChange={event => update('search', event.target.value)} placeholder="Search Career records" /></label>
          <button type="button" onClick={() => { setFilters({ ...DEFAULT_FILTERS, recordType: csvType }); setError(''); setSuccess(''); }} className="min-h-11 justify-self-start rounded-xl border border-border/60 px-3 text-sm font-semibold sm:col-span-2">Clear report filters</button>
        </div> : <p className="text-sm font-semibold text-foreground">{scopeLabel}</p>}
        {format === 'pdf' ? <fieldset className="space-y-2"><legend className="text-sm font-bold">Report contents</legend><label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={pdfOptions.includeDetails} onChange={event => setPdfOptions(value => ({ ...value, includeDetails: event.target.checked }))} /> Item details</label><label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={pdfOptions.includeNotes} onChange={event => setPdfOptions(value => ({ ...value, includeNotes: event.target.checked }))} /> Include notes</label><label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={pdfOptions.includeLegacyItems} onChange={event => setPdfOptions(value => ({ ...value, includeLegacyItems: event.target.checked }))} /> Include saved Career references</label></fieldset> : null}
        <p role="status" aria-live="polite" className="text-sm font-semibold">{exportCount.toLocaleString()} {exportCount === 1 ? 'record' : 'records'} included in {format === 'pdf' ? 'this report' : 'this file'}.{exportCount === 0 ? ' Change the scope or clear the report filters to include records.' : ''}</p>
      </div>
    </SectionExportModal>
    {printDocument ? <PrintableCareerReport reportDocument={printDocument} pdfOptions={pdfOptions} onAfterPrint={() => { exportingRef.current = false; setPrintDocument(null); setBusy(false); setSuccess('Print dialog closed. If you cancelled, no report was saved.'); }} /> : null}
  </>;
}
