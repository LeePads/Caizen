import { useEffect, useMemo, useState } from 'react';
import type { DailyChecklistItem, Supplement } from '@/lib/types';
import { getSupplementIdsFromLinkedContext, normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';
import { isSupplementExpired } from '@/lib/supplements/lifehub-activity';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CaizenFormDialog } from '@/components/ui/section-kit';

export default function SupplementRoutineCompletionModal({
  isOpen,
  routine,
  supplements,
  onComplete,
  onClose,
}: {
  isOpen: boolean;
  routine: DailyChecklistItem | null;
  supplements: Supplement[];
  onComplete: (supplementIds: string[]) => void;
  onClose: () => void;
}) {
  const linkedIds = useMemo(() => {
    const context = routine ? normalizeLifeHubLinkedContext(routine.linkedContext) : undefined;
    return context?.section === 'supplements' && context.type === 'supplement'
      ? getSupplementIdsFromLinkedContext(context)
      : [];
  }, [routine]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelected([]);
  }, [isOpen, routine?.id]);

  if (!isOpen || !routine) return null;

  const linkedSupplements = linkedIds.map(id => supplements.find(item => item.id === id) || {
    id,
    name: id,
    purchasePrice: 0,
    startDate: null,
    dosage: '',
    quantityRemaining: 0,
    createdAt: new Date(0),
  } satisfies Supplement);
  const selectable = linkedSupplements.filter(item => supplements.some(entry => entry.id === item.id) && !isSupplementExpired(item));

  return (
    <CaizenFormDialog eyebrow="Supplement routine" title={`Complete ${routine.title}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose which active supplements you took for this routine. Expired or unavailable supplements stay visible but cannot be selected.
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold" aria-live="polite">{selected.length} supplement{selected.length === 1 ? '' : 's'} selected</p>
          <button type="button" onClick={() => setSelected(selectable.map(item => item.id))} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-primary">Select all</button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {linkedSupplements.map(supplement => {
            const unavailable = !supplements.some(item => item.id === supplement.id);
            const expired = !unavailable && isSupplementExpired(supplement);
            const disabled = unavailable || expired;
            return (
              <div key={supplement.id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${disabled ? 'border-border/40 text-muted-foreground' : 'border-border/60'}`}>
                <Checkbox
                  checked={selected.includes(supplement.id)}
                  disabled={disabled}
                  onCheckedChange={checked => setSelected(current => checked ? [...new Set([...current, supplement.id])] : current.filter(id => id !== supplement.id))}
                  aria-label={`${supplement.name}${disabled ? ` · ${unavailable ? 'Unavailable' : 'Expired'}` : ''}`}
                />
                <span className="flex-1 text-sm font-semibold">{supplement.name}</span>
                <span className="text-xs">{unavailable ? 'Unavailable' : expired ? 'Expired' : 'Active'}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => onComplete([])}>Complete without logging supplements</Button>
          <Button type="button" onClick={() => onComplete(selected)} disabled={selected.length === 0}>Complete routine</Button>
        </div>
      </div>
    </CaizenFormDialog>
  );
}
