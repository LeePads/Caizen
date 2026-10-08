'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppContext } from '@/lib/context';
import { openTaxonomyHub } from '@/components/common/taxonomy-hub-events';
import {
  cleanStorageLocation,
  composeInventoryStorageLocations,
  createManagedStorageLocation,
  INVENTORY_STORAGE_LOCATION_MODULE,
  normalizeManagedStorageLocations,
  normalizeStorageLocation,
  renameInventoryStorageLocationValues,
  storageLocationUsageCount,
} from '@/lib/inventory-storage-locations';
import type { ModuleTaxonomyCategory } from '@/lib/types';

type LocationView = 'active' | 'archived';

export function InventoryStorageLocationSettingsButton({
  onLocationRenamed,
  embedded = false,
  onDraftChange,
}: {
  onLocationRenamed?: (from: string, to: string) => void;
  embedded?: boolean;
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const { profiles, currentProfileId, updateProfile } = useAppContext();
  const profile = profiles.find(item => item.id === currentProfileId);
  const inventoryItems = profile?.inventoryItems || [];
  const idPrefix = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<LocationView>('active');
  const [query, setQuery] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const [editingLocation, setEditingLocation] = useState('');
  const [editingDraft, setEditingDraft] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const hasDraft = Boolean(locationDraft || (editingLocation && editingDraft !== editingLocation));
  useEffect(() => { onDraftChange?.(hasDraft); }, [hasDraft, onDraftChange]);

  const fieldIds = {
    search: `${idPrefix}-search-locations`,
    newLocation: `${idPrefix}-new-location`,
  };

  const locations = useMemo(
    () => composeInventoryStorageLocations(
      profile?.moduleTaxonomies?.[INVENTORY_STORAGE_LOCATION_MODULE],
      inventoryItems,
    ),
    [inventoryItems, profile?.moduleTaxonomies],
  );
  const activeLocations = locations.filter(location => !location.archived);
  const archivedLocations = locations.filter(location => location.archived);
  const visibleLocations = useMemo(() => {
    const source = view === 'active' ? activeLocations : archivedLocations;
    const term = normalizeStorageLocation(query);
    if (!term) return source;
    return source.filter(location => normalizeStorageLocation(location.name).includes(term));
  }, [activeLocations, archivedLocations, query, view]);
  const canReorder = query.trim().length === 0 && view === 'active' && archivedLocations.length === 0;

  useEffect(() => {
    if (embedded) searchRef.current?.focus({ preventScroll: true });
  }, [embedded]);

  const resetEditor = () => {
    setEditingLocation('');
    setEditingDraft('');
    setError('');
  };

  const persistLocations = (
    nextLocations: ModuleTaxonomyCategory[],
    nextInventoryItems?: typeof inventoryItems,
  ) => {
    if (!profile) return;
    updateProfile(profile.id, {
      moduleTaxonomies: {
        ...(profile.moduleTaxonomies || {}),
        [INVENTORY_STORAGE_LOCATION_MODULE]: normalizeManagedStorageLocations(nextLocations),
      },
      ...(nextInventoryItems ? { inventoryItems: nextInventoryItems } : {}),
    });
  };

  const announceSaved = () => setStatusMessage('Changes applied.');

  const addLocation = () => {
    const name = cleanStorageLocation(locationDraft);
    if (!name) {
      setError('Enter a location name.');
      return;
    }
    if (locations.some(location => normalizeStorageLocation(location.name) === normalizeStorageLocation(name))) {
      setError('That location already exists.');
      return;
    }

    persistLocations([...locations, createManagedStorageLocation(name)]);
    setLocationDraft('');
    setError('');
    setView('active');
    announceSaved();
  };

  const startRename = (location: ModuleTaxonomyCategory) => {
    setEditingLocation(location.name);
    setEditingDraft(location.name);
    setError('');
  };

  const cancelRename = () => {
    resetEditor();
  };

  const saveRename = () => {
    const current = locations.find(location => location.name === editingLocation);
    const nextName = cleanStorageLocation(editingDraft);
    if (!current) return;
    if (!nextName) {
      setError('Location name cannot be empty.');
      return;
    }
    if (locations.some(location =>
      location.name !== current.name &&
      normalizeStorageLocation(location.name) === normalizeStorageLocation(nextName),
    )) {
      setError('That location name is already in use.');
      return;
    }

    const nextLocations = locations.map(location =>
      location.name === current.name ? { ...location, name: nextName } : location,
    );
    const nextInventoryItems = renameInventoryStorageLocationValues(
      inventoryItems,
      current.name,
      nextName,
    );
    persistLocations(nextLocations, nextInventoryItems);
    onLocationRenamed?.(current.name, nextName);
    resetEditor();
    announceSaved();
  };

  const archiveLocation = (name: string, archived: boolean) => {
    persistLocations(locations.map(location =>
      location.name === name ? { ...location, archived } : location,
    ));
    setError('');
    announceSaved();
  };

  const moveLocation = (name: string, direction: -1 | 1) => {
    if (!canReorder) return;
    const next = [...locations];
    const index = next.findIndex(location => location.name === name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persistLocations(next);
    announceSaved();
  };

  const requestDelete = (name: string) => {
    const uses = storageLocationUsageCount(inventoryItems, name);
    if (uses > 0) {
      setError(
        `${uses} inventory item${uses === 1 ? '' : 's'} use this location. Move them before deleting.`,
      );
      return;
    }
    setError('');
    setDeleteTarget(name);
  };

  const confirmDelete = () => {
    const name = deleteTarget;
    setDeleteTarget('');
    if (!name) return;
    persistLocations(locations.filter(location => location.name !== name));
    if (editingLocation === name) resetEditor();
    announceSaved();
  };

  const editorContent = (
    <>
      <header className="space-y-2 px-4 pt-4 text-left sm:px-6 sm:pt-5">
            <h2 className="text-section-title">Inventory storage locations</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Use Add or Save to apply typed values; applied changes save automatically.
            </p>
            <p className="text-sm text-muted-foreground">
              Renaming updates matching Inventory items. Archiving keeps their existing locations.
            </p>
            {statusMessage ? (
              <p className="mt-2 text-xs font-semibold text-primary" role="status" aria-live="polite">
                {statusMessage}
              </p>
            ) : null}
      </header>

          <div className="p-4 sm:p-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <label htmlFor={fieldIds.search} className="sr-only">Search locations</label>
              <input
                ref={searchRef}
                id={fieldIds.search}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search locations"
                className="control-input h-11 w-full pl-10"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 rounded-xl border border-border/60 bg-background/60 p-1">
              <button
                type="button"
                onClick={() => setView('active')}
                aria-pressed={view === 'active'}
                className={`min-h-11 rounded-lg px-3 py-2 text-xs font-black transition ${view === 'active' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Active · {activeLocations.length}
              </button>
              <button
                type="button"
                onClick={() => setView('archived')}
                aria-pressed={view === 'archived'}
                className={`min-h-11 rounded-lg px-3 py-2 text-xs font-black transition ${view === 'archived' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Archived · {archivedLocations.length}
              </button>
            </div>

            {view === 'active' ? (
              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3">
                <label htmlFor={fieldIds.newLocation} className="text-label text-label-eyebrow text-primary">
                  New location
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id={fieldIds.newLocation}
                    value={locationDraft}
                    onChange={event => setLocationDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') addLocation();
                    }}
                    placeholder="Location name"
                    className="control-input h-11 min-w-0 flex-1"
                  />
                  <Button type="button" size="icon" onClick={addLocation} className="size-11 shrink-0 rounded-xl" aria-label="Add location">
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            {!canReorder && locations.length > 0 ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Reordering is available only when no locations are hidden.
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              {visibleLocations.map(location => {
                const globalIndex = locations.findIndex(item => item.name === location.name);
                const isEditing = editingLocation === location.name;

                return (
                  <div key={location.id} className="rounded-xl border border-border/60 bg-card/45 p-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={editingDraft}
                          onChange={event => setEditingDraft(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') saveRename();
                            if (event.key === 'Escape') cancelRename();
                          }}
                          aria-label={`Rename ${location.name}`}
                          className="control-input h-11 min-w-0 flex-1"
                        />
                        <button type="button" onClick={saveRename} className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Save ${location.name}`}>
                          <Check className="size-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={cancelRename} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Cancel editing ${location.name}`}>
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startRename(location)}
                          aria-label={`Rename ${location.name}`}
                          className="min-h-11 min-w-0 flex-1 rounded-lg px-2 py-2 text-left font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span className="block break-words text-sm leading-5">{location.name}</span>
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`More actions for ${location.name}`}
                              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={() => startRename(location)} className="min-h-11">
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canReorder || globalIndex <= 0} onSelect={() => moveLocation(location.name, -1)} className="min-h-11">
                              <ArrowUp className="size-4" aria-hidden="true" />
                              Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canReorder || globalIndex === locations.length - 1} onSelect={() => moveLocation(location.name, 1)} className="min-h-11">
                              <ArrowDown className="size-4" aria-hidden="true" />
                              Move down
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => archiveLocation(location.name, !location.archived)} className="min-h-11">
                              {location.archived ? <RotateCcw className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                              {location.archived ? 'Restore' : 'Archive'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => requestDelete(location.name)} variant="destructive" className="min-h-11">
                              <Trash2 className="size-4" aria-hidden="true" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleLocations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  <p>{query.trim() ? 'No matching locations.' : 'No locations yet.'}</p>
                  {query.trim() ? (
                    <button type="button" onClick={() => setQuery('')} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border/60 px-3 font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      Clear search
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {error}
              </p>
            ) : null}
          </div>

    </>
  );

  return (
    <>
      {embedded ? (
        <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Inventory storage locations">
          {editorContent}
        </section>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => openTaxonomyHub({ area: 'inventory', panel: 'locations' })}
          className="min-h-11 shrink-0 rounded-xl px-3"
          aria-label="Manage Inventory storage locations"
        >
          <Settings2 className="mr-2 size-4" aria-hidden="true" />
          Manage locations
        </Button>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete storage location"
        message={`Delete “${deleteTarget}”? This location has no Inventory items using it.`}
        confirmText="Delete location"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget('')}
      />
    </>
  );
}
