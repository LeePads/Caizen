'use client';
import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { getSectionDiscoveryMeta, type SectionId } from '@/lib/discovery/section-meta';
import { DEMO_CHAPTERS, DEMO_JOURNEY, DEMO_LESSONS } from '@/lib/discovery/demo-journey';
import type { QuickAddKind } from '@/lib/quick-add';

export function SectionGuide({ sectionId, mode, open = true, onOpen, onDismiss, onNavigate, onFirstAction, onDemo, children }: {
  sectionId: string; mode: 'demo' | 'onboarding' | 'help'; open?: boolean;
  onOpen?: () => void; onDismiss?: () => void; onNavigate: (section: SectionId) => void;
  onFirstAction?: (kind: QuickAddKind) => void; onDemo?: () => void; children?: ReactNode;
}) {
  const [allAreas, setAllAreas] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const meta = getSectionDiscoveryMeta(sectionId);
  if (!meta) return null;
  const lesson = DEMO_LESSONS[sectionId as SectionId];
  const index = DEMO_JOURNEY.indexOf(sectionId as SectionId);
  const navigate = (section: SectionId) => {
    onNavigate(section); setAnnouncement(`Exploring ${getSectionDiscoveryMeta(section)?.label}.`);
  };
  if (!open) return <div className="mb-4 border-b border-border pb-3"><button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Compass className="h-4 w-4" aria-hidden="true" />Guide to {meta.label}</button></div>;
  return <section id="caizen-section-guide" role="region" aria-labelledby="caizen-section-guide-title" data-caizen-nested-flow="open" className="mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 max-w-2xl"><h2 ref={heading} id="caizen-section-guide-title" tabIndex={-1} className="text-section-title outline-none">{meta.label}: {mode === 'demo' ? 'what to notice' : 'start here'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{meta.purpose}</p></div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Collapse section guide" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" aria-hidden="true" /></button>}
    </div>
    {mode === 'demo' ? <div className="mt-3 max-w-2xl space-y-2 text-sm leading-6"><p>{lesson.notice}</p><p><strong>Try this: </strong>{lesson.tryThis}</p>{lesson.feature && <button type="button" className="min-h-11 rounded-xl px-3 font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: sectionId, feature: lesson.feature } }))}>Open this view</button>}</div> : <><p className="mt-3 text-sm text-muted-foreground">{meta.summary}</p><div className="mt-3 flex flex-wrap gap-2">{meta.suggestedFirstAction && onFirstAction && <button type="button" className="control-button-primary min-h-11 rounded-xl px-4 text-sm font-semibold" onClick={() => onFirstAction(meta.suggestedFirstAction!)}>{meta.firstActionLabel}</button>}{onDemo && <button type="button" className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={onDemo}>See this with sample data</button>}</div></>}
    <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm"><span className="text-muted-foreground">Related:</span>{meta.relatedSections?.map(id => <button key={id} type="button" className="min-h-11 rounded-xl px-2 font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => navigate(id as SectionId)}>{getSectionDiscoveryMeta(id)?.label}</button>)}</div>
    {mode === 'demo' && <nav aria-label="Demo journey" className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <button type="button" disabled={index <= 0} onClick={() => navigate(DEMO_JOURNEY[index - 1])} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-40 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" />Previous</button>
      <button type="button" aria-expanded={allAreas} onClick={() => setAllAreas(value => !value)} className="min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">All areas</button>
      <button type="button" onClick={() => navigate(DEMO_JOURNEY[(index + 1) % DEMO_JOURNEY.length])} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{index === DEMO_JOURNEY.length - 1 ? 'Back to Dashboard' : `Next: ${getSectionDiscoveryMeta(DEMO_JOURNEY[index + 1])?.label}`}<ArrowRight className="h-4 w-4" /></button>
    </nav>}
    {mode === 'demo' && allAreas && <nav aria-label="All Caizen areas" className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{DEMO_CHAPTERS.map(chapter => <div key={chapter.title}><p className="text-sm text-muted-foreground">{chapter.title}</p>{chapter.sections.map(id => <button key={id} type="button" aria-current={id === sectionId ? 'page' : undefined} onClick={() => navigate(id)} className="mr-1 min-h-11 rounded-xl px-2 text-sm font-semibold hover:bg-muted aria-[current=page]:text-primary focus-visible:ring-2 focus-visible:ring-ring">{getSectionDiscoveryMeta(id)?.label}</button>)}</div>)}</nav>}
    {children}<span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}
