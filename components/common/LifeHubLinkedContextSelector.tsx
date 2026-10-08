'use client';

import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Checkbox } from '@/components/ui/checkbox';
import type { BookItem, Game, LifeHubLinkedContext, MediaItem, SkincareProduct, Supplement, TrashItem, UpcomingMoneyItem, WorkItem, WorkoutPlan, WorkoutRoutine } from '@/lib/types';
import {
  balanceTargetStateLabel,
  isUpcomingMoneyEligibleForNewLink,
  resolveUpcomingMoneyTarget,
} from '@/lib/balance/lifehub-activity';
import { isSupplementExpired } from '@/lib/supplements/lifehub-activity';
import {
  isWorkItemEligibleForNewLink,
  resolveWorkTarget,
  workTargetStateLabel,
} from '@/lib/work/lifehub-activity';
import { isHealthTargetEligibleForNewLink, resolveHealthTarget, healthTargetStateLabel } from '@/lib/health/lifehub-activity';
import { getSkincareProductIdsFromLinkedContext, getSupplementIdsFromLinkedContext } from '@/lib/lifehub/linked-context';
import { useEffect, useRef, useState } from 'react';

type Props = {
  value?: LifeHubLinkedContext;
  games: Game[];
  mediaItems?: MediaItem[];
  books?: BookItem[];
  supplements: Supplement[];
  skincareProducts: SkincareProduct[];
  workItems: WorkItem[];
  upcomingMoneyItems?: UpcomingMoneyItem[];
  workoutPlans?: WorkoutPlan[];
  workoutRoutines?: WorkoutRoutine[];
  trashItems?: TrashItem[];
  onChange: (value: LifeHubLinkedContext | undefined) => void;
  compact?: boolean;
  allowMultiple?: boolean;
};

