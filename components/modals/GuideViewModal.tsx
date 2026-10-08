'use client';

import { createPortal } from 'react-dom';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  ImageOff,
  ListChecks,
  Menu,
  Pencil,
  Star,
  StickyNote,
  X,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { Button } from '@/components/ui/button';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { notifyLegacy as toast } from '@/lib/feedback/notify';

function normalizeUrl(value?: string | null) {
  return normalizeCatalogImageSource(value) || '';
}

function categoryLabel(value?: string) {
  switch (value) {
    case 'team_lineup':
      return 'Team / Lineup';
    case 'boss_raid':
      return 'Boss / Raid';
    case 'progression':
      return 'Progression';
    case 'checklist':
      return 'Checklist';
    case 'farming':
      return 'Farming';
    case 'tips':
      return 'Tips';
    case 'build':
      return 'Build';
    default:
      return 'Guide';
  }
}

type GuideContentFilter =
  | 'all'
  | 'checklist'
  | 'note'
  | 'resource';

function getGuideItemKind(
  item: any,
): Exclude<GuideContentFilter, 'all'> {
  if (
    item?.kind === 'note' ||
    item?.kind === 'resource' ||
    item?.kind === 'checklist'
  ) {
    return item.kind;
  }

  // Older guide records did not store a kind.
  // They were checklist entries that could also contain notes/resources.
  return 'checklist';
}

function matchesGuideContentFilter(
  item: any,
  filter: GuideContentFilter,
) {
  if (filter === 'all') return true;

  const kind = getGuideItemKind(item);

  if (filter === 'checklist') {
    return kind === 'checklist';
  }

  if (filter === 'note') {
    return (
      kind === 'note' ||
      Boolean(item?.notes?.trim())
    );
  }

  return (
    kind === 'resource' ||
    Boolean(item?.resources?.length)
  );
}

function getGuideContentCounts(items: any[]) {
  return items.reduce(
    (counts, item) => {
      counts.all += 1;

      if (
        matchesGuideContentFilter(
          item,
          'checklist',
        )
      ) {
        counts.checklist += 1;
      }

      if (
        matchesGuideContentFilter(
          item,
          'note',
        )
      ) {
        counts.note += 1;
      }

      if (
        matchesGuideContentFilter(
          item,
          'resource',
        )
      ) {
        counts.resource += 1;
      }

      return counts;
    },
    {
      all: 0,
      checklist: 0,
      note: 0,
      resource: 0,
    } as Record<GuideContentFilter, number>,
  );
}

