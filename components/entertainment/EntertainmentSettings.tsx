'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import type { CatalogMediaType, DiscoverSectionKey } from '@/lib/entertainment/types';
import type { EntertainmentPreferences } from '@/lib/entertainment/preferences';
import {
  DEFAULT_ENTERTAINMENT_PREFERENCES,
  normalizeEntertainmentPreferences,
} from '@/lib/entertainment/preferences';
import { getDiscoverSectionOptions } from '@/lib/entertainment/catalog';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { isAndroid } from '@/lib/platform';

function Toggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/55 bg-background/35 px-4 py-3 text-left transition hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block text-sm font-black">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export default function EntertainmentSettings({
  isOpen,
  mediaType,
  preferences,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  mediaType: CatalogMediaType;
  preferences: EntertainmentPreferences;
  onSave: (preferences: EntertainmentPreferences) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const androidPresentation = isAndroid();
  const panelRef = useRef<HTMLElement | null>(null);
  const sectionOptions = useMemo(() => getDiscoverSectionOptions(mediaType), [mediaType]);

  useEffect(() => {
    if (isOpen) {
      setDraft(normalizeEntertainmentPreferences(preferences));
      setConfirmDiscard(false);
    }
  }, [isOpen, preferences]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(normalizeEntertainmentPreferences(preferences));
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  const requestClose = () => {
    if (androidPresentation && hasChanges) setConfirmDiscard(true);
    else close();
  };
  useOverlayLifecycle(isOpen, requestClose, { containerRef: panelRef });

  if (!isOpen) return null;

  const visible = new Set(draft.visibleSections[mediaType] || []);
  const setSectionVisible = (key: DiscoverSectionKey, enabled: boolean) => {
    const next = new Set(draft.visibleSections[mediaType] || []);
    if (enabled) next.add(key);
    else next.delete(key);
    setDraft(current => ({
      ...current,
      visibleSections: {
        ...current.visibleSections,
        [mediaType]: Array.from(next),
      },
    }));
  };

  const settingsContent = (
    <><div className={`entertainment-settings-root fixed inset-0 z-[10030] flex justify-center ${androidPresentation ? 'items-center p-3' : 'items-end sm:items-center sm:p-5'}`} data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <button
        type="button"
        aria-label="Close entertainment settings"
        onClick={requestClose}
        className="motion-modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entertainment-settings-title"
        aria-describedby="entertainment-settings-description"
        data-caizen-overlay-panel="true"
        className="entertainment-settings-panel relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
          <div>
            <h2 id="entertainment-settings-title" className="flex items-center gap-2 text-xl font-black">
              <Settings2 className="h-5 w-5" /> Discover Settings
            </h2>
            <p id="entertainment-settings-description" className="sr-only">Choose how Entertainment Discover loads, filters, and presents catalog titles.</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close entertainment settings"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
          <section>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Catalog behavior</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={draft.autoLoadDiscover}
                label="Automatically load Discover"
                description="Fetch catalog rows when the Discover tab opens."
                onChange={value => setDraft(current => ({ ...current, autoLoadDiscover: value }))}
              />
              <Toggle
                checked={draft.backgroundCatalogRefresh}
                label="Refresh stale rows"
                description="Show cached titles immediately, then refresh old data."
                onChange={value => setDraft(current => ({ ...current, backgroundCatalogRefresh: value }))}
              />
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Refresh interval
                <AndroidAdaptiveSelect
                  id="entertainment-settings-refresh-interval"
                  label="Refresh interval"
                  value={String(draft.catalogRefreshHours)}
                  onChange={value => setDraft(current => ({
                    ...current,
                    catalogRefreshHours: Number(value),
                  }))}
                  options={[
                    { value: '3', label: 'Every 3 hours' },
                    { value: '6', label: 'Every 6 hours' },
                    { value: '12', label: 'Every 12 hours' },
                    { value: '24', label: 'Every day' },
                  ]}
                  className="control-input mt-2"
                />
              </label>

              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Default catalog
                <AndroidAdaptiveSelect
                  id="entertainment-settings-default-catalog"
                  label="Default catalog"
                  value={draft.defaultCatalogType}
                  onChange={value => setDraft(current => ({
                    ...current,
                    defaultCatalogType: value as CatalogMediaType,
                  }))}
                  options={[
                    { value: 'anime', label: 'Anime' },
                    { value: 'manga', label: 'Manga' },
                    { value: 'series', label: 'Series' },
                    { value: 'movie', label: 'Movies' },
                  ]}
                  className="control-input mt-2"
                />
              </label>

              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Filter controls
                <AndroidAdaptiveSelect
                  id="entertainment-settings-filter-visibility"
                  label="Filter controls"
                  value={draft.filterVisibility}
                  onChange={value => setDraft(current => ({
                    ...current,
                    filterVisibility: value as EntertainmentPreferences['filterVisibility'],
                  }))}
                  options={[
                    { value: 'collapsed', label: 'Collapsed' },
                    { value: 'visible', label: 'Always visible' },
                    { value: 'minimal', label: 'Minimal' },
                    { value: 'hidden', label: 'Hidden' },
                  ]}
                  className="control-input mt-2"
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Card display</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Preferred title
                <AndroidAdaptiveSelect
                  id="entertainment-settings-title-language"
                  label="Preferred title"
                  value={draft.titleLanguage}
                  onChange={value => setDraft(current => ({
                    ...current,
                    titleLanguage: value as EntertainmentPreferences['titleLanguage'],
                  }))}
                  options={[
                    { value: 'english', label: 'English' },
                    { value: 'romaji', label: 'Romaji' },
                    { value: 'native', label: 'Native' },
                  ]}
                  className="control-input mt-2"
                />
              </label>

              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Card size
                <AndroidAdaptiveSelect
                  id="entertainment-settings-card-density"
                  label="Card size"
                  value={draft.cardDensity}
                  onChange={value => setDraft(current => ({
                    ...current,
                    cardDensity: value as EntertainmentPreferences['cardDensity'],
                  }))}
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'large', label: 'Large' },
                  ]}
                  className="control-input mt-2"
                />
              </label>

              <div className="flex items-end">
                <Toggle
                  checked={draft.dataSaver}
                  label="Data Saver"
                  description="Fewer cards and no large featured backdrop."
                  onChange={value => setDraft(current => ({ ...current, dataSaver: value }))}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle checked={draft.showScores} label="Show ratings" onChange={value => setDraft(current => ({ ...current, showScores: value }))} />
              <Toggle checked={draft.showGenres} label="Show genres" onChange={value => setDraft(current => ({ ...current, showGenres: value }))} />
              <Toggle checked={draft.showReleaseStatus} label="Show release status" onChange={value => setDraft(current => ({ ...current, showReleaseStatus: value }))} />
              <Toggle checked={draft.showEpisodeCounts} label="Show episode counts" onChange={value => setDraft(current => ({ ...current, showEpisodeCounts: value }))} />
              <Toggle checked={draft.showAiringCountdown} label="Show airing dates" onChange={value => setDraft(current => ({ ...current, showAiringCountdown: value }))} />
              <Toggle checked={draft.showPopularity} label="Show popularity numbers" onChange={value => setDraft(current => ({ ...current, showPopularity: value }))} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Library awareness</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={draft.markLibraryTitles}
                label="Mark titles already in your library"
                onChange={value => setDraft(current => ({ ...current, markLibraryTitles: value }))}
              />
              <Toggle
                checked={draft.hideLibraryTitles}
                label="Hide library titles from Discover"
                onChange={value => setDraft(current => ({ ...current, hideLibraryTitles: value }))}
              />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Visible {mediaType === 'movie' ? 'movie' : mediaType} rows
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sectionOptions.map(option => {
                const checked = visible.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSectionVisible(option.key, !checked)}
                    aria-pressed={checked}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      checked
                        ? 'border-primary/30 bg-primary/8'
                        : 'border-border/55 bg-background/30 opacity-65'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                      {checked ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span>
                      <span className="block text-sm font-black">{option.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-border/60 bg-card/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-6 sm:pb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(DEFAULT_ENTERTAINMENT_PREFERENCES)}
            className="min-h-11 rounded-xl"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Defaults
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={requestClose} className="min-h-11 flex-1 rounded-xl sm:flex-none">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(normalizeEntertainmentPreferences(draft));
                close();
              }}
              className="min-h-11 flex-1 rounded-xl sm:flex-none"
            >
              Save Settings
            </Button>
          </div>
        </footer>
      </section>
    </div>
    <ConfirmDialog isOpen={confirmDiscard} title="Discard Discover settings changes?" message="Your unsaved Discover settings will be lost." confirmText="Discard changes" cancelText="Keep editing" isDangerous={false} onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); close(); }} />
    </>
  );

  return androidPresentation ? createPortal(settingsContent, document.body) : settingsContent;
}
