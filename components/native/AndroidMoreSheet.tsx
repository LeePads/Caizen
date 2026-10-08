'use client';

import { useMemo, useState, type ComponentType } from 'react';
import {
  Cloud,
  Palette,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

export interface MoreDestination {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** One-line "what's inside" summary, e.g. "Food · Sleep · Workouts". */
  summary?: string;
}

export interface MoreSystemAction {
  id: string;
  label: string;
  summary: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
}

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Money and items', ids: ['balance', 'inventory'] },
  { title: 'Personal and health', ids: ['health', 'skincare', 'lifehub', 'personalhub'] },
  { title: 'Work and media', ids: ['workhub', 'entertainment', 'music'] },
];

export function AndroidMoreSheet({
  destinations,
  activeTab,
  pinnedIds,
  onNavigate,
  onOpenSettings,
  onOpenSearch,
  onOpenProfiles,
  onOpenAppearance,
  onOpenPet,
  onOpenCloudBackup,
  onClose,
}: {
  destinations: MoreDestination[];
  activeTab: string;
  pinnedIds: string[];
  onNavigate: (id: string) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenProfiles: () => void;
  onOpenAppearance: () => void;
  onOpenPet: () => void;
  onOpenCloudBackup: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(destinations.map(entry => [entry.id, entry])), [destinations]);
  const pinned = useMemo(
    () => pinnedIds.map(id => byId.get(id)).filter((entry): entry is MoreDestination => Boolean(entry)),
    [pinnedIds, byId],
  );

  const grouped = useMemo(() => {
    const claimed = new Set(GROUPS.flatMap(group => group.ids));
    const groups = GROUPS.map(group => ({
      title: group.title,
      items: group.ids
        .map(id => byId.get(id))
        .filter((entry): entry is MoreDestination => Boolean(entry))
        .filter(entry => !pinnedIds.includes(entry.id)),
    })).filter(group => group.items.length > 0);

    const leftovers = destinations.filter(entry => !claimed.has(entry.id) && !pinnedIds.includes(entry.id));
    if (leftovers.length) groups.push({ title: 'Everything else', items: leftovers });
    return groups;
  }, [byId, destinations, pinnedIds]);

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => normalizedQuery
      ? destinations.filter(entry =>
        entry.label.toLowerCase().includes(normalizedQuery) ||
        entry.summary?.toLowerCase().includes(normalizedQuery),
      )
      : null,
    [normalizedQuery, destinations],
  );

  const systemActions: MoreSystemAction[] = [
    { id: 'cloud', label: 'Cloud & Backup', summary: 'Backup, restore, and cloud status', icon: Cloud, onSelect: onOpenCloudBackup },
    { id: 'settings', label: 'Settings', summary: 'App, data, and navigation', icon: Settings, onSelect: onOpenSettings },
    { id: 'search', label: 'Find', summary: 'Search and quick actions', icon: Search, onSelect: onOpenSearch },
    { id: 'profiles', label: 'Profiles', summary: 'Switch local workspaces', icon: ShieldCheck, onSelect: onOpenProfiles },
    { id: 'appearance', label: 'Appearance', summary: 'Theme, accent, and motion', icon: Palette, onSelect: onOpenAppearance },
    { id: 'pet', label: 'Pet companion', summary: 'A quiet companion for useful days', icon: Sparkles, onSelect: onOpenPet },
  ];

  return (
    <section className="cz-more">
      <header className="cz-more-header">
        <div className="cz-more-heading">
          <span className="cz-more-kicker">Navigation</span>
          <h3>More</h3>
          <p>Open every Caizen area and system tool.</p>
        </div>
        <button type="button" className="android-icon-button cz-more-close" onClick={onClose} aria-label="Close More">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="cz-more-search">
        <Search className="h-4 w-4" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search destinations" aria-label="Search destinations" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="h-4 w-4" /></button> : null}
      </div>

      <div className="cz-more-body">
        {searchResults ? (
          <MoreGroup title={`Results · ${searchResults.length}`} items={searchResults} activeTab={activeTab} pinnedIds={pinnedIds} onNavigate={onNavigate} />
        ) : (
          <>
            <section className="cz-more-group">
              <h4>Pinned to bottom bar</h4>
              {pinned.length === 0 ? (
                <p className="cz-more-empty">Nothing is pinned. Choose 3–5 destinations in Navigation settings.</p>
              ) : (
                <div className="cz-more-list">
                  {pinned.map(entry => <MoreRow key={entry.id} entry={entry} active={activeTab === entry.id} pinned onNavigate={onNavigate} />)}
                </div>
              )}
            </section>

            {grouped.map(group => (
              <MoreGroup key={group.title} title={group.title} items={group.items} activeTab={activeTab} pinnedIds={pinnedIds} onNavigate={onNavigate} />
            ))}

            <section className="cz-more-group">
              <h4>System</h4>
              <div className="cz-more-list">
                {systemActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <button key={action.id} type="button" className="cz-more-row cz-more-system-row" onClick={action.onSelect} aria-label={action.label}>
                      <span className="cz-more-row-icon"><Icon className="h-4 w-4" /></span>
                      <span className="cz-more-row-label">
                        <strong>{action.label}</strong>
                        <small>{action.summary}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  );
}

function MoreGroup({ title, items, activeTab, pinnedIds, onNavigate }: {
  title: string;
  items: MoreDestination[];
  activeTab: string;
  pinnedIds: string[];
  onNavigate: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="cz-more-group">
      <h4>{title}</h4>
      <div className="cz-more-list">
        {items.map(entry => <MoreRow key={entry.id} entry={entry} active={activeTab === entry.id} pinned={pinnedIds.includes(entry.id)} onNavigate={onNavigate} />)}
      </div>
    </section>
  );
}

function MoreRow({ entry, active, pinned, onNavigate }: {
  entry: MoreDestination;
  active: boolean;
  pinned: boolean;
  onNavigate: (id: string) => void;
}) {
  const Icon = entry.icon;
  return (
    <div className="cz-more-row-wrap">
      <button
        type="button"
        className="cz-more-row"
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate(entry.id)}
      >
        <span className="cz-more-row-icon"><Icon className="h-4 w-4" /></span>
        <span className="cz-more-row-label">
          <strong>{entry.label}</strong>
          {entry.summary ? <small>{entry.summary}</small> : null}
        </span>
        {pinned ? <Pin className="h-3.5 w-3.5 cz-more-row-pinned" aria-label="Pinned" /> : null}
        {active ? <span className="cz-more-row-current" aria-hidden="true">Current</span> : null}
      </button>
    </div>
  );
}
