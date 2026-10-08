'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowDown, ArrowLeft, ArrowUp, FolderTree, Plus, RotateCcw, Search, Settings2, Trash2, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  type TaxonomyModule,
  type TaxonomyPersistence,
  useProfileModuleTaxonomy,
} from '@/lib/module-taxonomy';
import { useAppContext } from '@/lib/context';

type CategoryView = 'active' | 'archived';
type WorkspaceScreen = 'list' | 'detail' | 'subcategories';

export type TaxonomyWorkspaceProps = {
  module: TaxonomyModule;
  displayName?: string;
  manageLabel?: string;
  itemSingular?: string;
  defaults: Record<string, string[]> | string[];
  observed?: Array<{ category?: string; subcategory?: string }>;
  androidPresentation?: boolean;
  showSubcategories?: boolean;
  allowRenameCategory?: boolean;
  allowRenameSubcategory?: boolean;
  embedded?: boolean;
  embeddedOpen?: boolean;
  onExit?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onBackRequestReady?: (back: (() => void) | null) => void;
  onNavigationRequest?: (navigate: () => void) => void;
  onRenameCategory?: (from: string, to: string) => void;
  onRenameSubcategory?: (category: string, from: string, to: string) => void;
  blockInUseCategoryRename?: boolean;
  persistence?: TaxonomyPersistence;
  focusedCategoryName?: string;
  subcategoryLabel?: (category: string, subcategory: string) => string;
};

const MODULE_LABELS: Record<TaxonomyModule, string> = {
  inventory: 'Inventory',
  wishlist: 'Wishlist',
  skincare: 'Skincare',
  supplements: 'Supplement',
  work: 'Work',
  personal: 'Personal',
  'supplement-types': 'Supplement type',
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const formatLabel = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, character => character.toUpperCase());

