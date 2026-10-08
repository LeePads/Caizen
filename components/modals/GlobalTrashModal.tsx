'use client';

import { createPortal } from 'react-dom';
import { useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import type { TrashItem } from '@/lib/types';

const DAY_MS = 1000 * 60 * 60 * 24;

function daysLeft(item: TrashItem) {
  return Math.max(0, Math.ceil((new Date(item.deleteAfter).getTime() - Date.now()) / DAY_MS));
}

export default function GlobalTrashModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { trashItems, restoreTrashItem, deleteTrashItemPermanently, deleteTrashItemsPermanently, getCurrentProfile } = useAppContext();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState<'recent' | 'expiring'>('recent');
  const [permanentDeleteItem, setPermanentDeleteItem] = useState<TrashItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const modalPanelRef = useRef<HTMLElement | null>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  const profileName = getCurrentProfile()?.name || 'current profile';

  useOverlayLifecycle(isOpen, close, { containerRef: modalPanelRef });

  const sources = useMemo(
    () => Array.from(new Set(trashItems.map(item => item.sourceLabel))).sort(),
    [trashItems],
  );

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return trashItems
      .filter(item => source === 'all' || item.sourceLabel === source)
      .filter(item => !normalized || `${item.title} ${item.sourceLabel}`.toLowerCase().includes(normalized))
      .sort((a, b) =>
        sort === 'expiring'
          ? new Date(a.deleteAfter).getTime() - new Date(b.deleteAfter).getTime()
          : new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
      );
  }, [query, sort, source, trashItems]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
        <div aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

        <section ref={modalPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="caizen-trash-title" className="modal-card-enter relative z-10 flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] border border-border/60 bg-background/96 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-[2rem]">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/55 px-5 py-5 sm:px-7">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Recently deleted</p>
              <h2 id="caizen-trash-title" className="mt-1 text-2xl font-black">Recently deleted in {profileName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Recover supported records for 30 days: Life Hub tasks, routines and dates; Music; Work Hub; Personal Vault and Career; Entertainment titles; Inventory; Skincare; Purchase plans; and Books. Money transactions, most Health entries, Games and Guides, and Journal entries do not appear here. Managed attachments remain recoverable with their records; external image links stay external.</p>
            </div>
            <button type="button" onClick={close} className="rounded-xl border border-border/60 p-2.5 text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="shrink-0 border-b border-border/45 bg-card/35 p-4 sm:px-7">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <SearchField value={query} onChange={setQuery} placeholder="Search deleted records" aria-label="Search deleted records" surface="solid" />
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger aria-label="Filter deleted records by section" className="h-11 w-full">
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {sources.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={value => setSort(value as 'recent' | 'expiring')}>
                <SelectTrigger aria-label="Sort deleted records" className="h-11 w-full">
                  <SelectValue placeholder="Recently deleted" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently deleted</SelectItem>
                  <SelectItem value="expiring">Expiring first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
            {visibleItems.length === 0 ? (
              <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                <div>
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Trash2 className="h-6 w-6" />
                  </span>
                  <p className="mt-4 font-black">{trashItems.length ? 'No matching deleted records' : 'No recently deleted records'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{trashItems.length ? 'Try a different search or section filter.' : 'Supported deleted records appear here until they expire.'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map(item => {
                  const remaining = daysLeft(item);
                  return (
                    <article key={item.id} className="rounded-2xl border border-border/60 bg-card/55 p-4 transition hover:border-primary/20 hover:bg-card/80">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">{item.sourceLabel}</span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${remaining <= 3 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                              {remaining} {remaining === 1 ? 'day' : 'days'} remaining
                            </span>
                          </div>
                          <h3 className="mt-2 truncate text-base font-black">{item.title}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Deleted {new Date(item.deletedAt).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => restoreTrashItem(item.id)} className="rounded-xl">
                            <RotateCcw className="mr-2 h-4 w-4" /> Restore
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setPermanentDeleteItem(item)} className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs text-muted-foreground">{trashItems.length} deleted {trashItems.length === 1 ? 'record' : 'records'} in {profileName}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={close} className="rounded-xl">Close</Button>
              <Button variant="destructive" disabled={!trashItems.length} onClick={() => setConfirmEmpty(true)} className="rounded-xl">Empty Recently Deleted</Button>
            </div>
          </footer>
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(permanentDeleteItem)}
        title="Delete permanently?"
        message={permanentDeleteItem ? `Permanently delete “${permanentDeleteItem.title}” from this profile? This cannot be undone locally. Its managed attachments will be removed; this does not directly delete a separate Cloud snapshot.` : 'This cannot be undone locally.'}
        confirmText="Delete Permanently"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setPermanentDeleteItem(null)}
        onConfirm={() => {
          if (permanentDeleteItem) deleteTrashItemPermanently(permanentDeleteItem.id);
          setPermanentDeleteItem(null);
        }}
      />

      <ConfirmDialog
        isOpen={confirmEmpty}
        title="Empty Recently Deleted?"
        message={`Permanently delete all ${trashItems.length} recoverable records from this profile? This cannot be undone locally. Managed attachments will be removed; separate Cloud snapshots are not directly deleted.`}
        confirmText="Empty Recently Deleted"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          deleteTrashItemsPermanently(trashItems.map(item => item.id));
          setConfirmEmpty(false);
        }}
      />
    </>,
    document.body,
  );
}
