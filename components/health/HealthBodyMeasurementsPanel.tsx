'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { HealthDetails } from '@/components/health/HealthDetails';
import { useAppContext } from '@/lib/context';
import { cmToInches, readHealthMeasurementPreferences } from '@/lib/health/measurements';
import { formatLocalDateInput, parseLocalDateInput, toLocalDateKey } from '@/lib/date-utils';

const LENGTH_FIELDS = [
  ['waistCm', 'Waist'],
  ['chestCm', 'Chest'],
  ['hipsCm', 'Hips'],
  ['upperArmCm', 'Upper arm'],
  ['thighCm', 'Thigh'],
] as const;

export function HealthBodyMeasurementsPanel({ date }: { date: Date }) {
  const { health, currentProfileId, addBodyMeasurementEntry, deleteBodyMeasurementEntry } = useAppContext();
  const heightUnit = currentProfileId ? readHealthMeasurementPreferences(currentProfileId).heightUnit : 'cm';
  const dateKey = toLocalDateKey(date);
  const entries = health.bodyMeasurementEntries || [];
  const existing = useMemo(() => entries.find(entry => toLocalDateKey(entry.date) === dateKey), [dateKey, entries]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const toDisplay = (value?: number) => value === undefined ? '' : String(Number((heightUnit === 'cm' ? value : cmToInches(value)).toFixed(1)));
    setDraft({
      waistCm: toDisplay(existing?.waistCm),
      chestCm: toDisplay(existing?.chestCm),
      hipsCm: toDisplay(existing?.hipsCm),
      upperArmCm: toDisplay(existing?.upperArmCm),
      thighCm: toDisplay(existing?.thighCm),
      bodyFatPercent: existing?.bodyFatPercent === undefined ? '' : String(existing.bodyFatPercent),
    });
  }, [existing, heightUnit]);

  const history = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);
  const hasValue = Object.values(draft).some(value => value.trim() !== '');
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const toCm = (value: string) => {
      const parsed = Number(value);
      if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) return undefined;
      return Number((heightUnit === 'cm' ? parsed : parsed * 2.54).toFixed(1));
    };
    const bodyFat = Number(draft.bodyFatPercent);
    addBodyMeasurementEntry({
      date: parseLocalDateInput(formatLocalDateInput(date)) || date,
      waistCm: toCm(draft.waistCm || ''),
      chestCm: toCm(draft.chestCm || ''),
      hipsCm: toCm(draft.hipsCm || ''),
      upperArmCm: toCm(draft.upperArmCm || ''),
      thighCm: toCm(draft.thighCm || ''),
      bodyFatPercent: draft.bodyFatPercent.trim() && Number.isFinite(bodyFat) && bodyFat >= 0 && bodyFat <= 100 ? bodyFat : undefined,
    });
  };
  const unit = heightUnit === 'cm' ? 'cm' : 'in';

  return (
    <HealthDetails title="Body measurements" className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="mt-1 text-xs text-muted-foreground">Add only what you want to track. Lengths are saved in centimeters.</p>
        </div>
        <span className="text-xs text-muted-foreground">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <form onSubmit={save} className="mt-4 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LENGTH_FIELDS.map(([field, label]) => <label key={field} className="block space-y-1.5 text-xs font-semibold text-muted-foreground">{label} ({unit})<input type="number" min="0.1" step="0.1" inputMode="decimal" value={draft[field] || ''} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground" /></label>)}
        <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">Body fat (%)<input type="number" min="0" max="100" step="0.1" inputMode="decimal" value={draft.bodyFatPercent || ''} onChange={event => setDraft(current => ({ ...current, bodyFatPercent: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground" /></label>
        <div className="flex items-end"><button type="submit" disabled={!hasValue} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50 sm:w-auto">{existing ? 'Update check-in' : 'Save measurements'}</button></div>
      </form>
      {history.length ? <ul className="mt-5 divide-y divide-border/50 border-y border-border/50">
        {history.map(entry => {
          const values: string[] = [
            ['Waist', entry.waistCm], ['Chest', entry.chestCm], ['Hips', entry.hipsCm],
            ['Arm', entry.upperArmCm], ['Thigh', entry.thighCm],
          ].filter((item): item is [string, number] => item[1] !== undefined)
            .map(([label, value]) => `${label} ${heightUnit === 'cm' ? value : Number(cmToInches(value).toFixed(1))}${unit}`);
          if (entry.bodyFatPercent !== undefined) values.push(`Body fat ${entry.bodyFatPercent}%`);
          return <li key={entry.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-xs"><div className="min-w-0 break-words"><strong className="block text-foreground">{entry.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span className="text-muted-foreground">{values.join(' · ')}</span></div><button type="button" onClick={() => deleteBodyMeasurementEntry(entry.id)} aria-label={`Delete body measurements from ${entry.date.toLocaleDateString()}`} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button></li>;
        })}
      </ul> : null}
    </HealthDetails>
  );
}
