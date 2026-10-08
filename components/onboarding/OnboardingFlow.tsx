'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SectionGuide } from '@/components/discovery/SectionGuide';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';
import { DEMO_PROFILE_DISPLAY_NAME } from '@/lib/demo/demo-workspace';
import { ONBOARDING_PRIORITIES, primaryTabsForOnboarding, type OnboardingDraft, type OnboardingMode, type OnboardingPriority } from '@/lib/onboarding';
import { getCurrencySelectOptions } from '@/lib/currency';
import { useOnboarding } from '@/hooks/use-onboarding';
import type { CurrencyCode } from '@/lib/types';
import type { QuickAddKind } from '@/lib/quick-add';

const secondary = 'min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const primary = 'control-button-primary min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50';
export function OnboardingFlow({ isOpen, profileId, profileName, currency, mode, activeTab, onComplete, onSkip, onPreviewSection, onRestore, onCloud, onDemo, onFirstAction }: {
  isOpen: boolean; profileId: string; profileName: string; currency: CurrencyCode; mode: OnboardingMode; activeTab: string;
  onComplete: (draft: OnboardingDraft) => Promise<void>; onSkip: () => Promise<void>;
  onPreviewSection: (section: OnboardingPriority | 'dashboard') => void;
  onRestore: (format: 'complete' | 'data') => void; onCloud: () => void;
  onDemo: (section: OnboardingPriority | undefined, draft: OnboardingDraft) => void;
  onFirstAction: (kind: QuickAddKind) => void; onCurrencySettings?: () => void;
}) {
  const { draft, update, checkpoint, error, setError } = useOnboarding(profileId, mode, profileName, currency);
  const [recovery, setRecovery] = useState(false);
  const [additional, setAdditional] = useState(false);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const expected = useRef<string | null>(null);
  const arrived = useRef(false);
  const running = useRef(false);
  const currentPriority = draft?.priorities[draft.experienceIndex];
  useEffect(() => {
    if (!isOpen || !draft || draft.status !== 'active' || draft.phase !== 'preview') return;
    const target = currentPriority || 'dashboard';
    if (expected.current !== target) {
      expected.current = target; arrived.current = activeTab === target;
      onPreviewSection(target); return;
    }
    if (activeTab === target) arrived.current = true;
    else if (arrived.current) update({ status: 'paused' });
  }, [isOpen, draft, currentPriority, activeTab, onPreviewSection, update]);
  useEffect(() => { if (isOpen && draft?.status === 'active' && draft.phase !== 'preview') heading.current?.focus({ preventScroll: true }); }, [isOpen, draft?.phase, draft?.status]);
  useEffect(() => {
    if (!isOpen || !draft || draft.status !== 'active') return;
    const handleBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean; kind: string }>).detail;
      if (!detail || detail.handled || (draft.phase !== 'preview' && detail.kind !== 'overlay')) return;
      detail.handled = true;
      if (busy) return;
      if (draft.phase === 'welcome' || draft.phase === 'preview') update({ status: 'paused' });
      else update({ phase: draft.phase === 'essentials' || mode === 'replay' ? 'welcome' : 'essentials' });
    };
    window.addEventListener('caizen:native-back-request', handleBack);
    return () => window.removeEventListener('caizen:native-back-request', handleBack);
  }, [isOpen, draft, busy, mode, update]);
  useEffect(() => {
    if (isOpen && draft?.phase === 'preview' && draft.status === 'active') {
      document.getElementById('caizen-section-guide-title')?.focus({ preventScroll: true });
    }
  }, [isOpen, draft?.phase, draft?.status, draft?.experienceIndex]);
  if (!isOpen) return null;
  if (!draft) return error ? <p role="alert" className="p-4 text-destructive">{error}</p> : null;
  const execute = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your choices could not be saved. Try again.'); }
    finally { running.current = false; setBusy(false); }
  };
  const finish = (action?: QuickAddKind) => execute(async () => {
    const saved = await checkpoint(); await onComplete(saved); if (action) onFirstAction(action);
  });
  const demo = (section?: OnboardingPriority) => execute(async () => onDemo(section, await checkpoint()));
  const back = () => {
    if (busy) return;
    if (draft.phase === 'welcome') update({ status: 'paused' });
    else if (draft.phase === 'essentials') update({ phase: 'welcome' });
    else if (draft.phase === 'interests') update({ phase: mode === 'replay' ? 'welcome' : 'essentials' });
    else if (draft.experienceIndex > 0) update({ experienceIndex: draft.experienceIndex - 1 });
    else update({ phase: 'interests' });
  };
  if (draft.status === 'paused') return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2"><p className="text-sm text-muted-foreground">Your setup choices are saved.</p><button type="button" className={secondary} onClick={() => { expected.current = null; arrived.current = false; update({ status: 'active' }); }}>Continue {mode === 'replay' ? 'introduction' : 'setup'}</button>{error && <p role="alert">{error}</p>}</div>;
  if (draft.phase === 'preview') return <SectionGuide sectionId={currentPriority || 'dashboard'} mode="onboarding" onNavigate={section => { update({ status: 'paused' }); window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section } })); }} onDismiss={() => update({ status: 'paused' })} onFirstAction={kind => void finish(kind)} onDemo={() => void demo(currentPriority)}>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <footer className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3"><button className={secondary} disabled={busy} onClick={back}>Back</button><div className="flex flex-wrap gap-2">{draft.experienceIndex + 1 < draft.priorities.length && <button className={secondary} disabled={busy} onClick={() => update({ experienceIndex: draft.experienceIndex + 1 })}>Next area</button>}<button className={primary} disabled={busy} onClick={() => void finish()}>Finish setup</button></div></footer>
  </SectionGuide>;
  const title = draft.phase === 'welcome' ? (mode === 'replay' ? 'Learn Caizen at your pace.' : 'A place for the things you want to keep track of.') : draft.phase === 'essentials' ? 'Make this workspace yours.' : 'What would you like help with first?';
  return <Dialog open onOpenChange={open => { if (!open) back(); }}><DialogContent showCloseButton={false} className="flex h-dvh max-h-dvh w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl" onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }} onInteractOutside={event => event.preventDefault()}>
    <header className="shrink-0 border-b border-border px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8 sm:pt-6"><DialogTitle ref={heading} tabIndex={-1} className="max-w-xl text-page-title outline-none">{title}</DialogTitle><DialogDescription className="mt-3 text-sm leading-6">{draft.phase === 'welcome' ? 'Plan your days, understand your money, and keep useful records together. Start with the parts that matter to you.' : draft.phase === 'essentials' ? 'Use the defaults or make a few choices. You can change them later.' : 'Choose a starting area. Everything stays available.'}</DialogDescription></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">
      {draft.phase === 'welcome' && <div className="space-y-4"><p className="text-sm font-semibold">Stored on this device. No account required.</p><div className="divide-y divide-border rounded-xl border border-border">
        <button type="button" disabled={busy} onClick={() => update({ phase: mode === 'replay' ? 'interests' : 'essentials' })} className="flex w-full items-center justify-between gap-4 rounded-t-xl p-4 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><span><strong className="block text-base">{mode === 'replay' ? 'Choose areas to explore' : 'Set up my Caizen'}</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">{mode === 'replay' ? 'Revisit the guide. Your profile and navigation stay unchanged.' : 'Start with an empty workspace and choose where to begin.'}</span></span><ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" /></button>
        <button type="button" disabled={busy} onClick={() => void demo()} className="flex w-full items-center justify-between gap-4 rounded-b-xl p-4 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><span><strong className="block text-base">Explore a ready-made Caizen</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">Try {DEMO_PROFILE_DISPLAY_NAME}’s sample workspace. Your own workspace and setup will be preserved.</span></span><Compass className="h-5 w-5 shrink-0" aria-hidden="true" /></button>
      </div><button type="button" className={`${secondary} w-full text-left`} aria-expanded={recovery} aria-controls="caizen-restore-choices" onClick={() => setRecovery(value => !value)}>I already have Caizen data</button>{recovery && <div id="caizen-restore-choices" className="space-y-3 border-t border-border pt-3"><button type="button" className={`${secondary} block w-full text-left`} onClick={() => onRestore('complete')}>Complete .caizen backup<span className="block font-normal text-muted-foreground">Records and included media</span></button><button type="button" className={`${secondary} block w-full text-left`} onClick={() => onRestore('data')}>JSON<span className="block font-normal text-muted-foreground">Structured data; media may not be included</span></button><button type="button" className={`${secondary} block w-full text-left`} onClick={onCloud}>Cloud Backup<span className="block font-normal text-muted-foreground">Sign in to review backups. Nothing is restored automatically.</span></button></div>}</div>}
      {draft.phase === 'essentials' && <div className="space-y-5"><label className="block text-sm font-semibold">Workspace name<input className="control-input mt-2 w-full" maxLength={50} value={draft.name} onChange={event => update({ name: event.target.value })} /></label><label className="block text-sm font-semibold">Base currency<select className="control-input mt-2 w-full" value={draft.currency} onChange={event => update({ currency: event.target.value as CurrencyCode })}>{getCurrencySelectOptions().map(option => <option key={option.value} value={option.value}>{option.label} — {option.description}</option>)}</select><span className="mt-2 block text-sm font-normal text-muted-foreground">Money uses this as the base currency for your workspace.</span></label></div>}
      {draft.phase === 'interests' && <div className="space-y-4"><fieldset><legend className="sr-only">Starting area</legend><div className="grid gap-2 sm:grid-cols-2">{ONBOARDING_PRIORITIES.map(item => <label key={item.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"><input type="radio" name="caizen-starting-area" value={item.id} checked={draft.priorities[0] === item.id} onChange={() => update({ priorities: [item.id, ...draft.priorities.slice(1).filter(id => id !== item.id)] })} className="mt-1 h-4 w-4 accent-primary" /><span className="text-sm"><strong>{item.label}</strong><span className="mt-1 block leading-5 text-muted-foreground">{item.id === 'inventory' ? 'Belongings, product care, and Skincare' : item.id === 'entertainment' ? 'Watching, reading, games, and Music' : getSectionDiscoveryMeta(item.id)?.summary}</span></span></label>)}</div><button type="button" className={secondary} onClick={() => update({ priorities: [] })}>No preference yet</button></fieldset>
      {draft.priorities.length > 0 && <><button type="button" className={secondary} aria-expanded={additional} onClick={() => setAdditional(value => !value)}>Add another area</button>{additional && <fieldset className="space-y-2"><legend className="mb-2 text-sm text-muted-foreground">Choose up to two more areas.</legend>{ONBOARDING_PRIORITIES.filter(item => item.id !== draft.priorities[0]).map(item => <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.priorities.includes(item.id)} disabled={!draft.priorities.includes(item.id) && draft.priorities.length >= 3} onChange={() => update({ priorities: draft.priorities.includes(item.id) ? draft.priorities.filter(id => id !== item.id) : [...draft.priorities, item.id] })} />{item.label}</label>)}</fieldset>}<p className="text-sm text-muted-foreground" aria-live="polite">{draft.priorities.length} of 3 areas selected</p>{mode === 'fresh' && <label className="flex items-start gap-3 border-t border-border pt-4 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={draft.customizeNavigation} onChange={event => update({ customizeNavigation: event.target.checked })} /><span>Bring these areas forward in navigation<span className="mt-1 block text-muted-foreground">{primaryTabsForOnboarding(draft.priorities).map(id => getSectionDiscoveryMeta(id)?.label).join(' · ')}. All areas remain available.</span></span></label>}</>}
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-8"><button type="button" className={secondary} disabled={busy} onClick={() => draft.phase === 'welcome' ? void execute(onSkip) : back()}>{draft.phase === 'welcome' ? 'Explore on my own' : 'Back'}</button><div className="flex flex-wrap gap-2">{draft.phase === 'essentials' && <><button type="button" className={secondary} disabled={busy} onClick={() => update({ name: profileName, currency, phase: 'interests' })}>Use defaults</button><button type="button" className={primary} disabled={busy} onClick={() => update({ phase: 'interests' })}>Continue</button></>}{draft.phase === 'interests' && <>{draft.priorities.length > 0 && <button type="button" className={secondary} disabled={busy} onClick={() => { expected.current = null; update({ phase: 'preview', experienceIndex: 0 }); }}>Preview my areas</button>}<button type="button" className={primary} disabled={busy} onClick={() => void finish()}>{busy ? 'Saving choices…' : draft.priorities[0] ? `Start with ${getSectionDiscoveryMeta(draft.priorities[0])?.label}` : 'Open Dashboard'}</button></>}</div></footer>
  </DialogContent></Dialog>;
}
