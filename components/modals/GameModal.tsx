'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Gamepad2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { Game, GameGenre, GamePlatform, GameStatus } from '@/lib/types';
import type { GameCustomMetric } from '@/lib/games/types';
import type { RawgGameResult } from '@/lib/games/rawg';
import { searchRawgGames } from '@/lib/games/rawg';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormPatterns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { createEntityId } from '@/lib/utils';
import { parseLocalDateInputOrUndefined, toLocalDateKey } from '@/lib/date-utils';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { catalogFields, exactRawgGameMatch, GAME_GENRES, gameGenreLabel, gamePlatformLabel, gameStatusLabel, possibleRawgGameMatch, providerGenre } from '@/lib/games/game-form';

const GAME_STATUSES: Array<{ value: Exclude<GameStatus, 'active'>; label: string }> = [
  { value: 'playing', label: 'Playing' }, { value: 'backlog', label: 'Backlog' }, { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' }, { value: 'dropped', label: 'Dropped' }, { value: 'wishlist', label: 'Wishlist' }, { value: 'upcoming', label: 'Upcoming' },
];

const PLATFORM_OPTIONS: Array<{ value: GamePlatform; label: string }> = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'console', label: 'Console' },
];

const GENRE_OPTIONS: Array<{ value: GameGenre; label: string }> = GAME_GENRES.map(value => ({
  value,
  label: gameGenreLabel(value),
}));

function dateInput(value?: Date | string) { return toLocalDateKey(value); }

