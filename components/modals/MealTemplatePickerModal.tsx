'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Star, Utensils, X } from 'lucide-react';

import { isNutritionFieldMissing } from '@/lib/health/nutrition';
import type { FoodNutritionSnapshot, MealTemplate, MealType, NutritionField } from '@/lib/types';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { AndroidDismissibleBackdrop } from '@/components/native/android-design';

type TemplateSummary = Pick<FoodNutritionSnapshot, 'calories' | 'protein' | 'carbs' | 'fat'> & {
  nutritionMissing?: NutritionField[];
};

type Props = {
  isOpen: boolean;
  templates: MealTemplate[];
  favoriteTemplateIds?: string[];
  onToggleFavorite?: (id: string) => void;
  getSummary: (template: MealTemplate) => TemplateSummary;
  onSelect: (template: MealTemplate) => void;
  onClose: () => void;
  dateLabel?: string;
  androidPresentation?: boolean;
};

const mealTypes: Array<'all' | MealType> = [
  'all',
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

export default function MealTemplatePickerModal({
  isOpen,
  templates,
  favoriteTemplateIds = [],
  onToggleFavorite,
  getSummary,
  onSelect,
  onClose,
  dateLabel,
  androidPresentation = false,
}: Props) {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  useOverlayLifecycle(isOpen, close, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState<'all' | MealType>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setMealType('all');

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timeout = window.setTimeout(() => searchRef.current?.focus(), 60);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, isOpen]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return templates.filter(template => {
      const typeMatch = mealType === 'all' || template.mealType === mealType;
      const searchMatch = !term || `${template.name} ${template.mealType}`.toLowerCase().includes(term);
      return typeMatch && searchMatch;
    });
  }, [templates, query, mealType]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`meal-template-picker-root fixed inset-0 z-[9999] overflow-y-auto p-3 sm:p-6 ${androidPresentation ? 'android-meal-template-picker-root' : ''}`}
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      <AndroidDismissibleBackdrop
        onClose={close}
        ariaLabel="Close saved meal picker"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div className={`meal-template-picker-positioner flex min-h-full justify-center ${androidPresentation ? 'items-end' : 'items-center'}`}>
        <div
          ref={modalPanelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="meal-picker-title"
          data-caizen-overlay-panel="true"
          className={healthResponsive.dialog + " meal-template-picker-panel relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border/50 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Utensils className="h-5 w-5" />
              </span>
              <div>
                <h2 id="meal-picker-title" className="text-xl font-black">Add saved meal</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateLabel ? `Add every food in the meal to ${dateLabel}.` : 'Add every food in the meal to the selected food log.'}
                </p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close saved meal picker" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="border-b border-border/50 p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="h-11 w-full rounded-xl border border-border/60 bg-background pl-10 pr-3 text-sm outline-none focus:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0"
                placeholder="Search saved meals…"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {mealTypes.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition ${
                    mealType === type
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'all' ? 'All meals' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[62vh] overflow-y-auto p-4 sm:p-5">
            {!filtered.length ? (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                <p className="font-bold">No saved meals found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {templates.length ? 'Try another search or meal type.' : 'Create one under Food Library → Meals.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map(template => {
                  const summary = getSummary(template);
                  const summaryValue = (field: NutritionField, value: string | number, suffix = '') =>
                    isNutritionFieldMissing(summary, field) ? 'Not entered' : `${value}${suffix}`;
                  return (
                    <article key={template.id} className="rounded-xl border border-border/60 bg-background/45 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wide text-primary">{template.mealType}</p>
                          <h3 className="mt-1 truncate font-black">{template.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{template.rows.length} {template.rows.length === 1 ? 'food' : 'foods'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {onToggleFavorite ? <button type="button" onClick={() => onToggleFavorite(template.id)} aria-pressed={favoriteTemplateIds.includes(template.id)} aria-label={`${favoriteTemplateIds.includes(template.id) ? 'Remove' : 'Add'} ${template.name} ${favoriteTemplateIds.includes(template.id) ? 'from' : 'to'} favorites`} className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted"><Star className={`size-4 ${favoriteTemplateIds.includes(template.id) ? 'fill-current text-amber-500' : ''}`} aria-hidden="true" /></button> : null}
                          <button
                            type="button"
                            onClick={() => {
                              onSelect(template);
                              close();
                            }}
                            className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-muted/70 p-2.5">
                          <p className="text-xs font-bold uppercase text-muted-foreground">Calories</p>
                          <p className="mt-1 text-sm font-black">{summaryValue('calories', Math.round(summary.calories))}</p>
                        </div>
                        <div className="rounded-lg bg-muted/70 p-2.5">
                          <p className="text-xs font-bold uppercase text-muted-foreground">Protein</p>
                          <p className="mt-1 text-sm font-black">{summaryValue('protein', summary.protein.toFixed(1), 'g')}</p>
                        </div>
                      </div>

                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer py-1 font-semibold">More nutrition</summary>
                        <p className="pt-1">Carbs {summaryValue('carbs', summary.carbs.toFixed(1), 'g')} · Fat {summaryValue('fat', summary.fat.toFixed(1), 'g')}</p>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
