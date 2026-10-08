'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DailyChecklistItem, SkincareProduct } from '@/lib/types';
import { getSkincareProductIdsFromLinkedContext, normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CaizenFormDialog } from '@/components/ui/section-kit';

export default function SkincareRoutineCompletionModal({
  isOpen,
  routine,
  products,
  onComplete,
  onClose,
}: {
  isOpen: boolean;
  routine: DailyChecklistItem | null;
  products: SkincareProduct[];
  onComplete: (productIds: string[]) => void;
  onClose: () => void;
}) {
  const linkedIds = useMemo(() => {
    const context = routine ? normalizeLifeHubLinkedContext(routine.linkedContext) : undefined;
    return context?.section === 'skincare' && context.type === 'product' ? getSkincareProductIdsFromLinkedContext(context) : [];
  }, [routine]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (isOpen) setSelected([]); }, [isOpen, routine?.id]);
  if (!isOpen || !routine) return null;
  const linkedProducts = linkedIds.map(id => products.find(product => product.id === id) || { id, name: id, status: undefined } as SkincareProduct);
  const selectable = linkedProducts.filter(product => product.status !== 'emptied' && products.some(item => item.id === product.id));
  const selectAll = () => setSelected(selectable.map(product => product.id));
  return (
    <CaizenFormDialog eyebrow="Skincare routine" title={`Complete ${routine.title}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Choose which active products you used for this routine. Finished or unavailable products stay visible but cannot be selected.</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold" aria-live="polite">{selected.length} product{selected.length === 1 ? '' : 's'} selected</p>
          <button type="button" onClick={selectAll} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-primary">Select all</button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {linkedProducts.map(product => {
            const unavailable = !products.some(item => item.id === product.id);
            const disabled = unavailable || product.status === 'emptied';
            return (
              <div key={product.id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${disabled ? 'border-border/40 text-muted-foreground' : 'border-border/60'}`}>
                <Checkbox
                  checked={selected.includes(product.id)}
                  disabled={disabled}
                  onCheckedChange={checked => setSelected(current => checked ? [...new Set([...current, product.id])] : current.filter(id => id !== product.id))}
                  aria-label={`${product.name}${disabled ? ` · ${unavailable ? 'Unavailable' : 'Finished'}` : ''}`}
                />
                <span className="flex-1 text-sm font-semibold">{product.name}</span>
                <span className="text-xs">{unavailable ? 'Unavailable' : product.status === 'emptied' ? 'Finished' : 'Active'}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => onComplete([])}>Complete without logging products</Button>
          <Button type="button" onClick={() => onComplete(selected)} disabled={selected.length === 0}>Complete routine</Button>
        </div>
      </div>
    </CaizenFormDialog>
  );
}