export default function GameModal({ isOpen, onClose, gameId, catalogGame, initialStatus = 'backlog', initialTitle, onSaved, onOpenExistingGame }: { isOpen: boolean; onClose: () => void; gameId?: string | null; catalogGame?: RawgGameResult | null; initialStatus?: Exclude<GameStatus, 'active'>; initialTitle?: string; onSaved?: (id: string) => void; onOpenExistingGame?: (id: string) => void }) {
  const { games, addGame, updateGame } = useAppContext();
  const game = games.find(item => item.id === gameId);
  const editing = Boolean(gameId && game);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Exclude<GameStatus, 'active'>>('backlog');
  const [platform, setPlatform] = useState<GamePlatform>('pc');
  const [genre, setGenre] = useState<GameGenre>('rpg');
  const [website, setWebsite] = useState('');
  const [image, setImage] = useState('');
  const [notes, setNotes] = useState('');
  const [playingSince, setPlayingSince] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [rawgId, setRawgId] = useState('');
  const [providerPlatforms, setProviderPlatforms] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [hoursPlayed, setHoursPlayed] = useState('');
  const [customMetrics, setCustomMetrics] = useState<GameCustomMetric[]>([]);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [catalogMode, setCatalogMode] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<RawgGameResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<RawgGameResult | null>(catalogGame || null);
  const [possibleMatch, setPossibleMatch] = useState<Game | null>(null);
  const [pendingCatalogResult, setPendingCatalogResult] = useState<RawgGameResult | null>(null);
  const [error, setError] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const modalPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const nextCatalog = catalogGame || null;
    const nextTitle = editing && game ? game.title || '' : nextCatalog?.title || initialTitle || '';
    const nextStatus = editing && game ? (game.status === 'active' ? 'playing' : game.status || 'backlog') : initialStatus;
    const nextPlatform = editing && game ? game.platform || 'pc' : 'pc';
    const nextGenre = editing && game ? game.genre || 'rpg' : nextCatalog ? providerGenre(nextCatalog.genre) : 'rpg';
    const nextWebsite = editing && game ? game.website || '' : '';
    const nextImage = editing && game ? game.image || '' : nextCatalog?.image || '';
    const nextNotes = editing && game ? game.notes || '' : '';
    const nextPlayingSince = editing && game ? dateInput(game.playingSince) : '';
    const nextReleaseDate = editing && game ? dateInput(game.releaseDate) : nextCatalog?.releaseDate || '';
    const nextRawgId = editing && game ? game.rawgId || '' : nextCatalog?.rawgId || '';
    const nextProviderPlatforms = editing && game ? game.providerPlatforms || [] : nextCatalog?.providerPlatforms || [];
    const nextFavorite = editing && game ? Boolean(game.favorite) : false;
    const nextHours = editing && game ? String(Number(game.hoursPlayed || 0) || '') : '';
    const gameWithMetrics = game as (Game & { customMetrics?: GameCustomMetric[] }) | undefined;
    const nextMetrics = editing && gameWithMetrics
      ? Array.isArray(gameWithMetrics.customMetrics) ? gameWithMetrics.customMetrics || [] : [
          gameWithMetrics.accountLevel ? { id: createEntityId('metric'), label: 'Account Level', value: String(gameWithMetrics.accountLevel), showOnCard: gameWithMetrics.cardMetric === 'accountLevel' } : null,
          gameWithMetrics.totalPower ? { id: createEntityId('metric'), label: 'Power', value: String(gameWithMetrics.totalPower), showOnCard: gameWithMetrics.cardMetric === 'totalPower' } : null,
          gameWithMetrics.accountRank ? { id: createEntityId('metric'), label: 'Rank', value: String(gameWithMetrics.accountRank), showOnCard: gameWithMetrics.cardMetric === 'accountRank' } : null,
        ].filter(Boolean) as GameCustomMetric[] : [];
    setTitle(nextTitle); setStatus(nextStatus as Exclude<GameStatus, 'active'>); setPlatform(nextPlatform); setGenre(nextGenre); setWebsite(nextWebsite); setImage(nextImage); setNotes(nextNotes); setPlayingSince(nextPlayingSince); setReleaseDate(nextReleaseDate); setRawgId(nextRawgId); setProviderPlatforms(nextProviderPlatforms); setFavorite(nextFavorite); setHoursPlayed(nextHours); setCustomMetrics(nextMetrics); setSelectedCatalog(nextCatalog); setCatalogMode(!editing); setCatalogQuery(''); setCatalogResults([]); setCatalogError(''); setShowOptionalDetails(Boolean(editing && (nextGenre || nextWebsite || nextImage || nextNotes || nextPlayingSince || nextReleaseDate || nextFavorite || nextMetrics.length))); setError(''); setShowUnsaved(false); setPossibleMatch(null); setPendingCatalogResult(null);
    setInitialSnapshot(JSON.stringify({ title: nextTitle, status: nextStatus, platform: nextPlatform, genre: nextGenre, website: nextWebsite, image: nextImage, notes: nextNotes, playingSince: nextPlayingSince, releaseDate: nextReleaseDate, rawgId: nextRawgId, providerPlatforms: nextProviderPlatforms, favorite: nextFavorite, hoursPlayed: nextHours, customMetrics: nextMetrics }));
  }, [catalogGame, editing, game, initialStatus, initialTitle, isOpen]);

  useEffect(() => {
    if (!isOpen || editing || !catalogMode || catalogQuery.trim().length < 2) { setCatalogResults([]); setCatalogLoading(false); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setCatalogLoading(true); setCatalogError(''); void searchRawgGames(catalogQuery, 1, controller.signal).then(page => setCatalogResults(page.results)).catch(caught => { if (controller.signal.aborted) return; setCatalogResults([]); setCatalogError(caught instanceof Error ? caught.message : 'Game search is temporarily unavailable.'); }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); }); }, 450);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [catalogMode, catalogQuery, editing, isOpen]);

  const snapshot = useMemo(() => JSON.stringify({ title, status, platform, genre, website, image, notes, playingSince, releaseDate, rawgId, providerPlatforms, favorite, hoursPlayed, customMetrics }), [customMetrics, favorite, genre, hoursPlayed, image, notes, platform, playingSince, providerPlatforms, rawgId, releaseDate, status, title, website]);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  const requestClose = () => { if (initialSnapshot && snapshot !== initialSnapshot) { setShowUnsaved(true); return; } close(); };
  useOverlayLifecycle(isOpen, requestClose, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });

  const applyCatalogGame = (result: RawgGameResult) => {
    const fields = catalogFields(result);
    setSelectedCatalog(result); setTitle(fields.title); setImage(fields.image); setReleaseDate(fields.releaseDate); setRawgId(fields.rawgId); setProviderPlatforms(fields.providerPlatforms); setGenre(fields.genre); setCatalogQuery(''); setCatalogResults([]); setShowOptionalDetails(true);
  };

  const selectCatalogGame = (result: RawgGameResult) => {
    const exactMatch = exactRawgGameMatch(games, result);
    if (exactMatch) {
      if (onOpenExistingGame) onOpenExistingGame(exactMatch.id);
      else toast({ title: 'Already in your library', description: `${exactMatch.title} is already saved.` });
      return;
    }
    const possible = possibleRawgGameMatch(games, result);
    if (possible) {
      setPossibleMatch(possible);
      setPendingCatalogResult(result);
      return;
    }
    applyCatalogGame(result);
  };

  const save = () => {
    if (!title.trim()) { setError('Game title is required.'); return; }
    const normalizedWebsite = website.trim() ? normalizeExternalWebUrl(website) : undefined;
    if (website.trim() && !normalizedWebsite) { setError('Use a valid HTTPS website address.'); return; }
    const normalizedImage = normalizeCatalogImageSource(image);
    if (image.trim() && !normalizedImage) { setError('Use a valid HTTPS image address or uploaded image.'); return; }
    const parsedHours = Number(hoursPlayed || 0);
    const payload = { title: title.trim(), status, platform, genre, hoursPlayed: Number.isFinite(parsedHours) ? Math.max(0, parsedHours) : 0, website: normalizedWebsite, image: normalizedImage, notes: notes.trim() || undefined, playingSince: playingSince ? parseLocalDateInputOrUndefined(playingSince) : undefined, releaseDate: releaseDate ? parseLocalDateInputOrUndefined(releaseDate) : undefined, rawgId: rawgId.trim() || undefined, providerPlatforms: providerPlatforms.length ? providerPlatforms : undefined, favorite, customMetrics: customMetrics.filter(metric => metric.label.trim() && metric.value.trim()).map(metric => ({ ...metric, label: metric.label.trim(), value: metric.value.trim() })) } as Partial<Game>;
    if (editing && game) {
      updateGame(game.id, payload);
    } else {
      const created = addGame(payload as Omit<Game, 'id' | 'createdAt'>);
      if (created) onSaved?.(created.id);
    }
    toast({ title: 'Saved locally', description: `${title.trim()} is ready in your Games workspace.` }); close();
  };

  if (!isOpen || (gameId && !game) || typeof document === 'undefined') return null;
  const previewImage = normalizeCatalogImageSource(image);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000]" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}><div aria-hidden="true" className="absolute inset-0 bg-black/75 backdrop-blur-md" /><div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <section ref={modalPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="game-modal-title" data-caizen-overlay-panel="true" className="relative flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] border border-border/60 bg-card shadow-2xl sm:rounded-[2rem]">
          <header className="flex items-start justify-between gap-4 border-b border-border/50 p-5 sm:p-7"><div><p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary"><Gamepad2 className="h-4 w-4" /> {editing ? 'Edit game' : selectedCatalog ? 'Catalog game' : 'Add game'}</p><h2 id="game-modal-title" className="mt-2 text-2xl font-black sm:text-3xl">{editing ? 'Update Game' : 'Add Game'}</h2></div><Button type="button" variant="outline" size="icon" onClick={requestClose} aria-label={editing ? 'Close game editor' : 'Close add game dialog'} className="text-muted-foreground"><X className="h-5 w-5" /></Button></header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            {!editing && catalogMode ? <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Search game catalog</h3><p className="mt-1 text-xs text-muted-foreground">RAWG can prefill factual details. Manual Add is always available.</p></div><Button type="button" variant="outline" onClick={() => setCatalogMode(false)} className="text-xs font-black text-muted-foreground">Add manually</Button></div><label className="relative mt-4 block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} className="control-input pl-11" placeholder="Search game catalog..." aria-label="Search game catalog" /></label>{catalogLoading ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching RAWG...</p> : null}{catalogError ? <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">{catalogError}</p> : null}{catalogResults.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{catalogResults.slice(0, 8).map(result => <button key={result.rawgId} type="button" onClick={() => selectCatalogGame(result)} className="flex min-h-16 items-center gap-3 rounded-xl border border-border/55 bg-background/40 p-2 text-left hover:border-primary/35 hover:bg-muted/45"><span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">{result.image ? <img src={result.image} alt="" className="h-full w-full object-cover" /> : <Gamepad2 className="m-3 size-6 text-muted-foreground/40" />}</span><span className="min-w-0"><strong className="block truncate text-sm">{result.title}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{result.releaseDate || 'Release date unavailable'}{result.providerPlatforms.length ? ` · ${result.providerPlatforms.slice(0, 2).join(', ')}` : ''}</span></span></button>)}</div> : null}{selectedCatalog ? <p className="mt-3 text-xs font-bold text-primary">Selected: {selectedCatalog.title}</p> : null}</section> : null}
            <div className="grid gap-6 lg:grid-cols-[1fr_250px]"><div className="space-y-5">
              <section className="rounded-2xl border border-border/55 bg-background/40 p-4"><h3 className="font-black">Personal details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Title"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Game title" /></Field><Field label="Status"><AndroidAdaptiveSelect label="Status" value={status} onChange={value => setStatus(value as Exclude<GameStatus, 'active'>)} className="control-input" options={GAME_STATUSES} /></Field><Field label="Personal platform"><AndroidAdaptiveSelect label="Personal platform" value={platform} onChange={value => setPlatform(value as GamePlatform)} className="control-input" options={PLATFORM_OPTIONS} /></Field><Field label="Personal genre"><AndroidAdaptiveSelect label="Personal genre" value={genre} onChange={value => setGenre(value as GameGenre)} className="control-input" options={GENRE_OPTIONS} /></Field><Field label="Playtime (hours)"><Input type="number" min="0" step="0.5" inputMode="decimal" value={hoursPlayed} onChange={event => setHoursPlayed(event.target.value)} placeholder="0" /></Field><Field label="Playing since"><AdaptiveDatePicker label="Playing since" value={playingSince} onChange={setPlayingSince} className="control-input" /></Field><Field label="Release date (optional)"><AdaptiveDatePicker label="Release date" value={releaseDate} onChange={setReleaseDate} className="control-input" /></Field></div>{providerPlatforms.length ? <p className="mt-3 text-xs text-muted-foreground">Provider platforms: {providerPlatforms.join(', ')}</p> : null}{selectedCatalog ? <p className="mt-2 text-xs font-bold text-primary">Game data and images from <a href="https://rawg.io" target="_blank" rel="noreferrer" className="underline underline-offset-2">RAWG</a></p> : null}{error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}</section>
              <Button type="button" variant="outline" onClick={() => setShowOptionalDetails(current => !current)} aria-expanded={showOptionalDetails} className="w-full justify-start text-left text-sm font-black text-muted-foreground">{showOptionalDetails ? 'Hide optional details' : 'Add optional details'}</Button>
              {showOptionalDetails ? <section className="rounded-2xl border border-border/55 bg-background/40 p-4"><h3 className="font-black">Links and notes</h3><div className="mt-4 space-y-4"><Field label="Website / reference link"><Input type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://..." /></Field><Field label="Cover image URL"><Input type="url" value={image} onChange={event => setImage(event.target.value)} placeholder="https://..." /></Field><Field label="Notes"><Textarea value={notes} onChange={event => setNotes(event.target.value)} className="min-h-28" placeholder="Progress, goals, or next steps..." /></Field><label className="flex items-center gap-3 text-sm font-semibold"><Checkbox checked={favorite} onCheckedChange={checked => setFavorite(checked === true)} /> Favorite game</label></div></section> : null}
              {showOptionalDetails ? <section className="rounded-2xl border border-border/55 bg-background/40 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Custom metrics</h3><p className="mt-1 text-xs text-muted-foreground">Use levels, ranks, power, collection counts, or any personal value.</p></div><Button type="button" variant="outline" onClick={() => setCustomMetrics(current => [...current, { id: createEntityId('metric'), label: '', value: '', showOnCard: current.length === 0 }])} className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add</Button></div><div className="mt-4 space-y-3">{customMetrics.map(metric => <div key={metric.id} className="grid gap-2 rounded-xl border border-border/50 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Input aria-label={`Metric ${metric.id} name`} value={metric.label} onChange={event => setCustomMetrics(current => current.map(item => item.id === metric.id ? { ...item, label: event.target.value } : item))} placeholder="Rank" /><Input aria-label={`${metric.label || 'Custom metric'} value`} value={metric.value} onChange={event => setCustomMetrics(current => current.map(item => item.id === metric.id ? { ...item, value: event.target.value } : item))} placeholder="Diamond I" /><label className="flex items-center gap-2 px-2 text-xs font-bold"><Checkbox checked={Boolean(metric.showOnCard)} onCheckedChange={checked => setCustomMetrics(current => current.map(item => ({ ...item, showOnCard: item.id === metric.id ? checked === true : false })))} /> Card</label><Button type="button" variant="ghost" size="icon" onClick={() => setCustomMetrics(current => current.filter(item => item.id !== metric.id))} aria-label={`Remove ${metric.label || 'custom metric'}`} className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></Button></div>)}{!customMetrics.length ? <p className="text-sm text-muted-foreground">No custom metrics.</p> : null}</div></section> : null}
            </div><aside><div className="sticky top-0 overflow-hidden rounded-2xl border border-border/55 bg-background/45"><div className="aspect-[4/5] bg-muted/50">{previewImage ? <img src={previewImage} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Gamepad2 className="h-12 w-12 text-muted-foreground/40" /></div>}</div><div className="p-4"><p className="font-black">{title || 'Game preview'}</p><p className="mt-1 text-xs text-muted-foreground">{gameStatusLabel(status)} · {gamePlatformLabel(platform)}</p></div></div></aside></div>
          </div>
          <footer className="flex justify-end gap-2 border-t border-border/50 p-4 sm:p-5"><Button type="button" variant="outline" onClick={requestClose} className="rounded-xl">Cancel</Button><Button type="button" onClick={save} className="rounded-xl">{editing ? 'Save changes' : 'Add game'}</Button></footer>
        </section>
      </div></div>
      <ConfirmDialog isOpen={Boolean(pendingCatalogResult && possibleMatch)} title="Possible duplicate" message="Another game has the same title and personal platform. Review the existing game, or add this RAWG result anyway." details={possibleMatch ? <div className="space-y-3 text-sm"><p><span className="font-bold">Existing:</span> {possibleMatch.title} · {gamePlatformLabel(possibleMatch.platform)}</p>{onOpenExistingGame ? <Button type="button" variant="outline" className="min-h-11" onClick={() => { onOpenExistingGame(possibleMatch.id); setPossibleMatch(null); setPendingCatalogResult(null); }}>Open existing game</Button> : null}</div> : null} confirmText="Add anyway" cancelText="Keep searching" isDangerous={false} tone="warning" onCancel={() => { setPossibleMatch(null); setPendingCatalogResult(null); }} onConfirm={() => { if (pendingCatalogResult) applyCatalogGame(pendingCatalogResult); setPossibleMatch(null); setPendingCatalogResult(null); }} />
      <ConfirmDialog isOpen={showUnsaved} title="Discard game changes?" message="You have unsaved game details." confirmText="Discard" cancelText="Keep Editing" isDangerous onCancel={() => setShowUnsaved(false)} onConfirm={() => { setShowUnsaved(false); close(); }} />
    </>, document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <FormField label={label}>{children}</FormField>;
}