export function TaxonomyWorkspace({
  module,
  displayName,
  manageLabel = 'Manage categories',
  itemSingular = 'category',
  defaults,
  observed = [],
  androidPresentation = false,
  showSubcategories = true,
  allowRenameCategory = true,
  allowRenameSubcategory = true,
  embedded = false,
  embeddedOpen = false,
  onExit,
  onDraftChange,
  onBackRequestReady,
  onNavigationRequest,
  onRenameCategory,
  onRenameSubcategory,
  blockInUseCategoryRename = false,
  persistence,
  focusedCategoryName,
  subcategoryLabel,
}: TaxonomyWorkspaceProps) {
  const taxonomy = useProfileModuleTaxonomy(module, defaults, observed, persistence);
  const { currentProfileId } = useAppContext();
  const idPrefix = useId();
  const openedProfileIdRef = useRef(currentProfileId);
  const moduleLabel = displayName || MODULE_LABELS[module];
  const title = module === 'supplement-types'
    ? 'Supplement types'
    : module === 'supplements'
      ? displayName || 'Supplement categories'
      : `${moduleLabel} categories`;
  const itemLabel = itemSingular.toLocaleLowerCase();
  const itemPlural = itemLabel.endsWith('category') ? `${itemLabel.slice(0, -1)}ies` : `${itemLabel}s`;
  const renameDescription = onRenameCategory && onRenameSubcategory
    ? `Matching ${moduleLabel.toLowerCase()} records update when categories or subcategories are renamed.`
    : onRenameCategory
      ? `Matching ${moduleLabel.toLowerCase()} records update when a category is renamed.`
      : onRenameSubcategory
        ? `Matching ${moduleLabel.toLowerCase()} records update when a subcategory is renamed.`
        : 'Existing record values remain unchanged.';
  const [open, setOpen] = useState(false);
  const workspaceOpen = embedded ? embeddedOpen : open;
  const [view, setView] = useState<CategoryView>('active');
  const [screen, setScreen] = useState<WorkspaceScreen>(focusedCategoryName ? 'detail' : 'list');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [subcategoryDraft, setSubcategoryDraft] = useState('');
  const [editingSubcategory, setEditingSubcategory] = useState('');
  const [editingSubcategoryDraft, setEditingSubcategoryDraft] = useState('');
  const [error, setError] = useState('');
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState('');
  const [deleteSubcategoryTarget, setDeleteSubcategoryTarget] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const appliedFocusKeyRef = useRef('');

  const activeCategories = taxonomy.categories.filter(category => !category.archived);
  const archivedCategories = taxonomy.categories.filter(category => category.archived);
  const visibleCategories = useMemo(() => {
    const source = view === 'active' ? activeCategories : archivedCategories;
    const term = normalize(query);
    if (!term) return source;
    return source.filter(category => [
      category.name,
      formatLabel(category.name),
      ...(showSubcategories ? category.subcategories : []),
      ...(showSubcategories ? category.subcategories.map(formatLabel) : []),
    ].join(' ').toLocaleLowerCase().includes(term));
  }, [activeCategories, archivedCategories, query, showSubcategories, view]);
  const selectedCategory = taxonomy.categories.find(category => category.name === selected);
  const renameInputValue = selectedCategory && renameDraft === selectedCategory.name
    ? formatLabel(renameDraft)
    : renameDraft;
  const labelSubcategory = (category: string, value: string) =>
    (category.trim() && value.trim() ? subcategoryLabel?.(category, value) : undefined) || formatLabel(value);
  const editingSubcategoryInputValue = editingSubcategoryDraft === editingSubcategory
    ? labelSubcategory(selectedCategory?.name || '', editingSubcategoryDraft)
    : editingSubcategoryDraft;
  const hasDraft = Boolean(categoryDraft || subcategoryDraft ||
    (selectedCategory && renameDraft !== selectedCategory.name && renameDraft !== formatLabel(selectedCategory.name)) ||
    (editingSubcategory && editingSubcategoryDraft !== editingSubcategory &&
      editingSubcategoryDraft !== labelSubcategory(selectedCategory?.name || '', editingSubcategory)));
  useEffect(() => { onDraftChange?.(hasDraft); }, [hasDraft, onDraftChange]);
  const canReorderCategories = query.trim().length === 0 && (module === 'supplement-types' || (view === 'active' && archivedCategories.length === 0));
  const selectedCategoryList = view === 'active' ? activeCategories : archivedCategories;
  const selectedCategoryIndex = selectedCategoryList.findIndex(category => category.name === selectedCategory?.name);
  const archivedSubcategories = new Set(selectedCategory?.archivedSubcategories || []);
  const activeSubcategories = selectedCategory?.subcategories.filter(value => !archivedSubcategories.has(value)) || [];
  const archivedSubcategoryList = selectedCategory?.subcategories.filter(value => archivedSubcategories.has(value)) || [];

  const resetWorkspace = useCallback(() => {
    setOpen(false);
    setView('active');
    setScreen('list');
    setQuery('');
    setSelected('');
    setRenameDraft('');
    setCategoryDraft('');
    setSubcategoryDraft('');
    setEditingSubcategory('');
    setEditingSubcategoryDraft('');
    setError('');
    setDeleteCategoryTarget('');
    setDeleteSubcategoryTarget('');
    setStatusMessage('');
  }, []);

  const openWorkspace = () => {
    openedProfileIdRef.current = currentProfileId;
    setView('active');
    setScreen('list');
    setQuery('');
    setSelected('');
    setRenameDraft('');
    setCategoryDraft('');
    setSubcategoryDraft('');
    setEditingSubcategory('');
    setEditingSubcategoryDraft('');
    setError('');
    setOpen(true);
  };

  const stepBack = useCallback(() => {
    setCategoryDraft('');
    setSubcategoryDraft('');
    setRenameDraft(selectedCategory?.name || '');
    if (screen === 'subcategories') {
      setScreen('detail');
      setEditingSubcategory('');
      setEditingSubcategoryDraft('');
      setError('');
      return;
    }
    if (screen === 'detail') {
      if (focusedCategoryName) {
        if (embedded) onExit?.();
        else resetWorkspace();
        return;
      }
      setScreen('list');
      return;
    }
    if (embedded) onExit?.();
    else resetWorkspace();
  }, [embedded, focusedCategoryName, onExit, resetWorkspace, screen, selectedCategory?.name]);

  useEffect(() => {
    if (!workspaceOpen || !onBackRequestReady) return;
    onBackRequestReady(stepBack);
    return () => onBackRequestReady(null);
  }, [onBackRequestReady, stepBack, workspaceOpen]);

  useEffect(() => {
    if (!workspaceOpen || !focusedCategoryName) return;
    const focusKey = `${currentProfileId}:${focusedCategoryName}`;
    if (appliedFocusKeyRef.current === focusKey) return;
    const category = taxonomy.categories.find(item => item.name === focusedCategoryName);
    if (!category) return;
    appliedFocusKeyRef.current = focusKey;
    setView(category.archived ? 'archived' : 'active');
    setSelected(category.name);
    setRenameDraft(category.name);
    setScreen('detail');
  }, [currentProfileId, focusedCategoryName, taxonomy.categories, workspaceOpen]);

  useEffect(() => {
    if (workspaceOpen && openedProfileIdRef.current !== currentProfileId) {
      openedProfileIdRef.current = currentProfileId;
      resetWorkspace();
      setSelected('');
      setQuery('');
      setError('');
    }
  }, [currentProfileId, resetWorkspace, workspaceOpen]);

  useEffect(() => {
    if (!workspaceOpen || onBackRequestReady) return;
    const handleBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean; kind: 'overlay' | 'nested-flow' }>).detail;
      if (!detail || detail.handled || detail.kind !== 'nested-flow') return;
      detail.handled = true;
      stepBack();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-caizen-overlay="open"], [role="dialog"], [role="alertdialog"], [data-slot="select-content"][data-state="open"], [data-slot="dropdown-menu-content"][data-state="open"]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('select, [data-radix-popper-content-wrapper]')) return;
      event.preventDefault();
      stepBack();
    };
    const handleNavigate = () => {
      resetWorkspace();
      if (embedded) onExit?.();
    };
    window.addEventListener('caizen:native-back-request', handleBack);
    window.addEventListener('caizen:navigate', handleNavigate);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('caizen:native-back-request', handleBack);
      window.removeEventListener('caizen:navigate', handleNavigate);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [embedded, onBackRequestReady, onExit, resetWorkspace, stepBack, workspaceOpen]);

  useEffect(() => {
    if (!workspaceOpen || !selected) return;
    // Filtering the list must not discard the editor's unfinished input.
    if (hasDraft) return;
    if (visibleCategories.some(category => category.name === selected)) return;
    setSelected('');
    setRenameDraft('');
    setEditingSubcategory('');
    setEditingSubcategoryDraft('');
    setScreen('list');
  }, [hasDraft, selected, visibleCategories, workspaceOpen]);

  const announceSaved = () => setStatusMessage('Changes applied.');
  const navigateWithinWorkspace = (navigate: () => void) => {
    const applyNavigation = () => {
      setCategoryDraft('');
      setSubcategoryDraft('');
      setRenameDraft(selectedCategory?.name || '');
      setEditingSubcategory('');
      setEditingSubcategoryDraft('');
      navigate();
    };
    if (onNavigationRequest) onNavigationRequest(applyNavigation);
    else applyNavigation();
  };
  const chooseCategory = (name: string) => {
    setSelected(name);
    setRenameDraft(name);
    setEditingSubcategory('');
    setEditingSubcategoryDraft('');
    setError('');
    setScreen('detail');
  };

  const addCategory = () => {
    const name = categoryDraft.trim();
    if (!name) return setError(`Enter a ${itemLabel} name.`);
    if (taxonomy.categories.some(category => normalize(category.name) === normalize(name))) return setError(`That ${itemLabel} already exists.`);
    taxonomy.addCategory(name);
    setView('active');
    setSelected(name);
    setRenameDraft(name);
    setCategoryDraft('');
    setError('');
    setScreen('detail');
    announceSaved();
  };

  const saveCategoryName = () => {
    if (!selectedCategory || !allowRenameCategory) return;
    if (blockInUseCategoryRename && taxonomy.categoryUsageCount(selectedCategory.name) > 0) {
      setError(`This ${itemLabel} is in use. Edit its records before renaming it.`);
      return;
    }
    const name = renameDraft.trim();
    if (!name) return setError(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} name cannot be empty.`);
    if (name === selectedCategory.name || normalize(name) === normalize(formatLabel(selectedCategory.name))) {
      setRenameDraft(selectedCategory.name);
      setError('');
      return;
    }
    if (taxonomy.categories.some(category => category.name !== selectedCategory.name && normalize(category.name) === normalize(name))) {
      setError(`That ${itemLabel} name is already in use.`);
      return;
    }
    onRenameCategory?.(selectedCategory.name, name);
    taxonomy.renameCategory(selectedCategory.name, name);
    setSelected(name);
    setRenameDraft(name);
    setError('');
    announceSaved();
  };

  const addSubcategory = () => {
    if (!selectedCategory) return;
    const name = subcategoryDraft.trim();
    if (!name) return setError('Enter a subcategory name.');
    if (selectedCategory.subcategories.some(value => normalize(value) === normalize(name))) return setError('That subcategory already exists.');
    taxonomy.addSubcategory(selectedCategory.name, name);
    setSubcategoryDraft('');
    setError('');
    announceSaved();
  };

  const startSubcategoryEdit = (value: string) => {
    navigateWithinWorkspace(() => {
      setEditingSubcategory(value);
      setEditingSubcategoryDraft(value);
      setError('');
    });
  };

  const saveSubcategoryEdit = () => {
    if (!selectedCategory || !editingSubcategory || !allowRenameSubcategory) return;
    const name = editingSubcategoryDraft.trim();
    if (!name) return setError('Subcategory name cannot be empty.');
    if (name === editingSubcategory || normalize(name) === normalize(labelSubcategory(selectedCategory.name, editingSubcategory))) {
      setEditingSubcategory('');
      setEditingSubcategoryDraft('');
      setError('');
      return;
    }
    if (selectedCategory.subcategories.some(value => value !== editingSubcategory && normalize(value) === normalize(name))) return setError('That subcategory name is already in use.');
    onRenameSubcategory?.(selectedCategory.name, editingSubcategory, name);
    taxonomy.renameSubcategory(selectedCategory.name, editingSubcategory, name);
    setEditingSubcategory('');
    setEditingSubcategoryDraft('');
    setError('');
    announceSaved();
  };

  const archiveCategory = (name: string, archived: boolean) => {
    taxonomy.archiveCategory(name, archived);
    setView(archived ? 'archived' : 'active');
    setSelected(name);
    setRenameDraft(name);
    setError('');
    announceSaved();
  };

  const requestDeleteCategory = (name: string) => {
    if (taxonomy.isSystemCategory(name)) return setError(`Default ${itemPlural} can’t be deleted — archive them instead.`);
    const uses = taxonomy.categoryUsageCount(name);
    if (uses > 0) return setError(`${uses} record${uses === 1 ? '' : 's'} use this ${itemLabel}. Move them before deleting.`);
    setError('');
    setDeleteCategoryTarget(name);
  };

  const confirmDeleteCategory = () => {
    const name = deleteCategoryTarget;
    setDeleteCategoryTarget('');
    if (!name || !taxonomy.deleteCategory(name)) return;
    if (selected === name) {
      setSelected('');
      setRenameDraft('');
      setScreen('list');
    }
    setError('');
    announceSaved();
  };

  const requestDeleteSubcategory = (name: string) => {
    if (!selectedCategory) return;
    if (taxonomy.isSystemSubcategory(selectedCategory.name, name)) return setError('Default subcategories can’t be deleted — archive them instead.');
    const uses = taxonomy.subcategoryUsageCount(selectedCategory.name, name);
    if (uses > 0) return setError(`${uses} record${uses === 1 ? '' : 's'} use this subcategory. Move them before deleting.`);
    setError('');
    setDeleteSubcategoryTarget(name);
  };

  const confirmDeleteSubcategory = () => {
    const name = deleteSubcategoryTarget;
    setDeleteSubcategoryTarget('');
    if (!name || !selectedCategory || !taxonomy.deleteSubcategory(selectedCategory.name, name)) return;
    if (editingSubcategory === name) setEditingSubcategory('');
    setError('');
    announceSaved();
  };

  const moveCategory = (name: string, direction: -1 | 1) => {
    if (!canReorderCategories) return;
    const list = view === 'active' ? activeCategories : archivedCategories;
    const index = list.findIndex(category => category.name === name);
    if (index < 0 || index + direction < 0 || index + direction >= list.length) return;
    taxonomy.moveCategory(name, direction);
    announceSaved();
  };

  const moveSubcategory = (name: string, direction: -1 | 1) => {
    if (!selectedCategory || archivedSubcategoryList.length) return;
    taxonomy.moveSubcategory(selectedCategory.name, name, direction);
    announceSaved();
  };

  const archiveSubcategory = (name: string, archived: boolean) => {
    if (!selectedCategory) return;
    taxonomy.archiveSubcategory(selectedCategory.name, name, archived);
    setError('');
    announceSaved();
  };

  const subcategoryManager = () => !selectedCategory || !showSubcategories ? null : <section className="space-y-3 border-t border-border/50 pt-4">
    <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black">Subcategories</h4><p className="mt-1 text-xs text-muted-foreground">{activeSubcategories.length} active · {archivedSubcategoryList.length} archived</p></div></div>
    {!selectedCategory.archived ? <div className="flex gap-2"><input aria-label="New subcategory name" value={subcategoryDraft} onChange={event => { setSubcategoryDraft(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubcategory(); } }} placeholder="New subcategory" className="control-input h-11 min-w-0 flex-1" /><Button type="button" size="icon" onClick={addSubcategory} aria-label="Add subcategory" className="size-11"><Plus className="size-4" /></Button></div> : null}
    <div className="space-y-2">{activeSubcategories.length ? activeSubcategories.map((name, index) => {
      const usage = taxonomy.subcategoryUsageCount(selectedCategory.name, name);
      const canMove = archivedSubcategoryList.length === 0;
      return <div key={name} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/55 bg-background/60 p-2">
        {editingSubcategory === name && allowRenameSubcategory ? <><input aria-label="Subcategory name" value={editingSubcategoryInputValue} onChange={event => setEditingSubcategoryDraft(event.target.value)} className="control-input h-11 min-w-0 flex-1" /><Button type="button" onClick={saveSubcategoryEdit} className="min-h-11">Save</Button><Button type="button" variant="outline" onClick={() => setEditingSubcategory('')} className="min-h-11">Cancel</Button></> : <>
          {allowRenameSubcategory && !selectedCategory.archived ? <button type="button" onClick={() => startSubcategoryEdit(name)} className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm font-bold">{labelSubcategory(selectedCategory.name, name)}</button> : <span className="min-h-11 min-w-0 flex-1 content-center truncate px-2 text-sm font-bold">{labelSubcategory(selectedCategory.name, name)}</span>}
          {usage ? <span className="text-xs text-muted-foreground">{usage} use</span> : null}
          {!selectedCategory.archived && canMove ? <div className="flex"><Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveSubcategory(name, -1)} aria-label={`Move ${labelSubcategory(selectedCategory.name, name)} up`} className="min-h-11 min-w-11"><ArrowUp className="size-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={index === activeSubcategories.length - 1} onClick={() => moveSubcategory(name, 1)} aria-label={`Move ${labelSubcategory(selectedCategory.name, name)} down`} className="min-h-11 min-w-11"><ArrowDown className="size-4" /></Button></div> : null}
          {!selectedCategory.archived ? <Button type="button" variant="outline" onClick={() => archiveSubcategory(name, true)} className="min-h-11">Archive</Button> : null}
          {!taxonomy.isSystemSubcategory(selectedCategory.name, name) && usage === 0 ? <Button type="button" variant="ghost" onClick={() => requestDeleteSubcategory(name)} aria-label={`Delete ${labelSubcategory(selectedCategory.name, name)}`} className="min-h-11 min-w-11"><Trash2 className="size-4" /></Button> : null}
        </>}
      </div>;
    }) : <p className="rounded-xl border border-dashed border-border/50 p-3 text-sm text-muted-foreground">No active subcategories.</p>}</div>
    {archivedSubcategoryList.length ? <details className="rounded-xl border border-border/50 p-3"><summary className="min-h-10 cursor-pointer content-center text-xs font-bold">Archived subcategories ({archivedSubcategoryList.length})</summary><div className="mt-2 space-y-2">{archivedSubcategoryList.map(name => {
      const usage = taxonomy.subcategoryUsageCount(selectedCategory.name, name);
      return <div key={name} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/20 px-2"><span className="min-w-0 flex-1 truncate text-sm">{labelSubcategory(selectedCategory.name, name)}</span><Button type="button" variant="outline" onClick={() => archiveSubcategory(name, false)} className="min-h-11">Restore</Button>{!taxonomy.isSystemSubcategory(selectedCategory.name, name) && usage === 0 ? <Button type="button" variant="ghost" onClick={() => requestDeleteSubcategory(name)} aria-label={`Delete ${labelSubcategory(selectedCategory.name, name)}`} className="min-h-11 min-w-11"><Trash2 className="size-4" /></Button> : null}</div>;
    })}</div></details> : null}
  </section>;

  const categoryList = (mobile = false) => <>
    <div className="grid grid-cols-2 rounded-xl border border-border/60 bg-muted/20 p-1">
      {(['active', 'archived'] as const).map(nextView => <button key={nextView} type="button" onClick={() => { if (nextView !== view) navigateWithinWorkspace(() => { setView(nextView); setSelected(''); setRenameDraft(''); setError(''); setScreen('list'); }); }} aria-pressed={view === nextView} className={`min-h-12 rounded-lg px-2 text-sm font-semibold ${view === nextView ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>{nextView === 'active' ? `Active · ${activeCategories.length}` : `Archived · ${archivedCategories.length}`}</button>)}
    </div>
    {view === 'active' ? <div className="flex gap-2"><input aria-label={`New ${itemLabel} name`} value={categoryDraft} onChange={event => { setCategoryDraft(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategory(); } }} placeholder={`New ${itemLabel} name`} className="control-input h-11 min-w-0 flex-1" /><Button type="button" size="icon" onClick={addCategory} aria-label={`Add ${itemLabel}`} className="size-11"><Plus className="size-4" /></Button></div> : null}
    <div className="space-y-1.5">{visibleCategories.map(category => {
      const usage = taxonomy.categoryUsageCount(category.name);
      const isSelected = selected === category.name;
      return <div key={category.id} className={`flex items-stretch gap-1 rounded-xl border ${isSelected ? 'border-primary/45 bg-primary/5' : 'border-border/55 bg-background/55'}`}>
        <button type="button" onClick={() => { if (!isSelected || screen === 'list') navigateWithinWorkspace(() => chooseCategory(category.name)); }} aria-pressed={isSelected} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left">
          <span className="min-w-0 space-y-1 text-left">
            <span className="block text-sm font-semibold [overflow-wrap:anywhere]">{formatLabel(category.name) || category.name}</span>
            <span className="block text-xs tabular-nums text-muted-foreground">{usage} records{showSubcategories ? ` · ${category.subcategories.length} subcategories` : ''}</span>
          </span>
        </button>
        {mobile && <span className="sr-only">Select to manage</span>}
      </div>;
    })}{visibleCategories.length === 0 ? <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">{query.trim() ? `No matching ${itemPlural}.` : `No ${itemPlural} in this view.`}</p> : null}</div>
  </>;

  const workspaceGuidance = <div className="space-y-2">
    {embedded ? <h2 className="text-section-title">{title}</h2> : null}
    <p className="max-w-3xl text-sm text-muted-foreground">{renameDescription} Use Add or Save name to apply typed values; applied changes save automatically.</p>
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">{hasDraft ? 'Unfinished input. Apply it before leaving, or discard it when prompted.' : statusMessage}</p>
  </div>;

  const workspacePanel = (
    <>
      {!embedded ? <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:grid"><FolderTree className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h2 className="text-lg font-semibold sm:text-xl">{title}</h2></div></div>
        <Button type="button" variant="outline" onClick={stepBack} className="min-h-11 shrink-0 rounded-xl"><ArrowLeft className="size-4" /><span className="hidden sm:inline">Back</span><span className="sm:hidden">Back</span></Button>
      </header> : null}

      <div className="hidden shrink-0 border-b border-border/60 px-4 py-4 sm:px-6 @3xl/taxonomy:block">
        {workspaceGuidance}
      </div>

      <div className={`hidden min-h-0 flex-1 @3xl/taxonomy:grid ${focusedCategoryName ? '@3xl/taxonomy:grid-cols-1' : '@3xl/taxonomy:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]'}`}>
        {!focusedCategoryName ? <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain border-r border-border/60 p-4 sm:p-6">
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id={`${idPrefix}-search-desktop`} value={query} onChange={event => setQuery(event.target.value)} placeholder={showSubcategories ? 'Search categories or subcategories' : `Search ${itemPlural}`} className="taxonomy-settings-search-input control-input h-11 w-full pl-10 pr-10" aria-label={`Search ${itemPlural}`} />{query ? <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Clear search"><X className="size-4" /></button> : null}</div>
          {categoryList()}
          {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
        </aside> : null}
        <main className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {screen === 'detail' && selectedCategory ? <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-xl font-semibold [overflow-wrap:anywhere]">{formatLabel(selectedCategory.name)}</h3><p className="mt-1 text-sm text-muted-foreground">{taxonomy.categoryUsageCount(selectedCategory.name)} records use this {itemLabel}.</p></div>{!focusedCategoryName ? <div className="flex flex-wrap gap-2">{canReorderCategories ? <><Button type="button" variant="outline" size="icon" disabled={selectedCategoryIndex <= 0} onClick={() => moveCategory(selectedCategory.name, -1)} aria-label={`Move ${formatLabel(selectedCategory.name)} up`}><ArrowUp className="size-4" /></Button><Button type="button" variant="outline" size="icon" disabled={selectedCategoryIndex === selectedCategoryList.length - 1} onClick={() => moveCategory(selectedCategory.name, 1)} aria-label={`Move ${formatLabel(selectedCategory.name)} down`}><ArrowDown className="size-4" /></Button></> : null}<Button type="button" variant="outline" onClick={() => archiveCategory(selectedCategory.name, !selectedCategory.archived)} className="min-h-11">{selectedCategory.archived ? <RotateCcw className="mr-2 size-4" /> : <Archive className="mr-2 size-4" />}{selectedCategory.archived ? 'Restore' : 'Archive'}</Button><Button type="button" variant="ghost" onClick={() => requestDeleteCategory(selectedCategory.name)} disabled={taxonomy.isSystemCategory(selectedCategory.name) || taxonomy.categoryUsageCount(selectedCategory.name) > 0} aria-label={`Delete ${formatLabel(selectedCategory.name)}`} className="min-h-11 min-w-11"><Trash2 className="size-4" /></Button></div> : null}</div>
            {allowRenameCategory ? <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 space-y-1.5 text-sm font-semibold"><span>{itemLabel[0].toUpperCase()}{itemLabel.slice(1)} name</span><input value={renameInputValue} onChange={event => { setRenameDraft(event.target.value); setError(''); }} className="control-input h-11 w-full" maxLength={80} /></label><Button type="button" onClick={saveCategoryName} className="min-h-12">Save name</Button></div> : null}
            {showSubcategories ? subcategoryManager() : null}
            {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
          </div> : <div className="grid h-full min-h-0 place-items-center py-6 text-center"><div><FolderTree className="mx-auto size-8 text-muted-foreground/50" aria-hidden="true" /><h3 className="mt-4 text-section-title">Select a {itemLabel}</h3><p className="mt-2 text-sm text-muted-foreground">Choose one from the list to manage it.</p></div></div>}
        </main>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6 @3xl/taxonomy:hidden">
        {workspaceGuidance}
        {screen === 'list' && !focusedCategoryName ? <div className="space-y-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id={`${idPrefix}-search-mobile`} value={query} onChange={event => setQuery(event.target.value)} placeholder={showSubcategories ? 'Search categories or subcategories' : `Search ${itemPlural}`} className="taxonomy-settings-search-input control-input h-11 w-full pl-10 pr-10" aria-label={`Search ${itemPlural}`} />{query ? <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Clear search"><X className="size-4" /></button> : null}</div>
          {categoryList(true)}
          {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
        </div> : null}
        {screen === 'detail' && selectedCategory ? <div className="space-y-4">
          <Button type="button" variant="ghost" onClick={() => navigateWithinWorkspace(stepBack)} className="min-h-12 px-2"><ArrowLeft className="size-4" />{focusedCategoryName ? 'Back to Personal Vault' : view === 'active' ? 'Active categories' : 'Archived categories'}</Button>
          <div><h3 className="text-xl font-semibold [overflow-wrap:anywhere]">{formatLabel(selectedCategory.name)}</h3><p className="mt-1 text-sm text-muted-foreground">{taxonomy.categoryUsageCount(selectedCategory.name)} records use this {itemLabel}.</p></div>
          {allowRenameCategory ? <div className="space-y-3"><label className="grid gap-1.5 text-sm font-semibold">{itemLabel[0].toUpperCase()}{itemLabel.slice(1)} name<input value={renameInputValue} onChange={event => { setRenameDraft(event.target.value); setError(''); }} className="control-input h-11 w-full" maxLength={80} /></label><Button type="button" onClick={saveCategoryName} className="min-h-12 w-full">Save name</Button></div> : null}
          {!focusedCategoryName ? <><div className={`grid gap-2 ${canReorderCategories ? 'grid-cols-2' : 'grid-cols-1'}`}>{selectedCategory.archived ? <Button type="button" variant="outline" onClick={() => archiveCategory(selectedCategory.name, false)} className="min-h-12"><RotateCcw className="size-4" />Restore</Button> : <Button type="button" variant="outline" onClick={() => archiveCategory(selectedCategory.name, true)} className="min-h-12"><Archive className="size-4" />Archive</Button>}{canReorderCategories ? <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => moveCategory(selectedCategory.name, -1)} disabled={selectedCategoryIndex <= 0} aria-label={`Move ${itemLabel} up`} className="min-h-12 min-w-12 flex-1"><ArrowUp className="size-4" /></Button><Button type="button" variant="outline" onClick={() => moveCategory(selectedCategory.name, 1)} disabled={selectedCategoryIndex === selectedCategoryList.length - 1} aria-label={`Move ${itemLabel} down`} className="min-h-12 min-w-12 flex-1"><ArrowDown className="size-4" /></Button></div> : null}</div>
          {taxonomy.isSystemCategory(selectedCategory.name) || taxonomy.categoryUsageCount(selectedCategory.name) > 0 ? null : <Button type="button" variant="ghost" onClick={() => requestDeleteCategory(selectedCategory.name)} className="min-h-11 w-full text-destructive"><Trash2 className="size-4" />Delete {itemLabel}</Button>}</> : null}
          {showSubcategories ? <Button type="button" variant="outline" onClick={() => navigateWithinWorkspace(() => setScreen('subcategories'))} className="min-h-12 w-full justify-between">Manage subcategories <span>{activeSubcategories.length}</span></Button> : null}
          {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
        </div> : null}
        {screen === 'subcategories' && selectedCategory && showSubcategories ? <div className="space-y-4">
          <Button type="button" variant="ghost" onClick={() => navigateWithinWorkspace(stepBack)} className="min-h-12 px-2"><ArrowLeft className="size-4" />{formatLabel(selectedCategory.name)}</Button>
          {subcategoryManager()}
          {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
        </div> : null}
      </div>

      <ConfirmDialog isOpen={Boolean(deleteCategoryTarget)} title={`Delete ${itemLabel}`} message={`Delete "${formatLabel(deleteCategoryTarget)}"? It has no records using it, so nothing else is affected.`} confirmText={`Delete ${itemLabel}`} onConfirm={confirmDeleteCategory} onCancel={() => setDeleteCategoryTarget('')} />
      <ConfirmDialog isOpen={Boolean(deleteSubcategoryTarget)} title="Delete subcategory" message={`Delete "${formatLabel(deleteSubcategoryTarget)}"? It has no records using it, so nothing else is affected.`} confirmText="Delete subcategory" onConfirm={confirmDeleteSubcategory} onCancel={() => setDeleteSubcategoryTarget('')} />
    </>
  );

  return <>
    {!embedded ? <Button type="button" variant="outline" onClick={openWorkspace} className="min-h-11 rounded-xl" aria-label={`Manage ${title}`}><Settings2 className="mr-2 size-4" />{manageLabel}</Button> : null}
    {workspaceOpen && openedProfileIdRef.current === currentProfileId ? embedded ? (
      <section className="@container/taxonomy flex min-h-0 flex-1 flex-col overflow-hidden text-foreground" data-caizen-nested-flow="open" data-android-screen={androidPresentation ? 'taxonomy' : undefined} aria-label={title}>
        {workspacePanel}
      </section>
    ) : typeof document !== 'undefined' ? createPortal(
      <section className="@container/taxonomy fixed inset-0 z-[100] flex h-[var(--cz-vh,100dvh)] flex-col bg-background text-foreground" data-caizen-nested-flow="open" data-android-screen={androidPresentation ? 'taxonomy' : undefined} aria-label={title}>
        {workspacePanel}
      </section>,
      document.body,
    ) : null : null}
  </>;
}