export default function GuideViewModal({
  isOpen,
  guideId,
  onClose,
  onEdit,
  embedded = false,
}: {
  isOpen: boolean;
  guideId: string | null;
  onClose: () => void;
  onEdit: () => void;
  embedded?: boolean;
}) {
  const {
    games,
    gameGuides,
    updateGameGuide,
  } = useAppContext();

  const guide = gameGuides.find(
    item => item.id === guideId,
  ) as any;

  const [selectedSectionId, setSelectedSectionId] =
    useState<string | null>(null);

  const [selectedImage, setSelectedImage] =
    useState<string | null>(null);

  const [mobileNavigationOpen, setMobileNavigationOpen] =
    useState(false);

  const [contentFilter, setContentFilter] =
    useState<GuideContentFilter>('all');
  const [checklistAnnouncement, setChecklistAnnouncement] = useState('');

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: isOpen && !embedded, onClose });
  const dismiss = () => embedded ? onClose() : close();
  const requestOverlayClose = () => {
    if (selectedImage) {
      setSelectedImage(null);
      return;
    }
    if (mobileNavigationOpen) {
      setMobileNavigationOpen(false);
      return;
    }
    dismiss();
  };

  const panelRef = useRef<HTMLElement | null>(null);

  useOverlayLifecycle(isOpen, requestOverlayClose, { lockScroll: false, autoFocus: false, containerRef: panelRef });

  useEffect(() => {
    if (!isOpen || !guide) return;

    setSelectedSectionId(
      guide.sections?.[0]?.id || null,
    );

    setSelectedImage(null);
    setMobileNavigationOpen(false);
    setContentFilter('all');
    setChecklistAnnouncement('');
  }, [guideId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (selectedImage) {
        setSelectedImage(null);
        return;
      }

      if (mobileNavigationOpen) {
        setMobileNavigationOpen(false);
        return;
      }

      dismiss();
    };

    window.addEventListener('keydown', handler);

    return () =>
      window.removeEventListener(
        'keydown',
        handler,
      );
  }, [
    isOpen,
    mobileNavigationOpen,
    onClose,
    selectedImage,
  ]);

  const progress = useMemo(() => {
    const checklistItems = (
      guide?.sections || []
    )
      .flatMap(
        (section: any) =>
          section.items || [],
      )
      .filter(
        (item: any) =>
          getGuideItemKind(item) ===
          'checklist',
      );

    return {
      total: checklistItems.length,
      completed: checklistItems.filter(
        (item: any) => item.completed,
      ).length,
    };
  }, [guide]);

  if (
    !isOpen ||
    !guide ||
    (!embedded && typeof document === 'undefined')
  ) {
    return null;
  }

  const game = games.find(
    item => item.id === guide.gameId,
  );

  const sections = guide.sections || [];

  const selectedSection =
    sections.find(
      (section: any) =>
        section.id === selectedSectionId,
    ) ||
    sections[0] ||
    null;

  const selectedItems =
    selectedSection?.items || [];

  const selectedContentCounts =
    getGuideContentCounts(selectedItems);

  const visibleSelectedItems =
    selectedItems.filter((item: any) =>
      matchesGuideContentFilter(
        item,
        contentFilter,
      ),
    );

  const percent = progress.total
    ? Math.round(
        (progress.completed /
          progress.total) *
          100,
      )
    : 0;

  const coverImage =
    normalizeUrl(guide.image) ||
    normalizeUrl(game?.image);

  const toggleItem = (
    sectionId: string,
    itemId: string,
  ) => {
    const currentItem = guide.sections
      .find((section: any) => section.id === sectionId)
      ?.items.find((item: any) => item.id === itemId);
    const nextCompleted = !currentItem?.completed;
    setChecklistAnnouncement(`${currentItem?.title || 'Checklist item'} marked ${nextCompleted ? 'complete' : 'incomplete'}.`);
    updateGameGuide(guide.id, {
      sections: guide.sections.map(
        (section: any) =>
          section.id === sectionId
            ? {
                ...section,
                items: section.items.map(
                  (item: any) =>
                    item.id === itemId
                      ? {
                          ...item,
                          completed:
                            !item.completed,
                        }
                      : item,
                ),
              }
            : section,
      ),
    });
  };

  const chooseSection = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setContentFilter('all');
    setMobileNavigationOpen(false);
  };

  const content = (
    <>
      <div className={embedded ? 'relative' : 'fixed inset-0 z-[1000]'} data-caizen-overlay={!embedded ? (isClosing ? 'closing' : 'open') : undefined} data-state={!embedded && isClosing ? 'closed' : undefined}>
        {!embedded ? <div aria-hidden="true" className="absolute inset-0 bg-black/80 backdrop-blur-md" /> : null}

        <div className={embedded ? 'relative' : 'fixed inset-0 flex items-end justify-center sm:items-center sm:p-4'}>
          <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guide-viewer-title" className={embedded ? 'caizen-guide-viewer embedded-guide-panel relative flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card' : 'caizen-modal-panel caizen-guide-viewer relative flex h-[100dvh] w-full max-w-[1500px] flex-col overflow-hidden border border-border/60 bg-card shadow-2xl sm:h-[96dvh] sm:rounded-[2rem]'}>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  <BookOpen className="h-4 w-4" />
                  Guide
                </p>

                <h2 id="guide-viewer-title" className="mt-1 truncate text-xl font-black sm:text-2xl">
                  {guide.title}
                </h2>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setMobileNavigationOpen(
                      true,
                    )
                  }
                  className="rounded-xl border border-border/60 p-2 text-muted-foreground lg:hidden"
                  aria-label="Open sections"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <Button
                  type="button"
                  onClick={onEdit}
                  className="rounded-xl"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">
                    Edit
                  </span>
                </Button>

                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 min-w-11 rounded-xl border border-border/60 p-2 text-muted-foreground transition hover:text-foreground"
                  aria-label={embedded ? 'Back to guides' : 'Close'}
                >
                  {embedded ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </button>
              </div>
            </header>

            <div className={embedded ? 'grid flex-none lg:grid-cols-[280px_minmax(0,1fr)]' : 'grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]'}>
              <aside className={embedded ? 'hidden border-r border-border/50 bg-background/35 p-5 lg:block' : 'hidden min-h-0 overflow-y-auto border-r border-border/50 bg-background/35 p-5 lg:block'}>
                <GuideSidebar
                  guide={guide}
                  game={game}
                  coverImage={coverImage}
                  sections={sections}
                  selectedSectionId={
                    selectedSection?.id || null
                  }
                  progress={progress}
                  percent={percent}
                  onSelectSection={chooseSection}
                />
              </aside>

              <main className={embedded ? 'min-w-0 px-4 py-6 sm:px-8 sm:py-8 lg:px-10 xl:px-14' : 'min-h-0 min-w-0 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-10 xl:px-14'}>
                <div className="sr-only" aria-live="polite">{checklistAnnouncement}</div>
                <div className="mx-auto max-w-6xl">
                  <div className="mb-5 lg:hidden">
                    <SafeImage
                      src={coverImage}
                      alt={guide.title}
                      className="aspect-[16/7] w-full rounded-2xl object-cover"
                      fallbackTitle="No usable guide image"
                    />

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge
                        label={
                          game?.title ||
                          'General Guide'
                        }
                      />

                      <Badge
                        label={categoryLabel(
                          guide.category,
                        )}
                      />

                      {guide.favorite ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-500">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          Favorite
                        </span>
                      ) : null}
                    </div>

                    {guide.description ? (
                      <p className="mt-4 text-sm leading-7 text-muted-foreground">
                        {guide.description}
                      </p>
                    ) : null}

                    {progress.total ? (
                      <ProgressCard
                        completed={
                          progress.completed
                        }
                        total={progress.total}
                        percent={percent}
                      />
                    ) : null}
                  </div>

                  {selectedSection ? (
                    <>
                      <div className="mb-8">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                          Selected section
                        </p>

                        <h3 className="mt-2 text-2xl font-black sm:text-3xl">
                          {selectedSection.title ||
                            'Untitled Section'}
                        </h3>

                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedContentCounts.all}{' '}
                          entries
                        </p>

                        <div
                          className="mt-5 flex max-w-full gap-2 overflow-x-auto border-b border-border/45 pb-2"
                          role="tablist"
                          aria-label="Guide content types"
                        >
                          {(
                            [
                              ['all', 'All'],
                              [
                                'checklist',
                                'Checklist',
                              ],
                              ['note', 'Notes'],
                              [
                                'resource',
                                'Resources',
                              ],
                            ] as const
                          ).map(([id, label]) => {
                            const active =
                              contentFilter === id;

                            return (
                              <button
                                key={id}
                                type="button"
                                role="tab"
                                id={`guide-filter-${id}`}
                                aria-selected={active}
                                aria-controls={`guide-content-panel-${selectedSection.id}`}
                                onClick={() =>
                                  setContentFilter(id)
                                }
                                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                                  active
                                    ? 'border-primary/35 bg-primary/10 text-primary'
                                    : 'border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                              >
                                {label}

                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  {
                                    selectedContentCounts[
                                      id
                                    ]
                                  }
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {visibleSelectedItems.length ? (
                        <div id={`guide-content-panel-${selectedSection.id}`} role="tabpanel" aria-labelledby={`guide-filter-${contentFilter}`} className="space-y-6">
                          {visibleSelectedItems.map(
                            (item: any) => (
                              <GuideViewItem
                                key={item.id}
                                item={item}
                                onToggle={() =>
                                  toggleItem(
                                    selectedSection.id,
                                    item.id,
                                  )
                                }
                                onImage={
                                  setSelectedImage
                                }
                              />
                            ),
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
                          {contentFilter ===
                          'note' ? (
                            <StickyNote className="mx-auto h-9 w-9 text-muted-foreground" />
                          ) : contentFilter ===
                            'resource' ? (
                            <ImageIcon className="mx-auto h-9 w-9 text-muted-foreground" />
                          ) : (
                            <ListChecks className="mx-auto h-9 w-9 text-muted-foreground" />
                          )}

                          <p className="mt-4 font-black">
                            No{' '}
                            {contentFilter === 'all'
                              ? 'entries'
                              : contentFilter ===
                                  'note'
                                ? 'notes'
                                : contentFilter ===
                                    'resource'
                                  ? 'resources'
                                  : 'checklist items'}{' '}
                            in this section.
                          </p>

                          <p className="mt-2 text-sm text-muted-foreground">
                            Add one through Edit Guide.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
                      <BookOpen className="mx-auto h-9 w-9 text-muted-foreground" />
                      <p className="mt-4 font-black">
                        This guide has no sections yet.
                      </p>
                    </div>
                  )}
                </div>
              </main>
            </div>
          </section>
        </div>
      </div>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-[1150] lg:hidden">
          <button
            type="button"
            onClick={() =>
              setMobileNavigationOpen(false)
            }
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close sections"
          />

          <section className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] border border-border/60 bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Guide navigation
                </p>

                <h3 className="mt-1 text-xl font-black">
                  Sections
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMobileNavigationOpen(
                    false,
                  )
                }
                className="rounded-xl border border-border/60 p-2 text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <GuideSidebar
                guide={guide}
                game={game}
                coverImage={coverImage}
                sections={sections}
                selectedSectionId={
                  selectedSection?.id || null
                }
                progress={progress}
                percent={percent}
                onSelectSection={
                  chooseSection
                }
                compact
              />
            </div>
          </section>
        </div>
      ) : null}

      {selectedImage ? (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/95 p-4"
          onClick={() =>
            setSelectedImage(null)
          }
        >
          <button
            type="button"
            onClick={() =>
              setSelectedImage(null)
            }
            className="absolute right-4 top-4 rounded-xl bg-white/10 p-3 text-white"
            aria-label="Close image"
          >
            <X className="h-5 w-5" />
          </button>

          <SafeImage
            src={selectedImage}
            alt="Guide resource"
            className="max-h-[92vh] max-w-full rounded-2xl object-contain"
            fallbackTitle="This image could not be loaded"
          />
        </div>
      ) : null}
    </>
  );

  return embedded ? content : createPortal(content, document.body);
}

function GuideSidebar({
  guide,
  game,
  coverImage,
  sections,
  selectedSectionId,
  progress,
  percent,
  onSelectSection,
  compact = false,
}: {
  guide: any;
  game: any;
  coverImage: string;
  sections: any[];
  selectedSectionId: string | null;
  progress: {
    total: number;
    completed: number;
  };
  percent: number;
  onSelectSection: (
    sectionId: string,
  ) => void;
  compact?: boolean;
}) {
  return (
    <div>
      {!compact ? (
        <SafeImage
          src={coverImage}
          alt={guide.title}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
          fallbackTitle="No usable guide image"
        />
      ) : null}

      <div className={compact ? '' : 'mt-4'}>
        <div className="flex flex-wrap gap-2">
          <Badge
            label={
              game?.title || 'General Guide'
            }
          />

          <Badge
            label={categoryLabel(
              guide.category,
            )}
          />

          {guide.favorite ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
              Favorite
            </span>
          ) : null}
        </div>

        {guide.description ? (
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {guide.description}
          </p>
        ) : null}

        {progress.total ? (
          <ProgressCard
            completed={progress.completed}
            total={progress.total}
            percent={percent}
          />
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Sections
        </p>

        <nav className="mt-3 space-y-2">
          {sections.map(
            (section: any, index: number) => {
              const active =
                section.id ===
                selectedSectionId;

              const sectionItems =
                section.items || [];

              const checklistItems =
                sectionItems.filter(
                  (item: any) =>
                    getGuideItemKind(item) ===
                    'checklist',
                );

              const contentCounts =
                getGuideContentCounts(
                  sectionItems,
                );

              const complete =
                checklistItems.filter(
                  (item: any) =>
                    item.completed,
                ).length;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() =>
                    onSelectSection(
                      section.id,
                    )
                  }
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-primary/35 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-black">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">
                      {section.title ||
                        'Untitled Section'}
                    </span>

                    <span className="mt-0.5 block text-[11px]">
                      {checklistItems.length
                        ? `${complete}/${checklistItems.length} checklist`
                        : `${contentCounts.all} entries`}
                    </span>

                    {(contentCounts.note > 0 ||
                      contentCounts.resource >
                        0) ? (
                      <span className="mt-1 block text-[10px]">
                        {contentCounts.note > 0
                          ? `${contentCounts.note} note${
                              contentCounts.note ===
                              1
                                ? ''
                                : 's'
                            }`
                          : ''}
                        {contentCounts.note > 0 &&
                        contentCounts.resource > 0
                          ? ' · '
                          : ''}
                        {contentCounts.resource >
                        0
                          ? `${contentCounts.resource} resource${
                              contentCounts.resource ===
                              1
                                ? ''
                                : 's'
                            }`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            },
          )}
        </nav>
      </div>
    </div>
  );
}

function ProgressCard({
  completed,
  total,
  percent,
}: {
  completed: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-border/55 bg-card/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="text-xs font-black">
            Checklist progress
          </span>
        </div>

        <span className="text-xs font-black">
          {completed}/{total} · {percent}%
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${percent}%`,
          }}
        />
      </div>
    </div>
  );
}

function GuideViewItem({
  item,
  onToggle,
  onImage,
}: {
  item: any;
  onToggle: () => void;
  onImage: (value: string) => void;
}) {
  const kind = getGuideItemKind(item);
  const resources = item.resources || [];
  const hasNotes = Boolean(item.notes?.trim());

  const articleClass =
    kind === 'checklist' && item.completed
      ? 'border-emerald-500/25 bg-emerald-500/5'
      : 'border-border/50 bg-card/50';

  const icon =
    kind === 'note' ? (
      <StickyNote className="h-4 w-4" />
    ) : kind === 'resource' ? (
      <ImageIcon className="h-4 w-4" />
    ) : (
      <CheckCircle2 className="h-4 w-4" />
    );

  const label =
    kind === 'note'
      ? 'Note'
      : kind === 'resource'
        ? 'Resource'
        : 'Checklist';

  return (
    <article
      className={`rounded-2xl border p-6 sm:p-7 ${articleClass}`}
    >
      <div className="flex items-start gap-4">
        {kind === 'checklist' ? (
          <input
            type="checkbox"
            checked={Boolean(item.completed)}
            onChange={onToggle}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
            aria-label={`Mark ${item.title} as ${
              item.completed
                ? 'incomplete'
                : 'complete'
            }`}
          />
        ) : (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-primary">
            {kind === 'checklist' ? icon : null}

            <span className="text-[10px] font-black uppercase tracking-[0.16em]">
              {label}
            </span>

            {hasNotes && kind !== 'note' ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                Has notes
              </span>
            ) : null}

            {resources.length > 0 &&
            kind !== 'resource' ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                {resources.length}{' '}
                resource
                {resources.length === 1
                  ? ''
                  : 's'}
              </span>
            ) : null}
          </div>

          <h4
            className={`mt-3 text-base font-black sm:text-lg ${
              kind === 'checklist' &&
              item.completed
                ? 'text-muted-foreground line-through'
                : ''
            }`}
          >
            {item.title || 'Untitled entry'}
          </h4>

          {hasNotes ? (
            <div className="mt-4 rounded-xl border border-border/45 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-muted-foreground">
                <StickyNote className="h-4 w-4" />
                Notes
              </div>

              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {item.notes}
              </p>
            </div>
          ) : kind === 'note' ? (
            <p className="mt-4 text-sm italic text-muted-foreground">
              No note text was added.
            </p>
          ) : null}

          {resources.length > 0 ? (
            <GuideResources
              resources={resources}
              itemTitle={item.title}
              onImage={onImage}
            />
          ) : kind === 'resource' ? (
            <div className="mt-4 rounded-xl border border-dashed border-border/55 p-5 text-center">
              <ImageOff className="mx-auto h-6 w-6 text-muted-foreground" />

              <p className="mt-2 text-xs font-black text-muted-foreground">
                No resource URL was saved.
              </p>
            </div>
          ) : null}
        </div>

        {kind === 'checklist' &&
        item.completed ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : null}
      </div>
    </article>
  );
}

function GuideResources({
  resources,
  itemTitle,
  onImage,
}: {
  resources: any[];
  itemTitle?: string;
  onImage: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 text-xs font-black text-muted-foreground">
        <ExternalLink className="h-4 w-4" />
        Resources
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-1 xl:grid-cols-2">
        {resources.map(resource => {
          const resourceUrl =
            resource.type ===
              'uploaded-image'
              ? resource.value
              : normalizeUrl(
                  resource.value,
                );

          const isImage =
            resource.type ===
              'image-url' ||
            resource.type ===
              'uploaded-image';

          if (isImage) {
            return (
              <div
                key={resource.id}
                className="overflow-hidden rounded-2xl border border-border/50 bg-background/40"
              >
                <button
                  type="button"
                  onClick={() =>
                    onImage(resourceUrl)
                  }
                  className="block w-full text-left"
                >
                  <SafeImage
                    src={resourceUrl}
                    alt={
                      resource.label ||
                      itemTitle ||
                      'Guide resource'
                    }
                    className="aspect-video w-full object-cover"
                    fallbackTitle="Image could not be loaded"
                  />
                </button>

                <div className="flex items-center justify-between gap-3 p-3">
                  <span className="truncate text-xs font-black">
                    {resource.label ||
                      'Image resource'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      const destination = normalizeExternalWebUrl(resourceUrl);
                      if (destination) void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: 'Check this guide resource and try again.' }));
                    }}
                    disabled={!normalizeExternalWebUrl(resourceUrl)}
                    className="shrink-0 text-primary"
                    aria-label="Open original image"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              type="button"
              key={resource.id}
              onClick={() => {
                const destination = normalizeExternalWebUrl(resourceUrl);
                if (destination) void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: 'Check this guide resource and try again.' }));
              }}
              disabled={!normalizeExternalWebUrl(resourceUrl)}
              className="flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-border/50 p-4 text-sm font-black transition hover:bg-muted"
            >
              <span className="min-w-0 break-words">
                {resource.label ||
                  resource.value}
              </span>

              <ExternalLink className="h-4 w-4 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SafeImage({
  src,
  alt,
  className,
  fallbackTitle,
}: {
  src?: string;
  alt: string;
  className: string;
  fallbackTitle: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex min-h-40 items-center justify-center bg-muted/40 p-5 text-center ${className}`}
      >
        <div>
          <ImageOff className="mx-auto h-7 w-7 text-muted-foreground" />

          <p className="mt-2 text-xs font-black text-muted-foreground">
            {fallbackTitle}
          </p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function Badge({
  label,
}: {
  label: string;
}) {
  return (
    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-black text-muted-foreground">
      {label}
    </span>
  );
}
