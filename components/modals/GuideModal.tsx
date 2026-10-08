'use client';

import { createPortal } from 'react-dom';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  ImageOff,
  Link2,
  ListChecks,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { createEntityId } from '@/lib/utils';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import type {
  GameGuide,
  GameGuideCategory,
} from '@/lib/types';
import type {
  ExtendedGuideItem,
  GuideItemKind,
} from '@/lib/games/types';

type GuideSectionDraft = {
  id: string;
  title: string;
  items: ExtendedGuideItem[];
};

function normalizeUrl(value?: string | null) {
  return normalizeCatalogImageSource(value) || '';
}

function isUnstableImageUrl(value?: string | null) {
  if (!value) return false;

  return (
    value.includes('encrypted-tbn') ||
    value.includes('google.com/imgres') ||
    value.includes('bing.com/th?id=')
  );
}

function createItem(
  kind: GuideItemKind = 'checklist',
): ExtendedGuideItem {
  return {
    id: createEntityId('guide-item'),
    kind,
    title: '',
    notes: '',
    completed: false,
    resources: [],
  };
}

function createSection(
  title = 'Overview',
  kind: GuideItemKind = 'note',
): GuideSectionDraft {
  return {
    id: createEntityId('guide-section'),
    title,
    items: [createItem(kind)],
  };
}

const templates: Array<{
  id: GameGuideCategory;
  label: string;
  sections: GuideSectionDraft[];
}> = [
  {
    id: 'build',
    label: 'Build',
    sections: [
      createSection('Build Overview', 'note'),
      createSection('Equipment', 'checklist'),
      createSection('Rotation', 'note'),
    ],
  },
  {
    id: 'team_lineup',
    label: 'Team / Lineup',
    sections: [
      createSection('Team Members', 'checklist'),
      createSection('Roles and Rotation', 'note'),
      createSection('Alternatives', 'note'),
    ],
  },
  {
    id: 'farming',
    label: 'Farming Route',
    sections: [
      createSection('Preparation', 'checklist'),
      createSection('Route', 'note'),
      createSection('Resources', 'resource'),
    ],
  },
  {
    id: 'boss_raid',
    label: 'Boss / Raid',
    sections: [
      createSection('Requirements', 'checklist'),
      createSection('Mechanics', 'note'),
      createSection('Rewards', 'note'),
    ],
  },
  {
    id: 'progression',
    label: 'Progression',
    sections: [
      createSection('Current Goal', 'note'),
      createSection('Milestones', 'checklist'),
    ],
  },
  {
    id: 'tips',
    label: 'Tips',
    sections: [createSection('Key Tips', 'note')],
  },
  {
    id: 'checklist',
    label: 'Checklist',
    sections: [createSection('Checklist', 'checklist')],
  },
  {
    id: 'other',
    label: 'Quick note',
    sections: [createSection('Overview', 'note')],
  },
];

function cloneTemplateSections(
  sections: GuideSectionDraft[],
): GuideSectionDraft[] {
  return sections.map(section => ({
    ...section,
    id: createEntityId('guide-section'),
    items: section.items.map(item => ({
      ...item,
      id: createEntityId('guide-item'),
      resources: (item.resources || []).map(resource => ({
        ...resource,
        id: createEntityId('resource'),
      })),
    })),
  }));
}