export default function LifeHubLinkedContextSelector({
  value,
  games,
  mediaItems = [],
  books = [],
  supplements,
  skincareProducts,
  workItems,
  upcomingMoneyItems = [],
  workoutPlans = [],
  workoutRoutines = [],
  trashItems = [],
  onChange,
  compact = false,
  allowMultiple = false,
}: Props) {
  const valueSection = value?.section === 'games' || value?.section === 'entertainment' || value?.section === 'supplements' || value?.section === 'skincare' || value?.section === 'work' || value?.section === 'health' || value?.section === 'balance' || value?.section === 'journal' ? value.section : '';
  const [section, setSection] = useState<'' | 'games' | 'entertainment' | 'supplements' | 'skincare' | 'work' | 'health' | 'balance' | 'journal'>(valueSection);
  const manualSectionChange = useRef(false);
  useEffect(() => {
    if (manualSectionChange.current) {
      manualSectionChange.current = false;
      return;
    }
    setSection(valueSection);
  }, [valueSection]);
  const entityId = value && 'entityId' in value ? value.entityId : '';
  const valueEntertainmentType = value?.section === 'entertainment' ? value.type : 'media-item';
  const [entertainmentType, setEntertainmentType] = useState<'media-item' | 'book'>(valueEntertainmentType);
  useEffect(() => setEntertainmentType(valueEntertainmentType), [valueEntertainmentType]);
  const selectedSupplementIds = value?.section === 'supplements' ? getSupplementIdsFromLinkedContext(value) : [];
  const selectedSkincareIds = value?.section === 'skincare' ? getSkincareProductIdsFromLinkedContext(value) : [];
  const selectableGames = games.filter(game => !game.hidden || (section === 'games' && game.id === entityId));
  const selectableSupplements = supplements.filter(supplement => !isSupplementExpired(supplement) || (section === 'supplements' && selectedSupplementIds.includes(supplement.id)));
  const selectableSkincareProducts = skincareProducts.filter(product => product.status !== 'emptied' || (section === 'skincare' && selectedSkincareIds.includes(product.id)));
  const selectedWorkTarget = section === 'work' && value?.section === 'work'
    ? resolveWorkTarget(entityId, workItems, trashItems)
    : undefined;
  const valueHealthTargetType = value?.section === 'health' && (value.type === 'workout-plan' || value.type === 'workout-routine')
    ? value.type
    : 'workout-plan';
  const [healthTargetType, setHealthTargetType] = useState<'workout-plan' | 'workout-routine'>(valueHealthTargetType);
  useEffect(() => {
    setHealthTargetType(valueHealthTargetType);
  }, [valueHealthTargetType]);
  const selectableWorkoutPlans = workoutPlans.filter(plan =>
    isHealthTargetEligibleForNewLink(plan) || (section === 'health' && healthTargetType === 'workout-plan' && plan.id === entityId),
  );
  const selectableWorkoutRoutines = workoutRoutines.filter(routine =>
    routine.source === 'custom' && (isHealthTargetEligibleForNewLink(routine) || (section === 'health' && healthTargetType === 'workout-routine' && routine.id === entityId)),
  );
  const selectedHealthTarget = section === 'health' && value?.section === 'health'
    ? resolveHealthTarget(value.type, entityId, workoutPlans, workoutRoutines)
    : undefined;
  const selectableWorkItems = workItems.filter(item =>
    isWorkItemEligibleForNewLink(item, workItems) ||
    (item.id === entityId && (item.type === 'project' || item.type === 'task')),
  );
  const workOptions = [
    { value: '', label: 'No linked Work target' },
    ...selectableWorkItems.map(item => ({
      value: item.id,
      label: `${item.type === 'project' ? 'Project' : 'Work task'} · ${item.title}${item.id === entityId && item.status !== 'active' ? ` · ${workTargetStateLabel(item.status === 'done' ? 'completed' : item.status === 'archived' ? 'archived' : 'active')}` : ''}`,
    })),
    ...(selectedWorkTarget?.state === 'in-trash' && !selectableWorkItems.some(item => item.id === selectedWorkTarget.id)
      ? [{
          value: selectedWorkTarget.id,
          label: `${selectedWorkTarget.type === 'project' ? 'Project' : 'Work task'} · ${selectedWorkTarget.title} · In Trash`,
        }]
      : []),
  ];
  const selectedSupplement = section === 'supplements' ? supplements.find(supplement => supplement.id === entityId) : undefined;
  const selectedSkincareProduct = section === 'skincare' ? skincareProducts.find(product => product.id === entityId) : undefined;
  const selectableUpcomingMoneyItems = upcomingMoneyItems.filter(item =>
    isUpcomingMoneyEligibleForNewLink(item) || (section === 'balance' && item.id === entityId),
  );
  const selectedUpcomingMoneyTarget = section === 'balance'
    ? resolveUpcomingMoneyTarget(entityId, upcomingMoneyItems)
    : undefined;
  const balanceOptions = [
    { value: '', label: 'No linked Upcoming Money item' },
    ...selectableUpcomingMoneyItems.map(item => {
      const target = resolveUpcomingMoneyTarget(item.id, upcomingMoneyItems);
      return {
        value: item.id,
        label: `${item.title}${target && !isUpcomingMoneyEligibleForNewLink(item) ? ` · ${balanceTargetStateLabel(target)}` : ''}`,
      };
    }),
  ];
  const entertainmentTrash = trashItems.find(item =>
    item.itemId === entityId &&
    (entertainmentType === 'book' ? item.source === 'books' : item.source === 'mediaItems'),
  );
  const entertainmentTrashData = entertainmentTrash?.data as { title?: unknown } | undefined;
  const entertainmentMediaOptions = [
    { value: '', label: 'No linked media item' },
    ...mediaItems.map(item => ({ value: item.id, label: `${item.title}${item.status === 'completed' ? ' · Completed' : ''}` })),
    ...(entertainmentType === 'media-item' && entityId && !mediaItems.some(item => item.id === entityId)
      ? [{ value: entityId, label: `${typeof entertainmentTrashData?.title === 'string' ? entertainmentTrashData.title : 'Media item'} · ${entertainmentTrash ? 'In Trash' : 'Unavailable'}` }]
      : []),
  ];
  const entertainmentBookOptions = [
    { value: '', label: 'No linked book' },
    ...books.map(item => ({ value: item.id, label: `${item.title}${item.status === 'completed' ? ' · Completed' : ''}` })),
    ...(entertainmentType === 'book' && entityId && !books.some(item => item.id === entityId)
      ? [{ value: entityId, label: `${typeof entertainmentTrashData?.title === 'string' ? entertainmentTrashData.title : 'Book'} · ${entertainmentTrash ? 'In Trash' : 'Unavailable'}` }]
      : []),
  ];

  return (
    <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
      <div>
        <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Linked section</label>
        <AndroidAdaptiveSelect
          label="Linked section"
          value={section}
          onChange={nextSection => {
            const next = nextSection === 'games' || nextSection === 'entertainment' || nextSection === 'supplements' || nextSection === 'skincare' || nextSection === 'work' || nextSection === 'health' || nextSection === 'balance' || nextSection === 'journal' ? nextSection : '';
            manualSectionChange.current = true;
            setSection(next);
            if (next === 'health') setHealthTargetType('workout-plan');
            onChange(next === 'journal' ? { section: 'journal', type: 'journal-entry' } : undefined);
          }}
          className="control-input"
          options={[
            { value: '', label: 'No linked context' },
            { value: 'games', label: 'Games' },
            { value: 'entertainment', label: 'Media and Books' },
            { value: 'supplements', label: 'Supplements' },
            { value: 'skincare', label: 'Skincare' },
            { value: 'work', label: 'Work' },
            { value: 'health', label: 'Health' },
            { value: 'balance', label: 'Money' },
            { value: 'journal', label: 'Journal' },
          ]}
        />
      </div>

      {section === 'journal' ? (
        <div className="flex min-h-11 items-center rounded-xl border border-border/60 bg-background/45 px-3 text-xs font-semibold text-muted-foreground">
          A meaningful entry for the routine date completes this routine automatically.
        </div>
      ) : null}

      {section === 'games' ? (
        <div>
          <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Game</label>
          <AndroidAdaptiveSelect
            label="Game"
            value={entityId}
            onChange={nextId => onChange(nextId ? { section: 'games', type: 'game', entityId: nextId } : undefined)}
            className="control-input"
            searchable={selectableGames.length > 8}
            options={[
              { value: '', label: 'No linked game' },
              ...selectableGames.map(game => ({
                value: game.id,
                label: `${game.title}${game.hidden ? ' · Archived' : ''}`,
              })),
            ]}
          />
          {value?.section === 'games' && value.entityId && !selectableGames.some(game => game.id === value.entityId) ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This game is archived. It remains linked, but is not offered for new links.</p>
          ) : null}
        </div>
      ) : null}

      {section === 'entertainment' ? (
        <>
          <div>
            <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Entertainment target type</label>
            <AndroidAdaptiveSelect
              label="Entertainment target type"
              value={entertainmentType}
              onChange={next => {
                if (next !== 'media-item' && next !== 'book') return;
                setEntertainmentType(next);
                onChange(undefined);
              }}
              className="control-input"
              options={[{ value: 'media-item', label: 'Media item' }, { value: 'book', label: 'Book' }]}
            />
          </div>
          <div>
            <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">{entertainmentType === 'book' ? 'Book' : 'Media item'}</label>
            <AndroidAdaptiveSelect
              label={entertainmentType === 'book' ? 'Book' : 'Media item'}
              value={entityId}
              onChange={nextId => onChange(nextId ? { section: 'entertainment', type: entertainmentType, entityId: nextId } : undefined)}
              className="control-input"
              searchable={(entertainmentType === 'book' ? books.length : mediaItems.length) > 8}
              options={entertainmentType === 'book' ? entertainmentBookOptions : entertainmentMediaOptions}
            />
            {value?.section === 'entertainment' && value.entityId === entityId && entityId && !mediaItems.some(item => item.id === entityId) && !books.some(item => item.id === entityId) ? (
              <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This target is {entertainmentTrash ? 'in Trash and remains linked' : 'unavailable'}.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {section === 'supplements' ? (
        <div>
          <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Supplement</label>
          {allowMultiple ? (
            <MultiLinkPicker
              label="Supplement"
              values={selectedSupplementIds}
              options={selectableSupplements.map(supplement => ({ value: supplement.id, label: `${supplement.name}${isSupplementExpired(supplement) ? ' · Expired' : ''}`, disabled: isSupplementExpired(supplement) }))}
              unavailable={selectedSupplementIds.filter(id => !supplements.some(item => item.id === id))}
              onChange={ids => onChange(ids.length ? { section: 'supplements', type: 'supplement', entityId: ids[0], ...(ids.length > 1 ? { entityIds: ids } : {}) } : undefined)}
            />
          ) : <AndroidAdaptiveSelect
            label="Supplement"
            value={entityId}
            onChange={nextId => onChange(nextId ? { section: 'supplements', type: 'supplement', entityId: nextId } : undefined)}
            className="control-input"
            searchable={selectableSupplements.length > 8}
            options={[
              { value: '', label: 'No linked supplement' },
              ...selectableSupplements.map(supplement => ({
                value: supplement.id,
                label: `${supplement.name}${isSupplementExpired(supplement) ? ' · Expired' : ''}`,
              })),
            ]}
          />}
          {selectedSupplement && isSupplementExpired(selectedSupplement) ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This supplement is expired. It remains linked, but is not offered for new links.</p>
          ) : null}
        </div>
      ) : null}

      {section === 'skincare' ? (
        <div>
          <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Skincare product</label>
          {allowMultiple ? (
            <MultiLinkPicker
              label="Skincare product"
              values={selectedSkincareIds}
              options={selectableSkincareProducts.map(product => ({ value: product.id, label: `${product.name}${product.status === 'emptied' ? ' · Finished' : ''}`, disabled: product.status === 'emptied' }))}
              unavailable={selectedSkincareIds.filter(id => !skincareProducts.some(item => item.id === id))}
              onChange={ids => onChange(ids.length ? { section: 'skincare', type: 'product', entityId: ids[0], ...(ids.length > 1 ? { entityIds: ids } : {}) } : undefined)}
            />
          ) : <AndroidAdaptiveSelect
            label="Skincare product"
            value={entityId}
            onChange={nextId => onChange(nextId ? { section: 'skincare', type: 'product', entityId: nextId } : undefined)}
            className="control-input"
            searchable={selectableSkincareProducts.length > 8}
            options={[
              { value: '', label: 'No linked skincare product' },
              ...selectableSkincareProducts.map(product => ({
                value: product.id,
                label: `${product.name}${product.status === 'emptied' ? ' · Finished' : ''}`,
              })),
            ]}
          />}
          {selectedSkincareProduct?.status === 'emptied' ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This product is finished. It remains linked, but is not offered for new links.</p>
          ) : null}
        </div>
      ) : null}

      {section === 'work' ? (
        <div>
          <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Work target</label>
          <AndroidAdaptiveSelect
            label="Work target"
            value={entityId}
            onChange={nextId => onChange(nextId ? { section: 'work', type: 'work-item', entityId: nextId } : undefined)}
            className="control-input"
            searchable={workOptions.length > 8}
            options={workOptions}
          />
          {selectedWorkTarget?.state === 'completed' ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">This Work target is completed. It remains linked, but is not offered for new links.</p>
          ) : null}
          {selectedWorkTarget?.state === 'archived' ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">This Work target is archived. It remains linked, but is not offered for new links.</p>
          ) : null}
          {selectedWorkTarget?.state === 'in-trash' ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This Work target is in Trash. Restore it to use the existing link again, or unlink it here.</p>
          ) : null}
          {value?.section === 'work' && value.entityId && !selectedWorkTarget ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This Work target is unavailable. You can unlink it here.</p>
          ) : null}
        </div>
      ) : null}

      {section === 'health' ? (
        <>
          <div>
            <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Health target type</label>
            <AndroidAdaptiveSelect
              label="Health target type"
              value={healthTargetType}
            onChange={nextType => {
                if (nextType !== 'workout-plan' && nextType !== 'workout-routine') return;
                manualSectionChange.current = true;
                setHealthTargetType(nextType);
                onChange(undefined);
              }}
              className="control-input"
              options={[
                { value: 'workout-plan', label: 'Workout plan' },
                { value: 'workout-routine', label: 'Workout routine' },
              ]}
            />
          </div>
          <div>
            <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">
              {healthTargetType === 'workout-plan' ? 'Workout plan' : 'Workout routine'}
            </label>
            <AndroidAdaptiveSelect
              label={healthTargetType === 'workout-plan' ? 'Workout plan' : 'Workout routine'}
              value={entityId}
              onChange={nextId => onChange(nextId ? { section: 'health', type: healthTargetType, entityId: nextId } : undefined)}
              className="control-input"
              searchable={(healthTargetType === 'workout-plan' ? selectableWorkoutPlans : selectableWorkoutRoutines).length > 8}
              options={[
                { value: '', label: `No linked ${healthTargetType === 'workout-plan' ? 'workout plan' : 'workout routine'}` },
                ...(healthTargetType === 'workout-plan'
                  ? selectableWorkoutPlans.map(plan => ({
                      value: plan.id,
                      label: `${plan.name}${plan.id === entityId && plan.archived ? ` · ${healthTargetStateLabel('archived')}` : ''}`,
                    }))
                  : selectableWorkoutRoutines.map(routine => ({
                      value: routine.id,
                      label: `${routine.name}${routine.id === entityId && routine.archived ? ` · ${healthTargetStateLabel('archived')}` : ''}`,
                    }))),
              ]}
            />
            {selectedHealthTarget?.state === 'archived' ? (
              <p className="mt-1 text-xs font-semibold text-muted-foreground">This Health target is archived. It remains linked, but is not offered for new links.</p>
            ) : null}
            {value?.section === 'health' && value.entityId && !selectedHealthTarget ? (
              <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This Health target is unavailable. You can unlink it here.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {section === 'balance' ? (
        <div>
          <label className="text-label text-label-eyebrow mb-1.5 block text-muted-foreground">Upcoming Money item</label>
          <AndroidAdaptiveSelect
            label="Upcoming Money item"
            value={entityId}
            onChange={nextId => onChange(nextId ? { section: 'balance', type: 'upcoming-money', entityId: nextId } : undefined)}
            className="control-input"
            searchable={balanceOptions.length > 8}
            options={balanceOptions}
          />
          {selectedUpcomingMoneyTarget && !isUpcomingMoneyEligibleForNewLink(selectedUpcomingMoneyTarget.item) ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              This Balance item is {balanceTargetStateLabel(selectedUpcomingMoneyTarget).toLowerCase()}. It remains linked, but only active items are offered for new links.
            </p>
          ) : value?.section === 'balance' && value.entityId ? (
            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This Balance item is unavailable. You can unlink it here.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MultiLinkPicker({
  label,
  values,
  options,
  unavailable,
  onChange,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  unavailable: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter(option => !normalizedQuery || option.label.toLocaleLowerCase().includes(normalizedQuery));
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 p-2" aria-label={`${label} multi-select`}>
      <p className="px-2 py-1 text-xs font-semibold text-muted-foreground" aria-live="polite">{values.length} selected</p>
      {values.length ? <div className="flex flex-wrap gap-1.5 px-2 pb-2">{values.map(id => <button key={id} type="button" onClick={() => onChange(values.filter(value => value !== id))} className="min-h-8 rounded-full border border-primary/20 bg-primary/10 px-2 text-[11px] font-semibold text-primary" aria-label={`Remove ${options.find(option => option.value === id)?.label || id}`}>{options.find(option => option.value === id)?.label || `Unavailable · ${id}`} ×</button>)}</div> : null}
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${label.toLocaleLowerCase()}`} aria-label={`Search ${label}`} className="control-input mb-2 h-10 w-full" />
      <div className="max-h-52 overflow-y-auto">
        {filteredOptions.map(option => (
          <div key={option.value} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/40">
            <Checkbox
              checked={values.includes(option.value)}
              disabled={option.disabled}
              onCheckedChange={checked => onChange(checked ? [...new Set([...values, option.value])] : values.filter(value => value !== option.value))}
              aria-label={`${option.label}${option.disabled ? ' unavailable' : ''}`}
            />
            <span className={option.disabled ? 'text-muted-foreground' : ''}>{option.label}</span>
          </div>
        ))}
        {!filteredOptions.length && !unavailable.length ? <p className="px-2 py-3 text-xs text-muted-foreground">No matching {label.toLocaleLowerCase()}s.</p> : null}
        {unavailable.map(id => (
          <div key={id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-amber-700 dark:text-amber-300">
            <Checkbox checked disabled aria-label={`Unavailable ${id}`} />
            <span>Unavailable · {id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
