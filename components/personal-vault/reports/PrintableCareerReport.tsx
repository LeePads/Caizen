'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { CareerExportDocument, CareerExportPdfOptions } from '@/lib/collections/career-exports';

type Props = {
  reportDocument: CareerExportDocument;
  pdfOptions: CareerExportPdfOptions;
  onAfterPrint?: () => void;
};

const dash = (value: string | undefined) => value?.trim() || '—';
const dateLabel = (value: Date) => value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const expiryTime = (value: string) => value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;

export default function PrintableCareerReport({ reportDocument, pdfOptions, onAfterPrint }: Props) {
  const afterPrintRef = useRef(onAfterPrint);
  afterPrintRef.current = onAfterPrint;
  useEffect(() => {
    const after = () => afterPrintRef.current?.();
    window.addEventListener('afterprint', after);
    const timer = window.setTimeout(() => {
      try { window.print(); } catch { afterPrintRef.current?.(); }
    }, 120);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, []);

  const { summary } = reportDocument;
  const summaryItems = [
    ['Skills', summary.skillCount.toLocaleString()],
    ['Completed courses', summary.completedCourseCount.toLocaleString()],
    ['Certificates', summary.credentialCount.toLocaleString()],
    ['Expiring soon', summary.expiringSoonCount.toLocaleString()],
    ['Saved Career references', summary.legacyItemCount.toLocaleString()],
  ];
  const allNotes = [
    ...reportDocument.skills.map(item => ({ title: item.name, notes: item.notes })),
    ...reportDocument.courses.map(item => ({ title: item.title, notes: item.notes })),
    ...reportDocument.credentials.map(item => ({ title: item.title, notes: item.notes })),
  ].filter(item => item.notes.trim());
  const certificateOverview = reportDocument.credentials.slice().sort((a, b) =>
    Number(b.expiryStatus === 'Expiring soon') - Number(a.expiryStatus === 'Expiring soon')
    || expiryTime(a.expiryDate) - expiryTime(b.expiryDate)
    || a.title.localeCompare(b.title),
  ).slice(0, 8);

  return createPortal(
    <div className="career-print-portal" aria-hidden="true">
      <article className="career-print-document">
        <header className="career-print-header">
          <img className="career-print-logo" src="/icons/caizen-primary-light-3000.png" alt="Caizen" />
          <div><h1>Career Report</h1><p>{reportDocument.profileName} · {reportDocument.scopeLabel}</p></div>
          <dl><div><dt>Generated</dt><dd>{dateLabel(reportDocument.generatedAt)}</dd></div><div><dt>Filters</dt><dd>{dash(reportDocument.filterSummary)}</dd></div></dl>
        </header>

        <section><h2>Summary</h2><div className="career-print-summary-strip">{summaryItems.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="career-print-note">For a clean PDF, turn off Headers and footers in the print dialog.</p></section>

        <section><h2>Certificates by expiry</h2><p className="career-print-note">Up to eight certificates, with expiring soon shown first, then ordered by expiry date.</p>{certificateOverview.length ? <div className="career-print-credential-list">{certificateOverview.map((item, index) => <div key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{item.expiryStatus}{item.expiryDate ? ` · ${item.expiryDate}` : ''}</span></div>)}</div> : <p className="career-print-empty">No certificates are included in this export.</p>}</section>

        {pdfOptions.includeDetails ? <>
          <section><h2>Skills</h2>{reportDocument.skills.length ? <table className="career-print-table"><colgroup><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /></colgroup><thead><tr><th>Skill</th><th>Area</th><th>Level</th><th>Related courses</th><th>Related certificates</th></tr></thead><tbody>{reportDocument.skills.map(item => <tr key={item.name}><td>{item.name}</td><td>{dash(item.area)}</td><td>{dash(item.level)}</td><td>{dash(item.relatedCourses)}</td><td>{dash(item.relatedCredentials)}</td></tr>)}</tbody></table> : <p className="career-print-empty">No skills are included in this export.</p>}</section>
          <section><h2>Courses</h2>{reportDocument.courses.length ? <table className="career-print-table"><colgroup><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup><thead><tr><th>Course</th><th>Provider</th><th>Status</th><th>Dates</th><th>Related skills</th><th>Related certificates</th></tr></thead><tbody>{reportDocument.courses.map(item => <tr key={item.title}><td>{item.title}</td><td>{dash(item.provider)}</td><td>{item.status}</td><td>{[item.startDate, item.completionDate].filter(Boolean).join(' – ') || '—'}</td><td>{dash(item.relatedSkills)}</td><td>{dash(item.relatedCredentials)}</td></tr>)}</tbody></table> : <p className="career-print-empty">No courses are included in this export.</p>}</section>
          <section><h2>Certificates</h2>{reportDocument.credentials.length ? <table className="career-print-table"><colgroup><col style={{ width: '24%' }} /><col style={{ width: '16%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '26%' }} /><col style={{ width: '10%' }} /></colgroup><thead><tr><th>Certificate</th><th>Issuer</th><th>Expiry</th><th>Status</th><th>Related skills / courses</th><th>Proof</th></tr></thead><tbody>{reportDocument.credentials.map(item => <tr key={item.title}><td>{item.title}</td><td>{dash(item.issuer)}</td><td>{item.expiryDate || '—'}</td><td>{item.expiryStatus}</td><td>{[item.relatedSkills, item.relatedCourses].filter(Boolean).join(' / ') || '—'}</td><td>{item.proofAttached ? 'Attached' : 'Not attached'}</td></tr>)}</tbody></table> : <p className="career-print-empty">No certificates are included in this export.</p>}</section>
          {pdfOptions.includeLegacyItems ? <section><h2>Saved Career references</h2>{reportDocument.legacyItems.length ? <table className="career-print-table"><colgroup><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /></colgroup><thead><tr><th>Title</th><th>Category</th><th>Issuer</th><th>Date</th><th>Expiry</th></tr></thead><tbody>{reportDocument.legacyItems.map(item => <tr key={item.title}><td>{item.title}</td><td>{dash(item.category)}</td><td>{dash(item.issuer)}</td><td>{item.date || '—'}</td><td>{item.expiryDate || '—'}</td></tr>)}</tbody></table> : <p className="career-print-empty">No Saved Career references are included in this export.</p>}</section> : null}
        </> : null}

        {pdfOptions.includeNotes ? <section className="career-print-notes-section"><h2>Notes</h2>{allNotes.length ? <div className="career-print-notes-list">{allNotes.map((item, index) => <div key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.notes}</p></div>)}</div> : <p className="career-print-empty">No notes are included in this export.</p>}</section> : null}
      </article>
    </div>,
    document.body,
  );
}