export default function GuideModal({
  isOpen,
  guideId,
  initialGameId,
  onClose,
  embedded = false,
}: {
  isOpen: boolean;
  guideId?: string | null;
  initialGameId?: string | null;
  onClose: () => void;
  embedded?: boolean;
}) {
  const {
    games,
    gameGuides,
    addGameGuide,
    updateGameGuide,
  } = useAppContext();

  const existing = guideId
    ? gameGuides.find(guide => guide.id === guideId)
    : null;

  const editing = Boolean(existing);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [gameId, setGameId] = useState('');
  const [category, setCategory] =
    useState<GameGuideCategory>('build');
  const [image, setImage] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [sections, setSections] =
    useState<GuideSectionDraft[]>([]);
  const [openSections, setOpenSections] =
    useState<string[]>([]);
  const [initialSnapshot, setInitialSnapshot] =
    useState('');
  const [showUnsaved, setShowUnsaved] =
    useState(false);
  const [error, setError] = useState('');
  const [showAdvancedTemplates, setShowAdvancedTemplates] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const template = templates[0];

    const nextSections: GuideSectionDraft[] =
      existing?.sections?.length
        ? existing.sections.map(section => ({
            ...section,
            items: section.items.map(item => ({
              ...item,
              kind:
                (item as ExtendedGuideItem).kind ||
                'checklist',
              resources: item.resources || [],
            })),
          }))
        : cloneTemplateSections(template.sections);

    const values = {
      title: existing?.title || '',
      description: existing?.description || '',
      gameId:
        existing?.gameId || initialGameId || '',
      category: existing?.category || 'build',
      image: existing?.image || '',
      favorite: Boolean(existing?.favorite),
      sections: nextSections,
    };

    setTitle(values.title);
    setDescription(values.description);
    setGameId(values.gameId);
    setCategory(values.category);
    setImage(values.image);
    setFavorite(values.favorite);
    setSections(nextSections);
    setOpenSections(
      nextSections.map(section => section.id),
    );
    setInitialSnapshot(JSON.stringify(values));
    setShowUnsaved(false);
    setError('');
  }, [existing, initialGameId, isOpen]);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        description,
        gameId,
        category,
        image,
        favorite,
        sections,
      }),
    [
      category,
      description,
      favorite,
      gameId,
      image,
      sections,
      title,
    ],
  );

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: isOpen && !embedded, onClose });
  const dismiss = () => embedded ? onClose() : close();
  const requestClose = () => {
    if (
      initialSnapshot &&
      snapshot !== initialSnapshot
    ) {
      setShowUnsaved(true);
      return;
    }

    dismiss();
  };

  const panelRef = useRef<HTMLElement | null>(null);

  useOverlayLifecycle(isOpen, requestClose, { lockScroll: false, autoFocus: false, containerRef: panelRef });

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showUnsaved) return;

      requestClose();
    };

    window.addEventListener('keydown', handler);

    return () =>
      window.removeEventListener(
        'keydown',
        handler,
      );
  }, [
    initialSnapshot,
    isOpen,
    showUnsaved,
    snapshot,
  ]);

  if (
    !isOpen ||
    (!embedded && typeof document === 'undefined')
  ) {
    return null;
  }

  const selectedGame = games.find(
    game => game.id === gameId,
  );

  const normalizedCover = normalizeUrl(image);
  const previewImage =
    normalizedCover ||
    normalizeUrl(selectedGame?.image);

  const applyTemplate = (
    templateId: GameGuideCategory,
  ) => {
    const template =
      templates.find(
        item => item.id === templateId,
      ) || templates[0];

    const next = cloneTemplateSections(
      template.sections,
    );

    setCategory(template.id);
    setSections(next);
    setOpenSections(
      next.map(section => section.id),
    );
  };

  const updateItem = (
    sectionId: string,
    itemId: string,
    updates: Partial<ExtendedGuideItem>,
  ) => {
    setSections(current =>
      current.map(section =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map(item =>
                item.id === itemId
                  ? { ...item, ...updates }
                  : item,
              ),
            }
          : section,
      ),
    );
  };

  const addItem = (
    sectionId: string,
    kind: GuideItemKind,
  ) => {
    setSections(current =>
      current.map(section =>
        section.id === sectionId
          ? {
              ...section,
              items: [
                ...section.items,
                createItem(kind),
              ],
            }
          : section,
      ),
    );
  };

  const save = () => {
    if (!title.trim()) {
      setError('Guide title is required.');
      return;
    }

    const payload = {
      title: title.trim(),
      description:
        description.trim() || undefined,
      image:
        normalizeUrl(image) || undefined,
      gameId: gameId || undefined,
      category,
      favorite,
      sections: sections.map(section => ({
        ...section,
        title:
          section.title.trim() ||
          'Untitled Section',
        items: section.items.map(item => ({
          ...item,
          title:
            item.title.trim() ||
            (item.kind === 'note'
              ? 'Notes'
              : item.kind === 'resource'
                ? 'Resource'
                : 'Checklist item'),
          notes:
            item.notes?.trim() || undefined,
          resources: item.resources
            .filter(resource =>
              resource.value.trim(),
            )
            .map(resource => ({
              ...resource,
              value:
                resource.type === 'link' ||
                resource.type === 'image-url'
                  ? normalizeUrl(resource.value)
                  : resource.value,
            })),
        })),
      })),
    } as Omit<
      GameGuide,
      'id' | 'createdAt'
    >;

    if (existing) {
      updateGameGuide(existing.id, payload);
    } else {
      addGameGuide(payload);
    }

    toast({ title: 'Saved locally', description: `${title.trim() || 'Guide'} is ready in Guides.` });
    dismiss();
  };

  const content = (
    <>
      <div className={embedded ? 'relative' : 'fixed inset-0 z-[1000]'} data-caizen-overlay={!embedded ? (isClosing ? 'closing' : 'open') : undefined} data-state={!embedded && isClosing ? 'closed' : undefined}>
        {!embedded ? <div aria-hidden="true" className="absolute inset-0 bg-black/75 backdrop-blur-md" /> : null}

        <div className={embedded ? 'relative' : 'fixed inset-0 flex items-end justify-center sm:items-center sm:p-4'}>
          <section ref={panelRef} tabIndex={-1} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="guide-editor-title" className={embedded ? 'caizen-guide-editor embedded-guide-panel relative flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card' : 'caizen-modal-panel caizen-guide-editor relative flex h-[100dvh] w-full max-w-[1440px] flex-col overflow-hidden border border-border/60 bg-card shadow-2xl sm:h-[96dvh] sm:rounded-[2rem]'}>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 p-5 sm:p-7">
              <div>
                <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  <BookOpen className="h-4 w-4" />
                  {editing
                    ? 'Edit guide'
                    : 'New guide'}
                </p>

                <h2 id="guide-editor-title" className="mt-2 text-2xl font-black sm:text-3xl">
                  Guide Builder
                </h2>

                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Keep the editor focused by building one
                  section at a time. Only checklist entries
                  count toward guide progress.
                </p>
              </div>

              <button
                type="button"
                onClick={requestClose}
                className="min-h-11 min-w-11 rounded-xl border border-border/60 p-2 text-muted-foreground transition hover:text-foreground"
                aria-label={embedded ? 'Back to guides' : 'Close'}
              >
                {embedded ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </button>
            </header>

            <div className={embedded ? 'grid flex-none lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]'}>
              <div className={embedded ? 'p-5 sm:p-7' : 'min-h-0 overflow-y-auto p-5 sm:p-7'}>
                {!editing ? (
                  <section className="rounded-2xl border border-border/55 bg-background/40 p-4">
                    <p className="font-black">
                      Start with a template
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(showAdvancedTemplates ? templates : templates.filter(template => template.id === 'checklist' || template.id === 'other')).map(template => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() =>
                            applyTemplate(
                              template.id,
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                            category === template.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/55 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {template.label}
                        </button>
                      ))}
                      <button type="button" onClick={() => setShowAdvancedTemplates(current => !current)} className="min-h-11 rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs font-black text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                        {showAdvancedTemplates ? 'Fewer templates' : 'More templates'}
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="mt-5 rounded-2xl border border-border/55 bg-background/40 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Guide title">
                      <input
                        value={title}
                        onChange={event =>
                          setTitle(
                            event.target.value,
                          )
                        }
                        className="control-input"
                        placeholder="Example: Merlin lightning build"
                      />
                    </Field>

                    <Field label="Game">
                      <select
                        value={gameId}
                        onChange={event =>
                          setGameId(
                            event.target.value,
                          )
                        }
                        className="control-input"
                      >
                        <option value="">
                          General guide
                        </option>

                        {games.map(game => (
                          <option
                            key={game.id}
                            value={game.id}
                          >
                            {game.title}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Category">
                      <select
                        value={category}
                        onChange={event =>
                          setCategory(
                            event.target
                              .value as GameGuideCategory,
                          )
                        }
                        className="control-input"
                      >
                        {templates.map(template => (
                          <option
                            key={template.id}
                            value={template.id}
                          >
                            {template.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Cover image URL">
                      <input
                        value={image}
                        onChange={event =>
                          setImage(
                            event.target.value,
                          )
                        }
                        className="control-input"
                        placeholder="Direct JPG, PNG, or WebP URL"
                      />
                    </Field>
                  </div>

                  <Field label="Description">
                    <textarea
                      value={description}
                      onChange={event =>
                        setDescription(
                          event.target.value,
                        )
                      }
                      className="mt-2 min-h-28 w-full rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm"
                      placeholder="What this guide covers, when to use it, and any important context."
                    />
                  </Field>

                  <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={favorite}
                      onChange={event =>
                        setFavorite(
                          event.target.checked,
                        )
                      }
                    />
                    Favorite guide
                  </label>

                  {error ? (
                    <p className="mt-3 text-sm text-red-400">
                      {error}
                    </p>
                  ) : null}
                </section>

                <div className="mt-5 space-y-4">
                  {sections.map(
                    (section, sectionIndex) => {
                      const open =
                        openSections.includes(
                          section.id,
                        );

                      return (
                        <section
                          key={section.id}
                          className="rounded-2xl border border-border/55 bg-background/40 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenSections(
                                  current =>
                                    current.includes(
                                      section.id,
                                    )
                                      ? current.filter(
                                          id =>
                                            id !==
                                            section.id,
                                        )
                                      : [
                                          ...current,
                                          section.id,
                                        ],
                                )
                              }
                              className="rounded-xl border border-border/55 p-2"
                              aria-label={
                                open
                                  ? 'Collapse section'
                                  : 'Expand section'
                              }
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition ${
                                  open
                                    ? 'rotate-180'
                                    : ''
                                }`}
                              />
                            </button>

                            <input
                              value={section.title}
                              onChange={event =>
                                setSections(
                                  current =>
                                    current.map(
                                      item =>
                                        item.id ===
                                        section.id
                                          ? {
                                              ...item,
                                              title:
                                                event
                                                  .target
                                                  .value,
                                            }
                                          : item,
                                    ),
                                )
                              }
                              className="control-input flex-1"
                              placeholder={`Section ${
                                sectionIndex + 1
                              }`}
                            />

                            <button
                              type="button"
                              onClick={() =>
                                setSections(
                                  current =>
                                    current.length > 1
                                      ? current.filter(
                                          item =>
                                            item.id !==
                                            section.id,
                                        )
                                      : current,
                                )
                              }
                              className="rounded-xl p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
                              aria-label="Delete section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          {open ? (
                            <div className="mt-4 space-y-3">
                              {section.items.map(
                                item => (
                                  <GuideItemEditor
                                    key={item.id}
                                    item={item}
                                    onChange={updates =>
                                      updateItem(
                                        section.id,
                                        item.id,
                                        updates,
                                      )
                                    }
                                    onDelete={() =>
                                      setSections(
                                        current =>
                                          current.map(
                                            currentSection =>
                                              currentSection.id ===
                                              section.id
                                                ? {
                                                    ...currentSection,
                                                    items:
                                                      currentSection
                                                        .items
                                                        .length >
                                                      1
                                                        ? currentSection.items.filter(
                                                            currentItem =>
                                                              currentItem.id !==
                                                              item.id,
                                                          )
                                                        : currentSection.items,
                                                  }
                                                : currentSection,
                                          ),
                                      )
                                    }
                                  />
                                ),
                              )}

                              <div className="flex flex-wrap gap-2">
                                <AddItemButton
                                  icon={ListChecks}
                                  label="Checklist"
                                  onClick={() =>
                                    addItem(
                                      section.id,
                                      'checklist',
                                    )
                                  }
                                />

                                <AddItemButton
                                  icon={StickyNote}
                                  label="Note"
                                  onClick={() =>
                                    addItem(
                                      section.id,
                                      'note',
                                    )
                                  }
                                />

                                <AddItemButton
                                  icon={Link2}
                                  label="Resource"
                                  onClick={() =>
                                    addItem(
                                      section.id,
                                      'resource',
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                        </section>
                      );
                    },
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const section = createSection(
                      `Section ${
                        sections.length + 1
                      }`,
                      'note',
                    );

                    setSections(current => [
                      ...current,
                      section,
                    ]);

                    setOpenSections(current => [
                      ...current,
                      section.id,
                    ]);
                  }}
                  className="mt-4 rounded-xl"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add section
                </Button>
              </div>

              <aside className={embedded ? 'hidden border-l border-border/50 bg-background/30 p-5 lg:block' : 'hidden min-h-0 overflow-y-auto border-l border-border/50 bg-background/30 p-5 lg:block'}>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Cover preview
                </p>

                <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
                  <SafeImage
                    src={previewImage}
                    alt={
                      title ||
                      selectedGame?.title ||
                      'Guide cover'
                    }
                    className="aspect-[4/3] w-full object-cover"
                    fallbackTitle="No usable cover image"
                  />
                </div>

                {normalizedCover ? (
                  <a
                    href={normalizedCover}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-black text-primary hover:underline"
                  >
                    Open original image
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}

                {isUnstableImageUrl(
                  normalizedCover,
                ) ? (
                  <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-600 dark:text-amber-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        Google and Bing thumbnail URLs
                        often expire or block hotlinking.
                        Use the direct image file URL when
                        possible.
                      </p>
                    </div>
                  </div>
                ) : null}

                {selectedGame?.image ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setImage(
                        selectedGame.image || '',
                      )
                    }
                    className="mt-4 w-full rounded-xl"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Use game cover
                  </Button>
                ) : null}

                {image ? (
                  <button
                    type="button"
                    onClick={() => setImage('')}
                    className="mt-3 w-full rounded-xl border border-border/55 px-3 py-2 text-xs font-black text-muted-foreground transition hover:text-foreground"
                  >
                    Clear guide cover
                  </button>
                ) : null}

                <div className="mt-6 rounded-2xl border border-border/55 bg-card/50 p-4">
                  <p className="font-black">
                    Image URL tips
                  </p>

                  <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                    <li>
                      Use a direct JPG, PNG, or WebP URL.
                    </li>
                    <li>
                      Search-result pages are not image URLs.
                    </li>
                    <li>
                      The linked game cover is used as a fallback.
                    </li>
                  </ul>
                </div>
              </aside>
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-border/50 p-4 sm:p-5">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                className="rounded-xl"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={save}
                className="rounded-xl"
              >
                Save guide
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard guide changes?"
        message="Your unsaved guide edits will be lost."
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsaved(false)}
        onConfirm={() => {
          setShowUnsaved(false);
          dismiss();
        }}
      />
    </>
  );

  return embedded ? content : createPortal(content, document.body);
}

function GuideItemEditor({
  item,
  onChange,
  onDelete,
}: {
  item: ExtendedGuideItem;
  onChange: (
    updates: Partial<ExtendedGuideItem>,
  ) => void;
  onDelete: () => void;
}) {
  const kind = item.kind || 'checklist';

  const resource = item.resources[0] || {
    id: createEntityId('resource'),
    type: 'link' as const,
    label: '',
    value: '',
  };

  const resourceUrl =
    resource.type === 'link' ||
    resource.type === 'image-url'
      ? normalizeUrl(resource.value)
      : resource.value;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-3">
      <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
        <select
          value={kind}
          onChange={event =>
            onChange({
              kind:
                event.target
                  .value as GuideItemKind,
              completed: false,
            })
          }
          className="control-input"
        >
          <option value="checklist">
            Checklist
          </option>
          <option value="note">Note</option>
          <option value="resource">
            Resource
          </option>
        </select>

        <input
          value={item.title}
          onChange={event =>
            onChange({
              title: event.target.value,
            })
          }
          className="control-input"
          placeholder={
            kind === 'checklist'
              ? 'Task or milestone'
              : kind === 'resource'
                ? 'Resource label'
                : 'Note title'
          }
        />

        <button
          type="button"
          onClick={onDelete}
          className="rounded-xl p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete guide entry"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {kind === 'checklist' ? (
        <textarea
          value={item.notes || ''}
          onChange={event =>
            onChange({
              notes: event.target.value,
            })
          }
          className="mt-3 min-h-20 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
          placeholder="Optional details"
        />
      ) : kind === 'note' ? (
        <textarea
          value={item.notes || ''}
          onChange={event =>
            onChange({
              notes: event.target.value,
            })
          }
          className="mt-3 min-h-32 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
          placeholder="Write your notes…"
        />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
            <select
              value={
                resource.type ===
                'uploaded-image'
                  ? 'image-url'
                  : resource.type
              }
              onChange={event =>
                onChange({
                  resources: [
                    {
                      ...resource,
                      type:
                        event.target
                          .value as
                          | 'image-url'
                          | 'link',
                    },
                  ],
                })
              }
              className="control-input"
            >
              <option value="link">
                Website link
              </option>
              <option value="image-url">
                Image URL
              </option>
            </select>

            <input
              value={resource.value}
              onChange={event =>
                onChange({
                  resources: [
                    {
                      ...resource,
                      value:
                        event.target.value,
                      label: item.title,
                    },
                  ],
                })
              }
              className="control-input"
              placeholder="https://…"
            />
          </div>

          {resource.type !== 'link' &&
          resourceUrl ? (
            <div className="overflow-hidden rounded-xl border border-border/55 bg-background/40">
              <SafeImage
                src={resourceUrl}
                alt={
                  resource.label ||
                  item.title ||
                  'Guide resource'
                }
                className="max-h-64 w-full object-contain"
                fallbackTitle="This image URL could not be loaded"
              />
            </div>
          ) : null}
        </div>
      )}
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

function AddItemButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ListChecks;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border/55 px-3 py-2 text-xs font-black text-muted-foreground transition hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>

      <div className="mt-2">{children}</div>
    </label>
  );
}
