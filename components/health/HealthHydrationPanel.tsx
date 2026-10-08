'use client';

import { useMemo, useState } from 'react';
import { Droplets, Plus, Trash2 } from 'lucide-react';
import { HealthDetails } from '@/components/health/HealthDetails';
import { useAppContext } from '@/lib/context';
import { formatLocalDateInput, parseLocalDateInput, toLocalDateKey } from '@/lib/date-utils';
import { shiftHealthDate } from '@/lib/health/date-navigation';

const QUICK_AMOUNTS_ML = [150, 250, 500];

export function HealthHydrationPanel({
  date: dateInput,
  onSetTarget,
}: {
  date: Date | string;
  onSetTarget: () => void;
}) {
  const { health, addWaterEntry, deleteWaterEntry } = useAppContext();
  const [customAmount, setCustomAmount] = useState('');
  const dateKey = toLocalDateKey(dateInput);
  const date = parseLocalDateInput(dateKey) || new Date();
  const entries = health.waterEntries || [];
  const todayEntries = entries
    .filter(entry => toLocalDateKey(entry.date) === dateKey)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const totalMl = todayEntries.reduce((sum, entry) => sum + entry.amountMl, 0);
  const target = health.targetWaterMl;
  const recentDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const key = shiftHealthDate(dateKey, -(6 - index), toLocalDateKey(new Date()));
    const day = parseLocalDateInput(key) || date;
    return {
      key,
      day,
      amount: entries.filter(entry => toLocalDateKey(entry.date) === key).reduce((sum, entry) => sum + entry.amountMl, 0),
    };
  }), [date, dateKey, entries]);

  const add = (amountMl: number) => {
    if (!Number.isFinite(amountMl) || amountMl <= 0) return;
    addWaterEntry({ date: parseLocalDateInput(formatLocalDateInput(date)) || date, amountMl });
    setCustomAmount('');
  };

  return (
    <section className="section-surface p-4 sm:p-5" aria-labelledby="health-hydration-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Droplets className="size-4 text-sky-500" aria-hidden="true" />
            <h2 id="health-hydration-title" className="text-section-title">Hydration</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        </div>
        <button type="button" onClick={onSetTarget} className="min-h-11 rounded-xl border border-border/70 px-3 text-xs font-bold hover:bg-muted">
          {target ? `Target ${Math.round(target).toLocaleString()} ml · Edit` : 'Set a target'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className="text-3xl font-black tabular-nums">{Math.round(totalMl).toLocaleString()}</strong>
        <span className="text-sm text-muted-foreground">ml logged</span>
        {target ? <span className="text-sm text-muted-foreground">of {Math.round(target).toLocaleString()} ml · {Math.min(100, Math.round(totalMl / target * 100))}%</span> : null}
      </div>
      {target ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Hydration target progress" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(target, totalMl)}><div className="h-full rounded-full bg-sky-500 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.min(100, totalMl / target * 100)}%` }} /></div> : <p className="mt-2 text-xs text-muted-foreground">Set your own target to see daily progress.</p>}

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Quick add water">
        {QUICK_AMOUNTS_ML.map(amount => <button key={amount} type="button" onClick={() => add(amount)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-sm font-bold hover:bg-muted"><Plus className="size-3.5" aria-hidden="true" />{amount} ml</button>)}
        <form className="flex min-h-11 gap-2" onSubmit={event => { event.preventDefault(); add(Number(customAmount)); }}>
          <label className="sr-only" htmlFor="health-water-custom">Custom water amount in milliliters</label>
          <input id="health-water-custom" type="number" min="1" step="1" inputMode="numeric" value={customAmount} onChange={event => setCustomAmount(event.target.value)} placeholder="Custom ml" className="w-28 rounded-xl border border-border/70 bg-background px-3 text-sm" />
          <button type="submit" disabled={!customAmount || Number(customAmount) <= 0} className="min-h-11 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-45">Add</button>
        </form>
      </div>

      {todayEntries.length ? <ul className="mt-4 divide-y divide-border/50 border-y border-border/50">
        {todayEntries.map(entry => <li key={entry.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-sm"><span>{entry.amountMl.toLocaleString()} ml <span className="text-xs text-muted-foreground">· {entry.createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></span><button type="button" onClick={() => deleteWaterEntry(entry.id)} className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${entry.amountMl} milliliters water entry`}><Trash2 className="size-4" /></button></li>)}
      </ul> : null}

      <HealthDetails title="Recent days" className="mt-5">
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {recentDays.map(day => <div key={day.key} className={`p-2 text-center ${day.key === dateKey ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><span className="block text-xs">{day.day.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong className="mt-1 block text-xs tabular-nums">{day.amount ? `${Math.round(day.amount / 100) / 10} L` : '—'}</strong></div>)}
        </div>
      </HealthDetails>
    </section>
  );
}
