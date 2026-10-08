'use client';

import { useState } from 'react';
import { useAppContext } from '@/lib/context';
import { formatLocalDateInput, parseLocalDateInput } from '@/lib/date-utils';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { CaizenBottomSheet } from '@/components/native/android-design';

const QUICK_AMOUNTS_ML = [150, 250, 500];

export function WaterQuickAddModal({
  initialDate,
  androidPresentation = false,
  onClose,
}: {
  initialDate?: string;
  androidPresentation?: boolean;
  onClose: () => void;
}) {
  const { addWaterEntry } = useAppContext();
  const [customAmount, setCustomAmount] = useState('');
  const date = parseLocalDateInput(initialDate || formatLocalDateInput(new Date())) || new Date();

  const add = (amountMl: number) => {
    if (!Number.isFinite(amountMl) || amountMl < 1) return;
    if (addWaterEntry({ date, amountMl })) onClose();
  };

  const content = (
    <>
      <p className="text-sm text-muted-foreground">Add water for {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {QUICK_AMOUNTS_ML.map(amount => (
          <button key={amount} type="button" onClick={() => add(amount)} className="min-h-11 rounded-xl border border-border/70 px-3 text-sm font-bold hover:bg-muted">
            {amount} ml
          </button>
        ))}
      </div>
      <form id="quick-add-water-form" className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); add(Number(customAmount)); }}>
        <label className="sr-only" htmlFor="quick-add-water-custom">Custom water amount in milliliters</label>
        <input id="quick-add-water-custom" type="number" min="1" step="1" inputMode="numeric" value={customAmount} onChange={event => setCustomAmount(event.target.value)} placeholder="Custom amount (ml)" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 text-sm" />
        {androidPresentation ? <button type="submit" disabled={!customAmount || Number(customAmount) < 1} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">Add</button> : null}
      </form>
    </>
  );

  return androidPresentation
    ? <CaizenBottomSheet open title="Log water" description="Add a water entry for your selected day." onClose={onClose}>{content}</CaizenBottomSheet>
    : <CaizenFormDialog eyebrow="Quick add" title="Log water" onClose={onClose} maxWidthClass="max-w-md" footer={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border/70 px-4 text-sm font-bold">Cancel</button>
        <button type="submit" form="quick-add-water-form" disabled={!customAmount || Number(customAmount) < 1} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">Add</button>
      </div>
    )}>{content}</CaizenFormDialog>;
}
