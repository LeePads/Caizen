'use client';
import { useState, type ComponentProps } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SECTION_DISCOVERY_META, type SectionId } from '@/lib/discovery/section-meta';
const TOPICS = [
  ['Local storage and backups', 'Everyday records live on this device. Keep a complete .caizen backup to protect records and included media. JSON contains structured data.'],
  ['Profiles', 'Profiles keep separate records on the same device. They are not shared or collaborative workspaces.'],
  ['Optional Cloud Backup', 'No account is required for local use. Sign in from Settings to review or create optional Cloud backups. Restoring requires your choice.'],
  ['Demo safety and returning', 'Demo opens a sample workspace and preserves your own. Use the return action in the Demo banner to resume setup or restore your workspace. Demo edits are discarded on exit.'],
];
export function LearnCaizenDialog({ isOpen, onClose, onNavigate, onCloseAutoFocus }: { isOpen: boolean; onClose: () => void; onNavigate: (section: SectionId) => void; onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus'] }) {
  const [query, setQuery] = useState('');
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const sections = Object.values(SECTION_DISCOVERY_META).filter(meta => matches(`${meta.label} ${meta.purpose} ${meta.summary}`));
  const topics = TOPICS.filter(topic => matches(topic.join(' ')));
  return <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}><DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Learn Caizen</DialogTitle><DialogDescription>Start with one useful area. Everything else stays available.</DialogDescription></DialogHeader>
    <label className="text-sm font-semibold">Search help<input value={query} onChange={event => setQuery(event.target.value)} className="control-input mt-2 w-full" placeholder="Sections, backups, Demo…" /></label>
    <div className="divide-y divide-border">{sections.map(meta => <button type="button" key={meta.id} onClick={() => onNavigate(meta.id as SectionId)} className="block w-full rounded-xl px-2 py-4 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><span className="font-semibold">{meta.label}</span><span className="mt-1 block text-sm leading-6 text-muted-foreground">{meta.purpose}</span></button>)}{topics.map(([title, copy]) => <article key={title} className="py-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p></article>)}{!sections.length && !topics.length && <p className="py-6 text-sm text-muted-foreground">No help topics match. Try a section name or “backup”.</p>}</div>
  </DialogContent></Dialog>;
}
