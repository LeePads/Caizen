'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileText,
  Plus,
} from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import WorkTypeEditor from '@/components/work/WorkTypeEditor';
import type {
  ModuleTaxonomyCategory,
  TrashItem,
  WorkItem,
  WorkRecordKind,
  WorkTypeDefinition,
} from '@/lib/types';
import { createTaxonomyId } from '@/lib/module-taxonomy-normalization';
import { createEntityId } from '@/lib/utils';
import { normalizeWorkTypeDefinitions } from '@/lib/workhub/custom-fields';
import {
  addMissingPresetWorkTypes,
  BUILT_IN_WORK_TYPES,
  serializeWorkTypeOverrides,
  workTypeForItem,
  WORK_TYPE_PRESETS,
  restoreBuiltInWorkTypeDefaults,
} from '@/lib/workhub/work-types';
import { registerWorkSetupLeaveGuard, type WorkSetupExitReason } from '@/lib/workhub/setup-navigation';

type SetupSection = 'work-types' | 'categories' | 'presets';
type MobileStep = 'type-list' | 'type-editor' | 'field-editor';
type PendingSetupSave = {
  profileId: string;
  types: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  resolve?: (saved: boolean) => void;
};
type CategoryRenameDraft = { id: string; name: string; originalName: string };
type SaveFailure = 'none' | 'validation' | 'retry' | 'rejected';

type WorkSetupWorkspaceProps = {
  profileId: string;
  workTypes: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  workItems: WorkItem[];
  trashItems: TrashItem[];
  androidPresentation?: boolean;
  embedded?: boolean;
  onBackRequestReady?: (back: (() => void) | null) => void;
  onLeaveRequestReady?: (
    requestLeave: (reason: WorkSetupExitReason, closeWorkspace?: boolean) => Promise<boolean>,
  ) => void;
  onSave: (
    profileId: string,
    workTypes: WorkTypeDefinition[],
    categories: ModuleTaxonomyCategory[],
  ) => boolean;
  onClose: () => void;
};

const INPUT = 'min-h-11 w-full rounded-xl';

function normalizeSetupName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export default function WorkSetupWorkspace({
  profileId,
  workTypes,
  categories,
  workItems,
  trashItems,
  androidPresentation = false,
  embedded = false,
  onBackRequestReady,
  onLeaveRequestReady,
  onSave,
  onClose,
}: WorkSetupWorkspaceProps) {
  const setupContentRef = useRef<HTMLDivElement>(null);
  const [compactLayout, setCompactLayout] = useState(true);
  const [section, setSection] = useState<SetupSection>('work-types');
  const [mobileStep, setMobileStep] = useState<MobileStep>('type-list');
  const [draftTypes, setDraftTypes] = useState(workTypes);
  const [savedTypes, setSavedTypes] = useState(workTypes);
  const [draftCategories, setDraftCategories] = useState(categories);
  const [savedCategories, setSavedCategories] = useState(categories);
  const [kind, setKind] = useState<WorkRecordKind>('note');
  const [selectedTypeId, setSelectedTypeId] = useState(
    workTypes.find(type => type.kind === 'note' && !type.archived)?.id || '',
  );
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [typeQuery, setTypeQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryRenameDraft, setCategoryRenameDraft] = useState<CategoryRenameDraft | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [leaveDestination, setLeaveDestination] = useState('Work Hub');
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<WorkTypeDefinition | null>(null);
  const leaveResolverRef = useRef<((allow: boolean) => void) | null>(null);
  const leaveCloseWorkspaceRef = useRef(true);
  const pendingSaveRef = useRef<PendingSetupSave | null>(null);
  const saveFailureRef = useRef<SaveFailure>('none');
  const activeElementBeforeSetupRef = useRef<HTMLElement | null>(null);
  const setupBackButtonRef = useRef<HTMLButtonElement>(null);
  const leaveTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const content = setupContentRef.current;
    if (!content) return;
    // Match the 48rem container query, including browser text-size changes.
    const updateLayout = () => {
      const rem = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
      setCompactLayout(content.clientWidth < 48 * rem);
    };
    const observer = new ResizeObserver(updateLayout);
    observer.observe(content);
    window.addEventListener('resize', updateLayout);
    updateLayout();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  const dirty =
    JSON.stringify(draftTypes) !== JSON.stringify(savedTypes) ||
    JSON.stringify(draftCategories) !== JSON.stringify(savedCategories) ||
    Boolean(newTypeName.trim()) ||
    Boolean(newCategoryName.trim()) ||
    Boolean(categoryRenameDraft && normalizeSetupName(categoryRenameDraft.name) !== normalizeSetupName(categoryRenameDraft.originalName));

  const selectedType = draftTypes.find(type => type.id === selectedTypeId);
  const typesForKind = useMemo(
    () => draftTypes.filter(type => type.kind === kind),
    [draftTypes, kind],
  );
  const matchingTypes = typesForKind.filter(type =>
    type.name.toLocaleLowerCase().includes(typeQuery.trim().toLocaleLowerCase()),
  );
  const activeTypes = matchingTypes.filter(type => !type.archived);
  const archivedTypes = matchingTypes.filter(type => type.archived);

  const getRecords = useCallback(() => {
    const active = workItems.filter(isTypeableWorkItem);
    const trashed = trashItems
      .filter(item => item.source === 'workItems')
      .flatMap(item => recordsFromTrashData(item.data))
      .filter(isTypeableWorkItem);
    return { active, trashed };
  }, [trashItems, workItems]);

  const recordUsage = useMemo(() => {
    const records = getRecords();
    return [...records.active, ...records.trashed];
  }, [getRecords]);

  const fieldValueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!selectedType) return counts;
    for (const item of recordUsage) {
      if (workTypeForItem(item, draftTypes)?.id !== selectedType.id) continue;
      for (const fieldId of Object.keys(item.customFieldValues || {})) {
        counts[fieldId] = (counts[fieldId] || 0) + 1;
      }
    }
    return counts;
  }, [draftTypes, recordUsage, selectedType]);

  const categoryUsage = useMemo(() => {
    const records = getRecords();
    const count = (items: WorkItem[]) => {
      const result: Record<string, number> = {};
      for (const item of items) {
        if (!item.workCategoryId) continue;
        result[item.workCategoryId] = (result[item.workCategoryId] || 0) + 1;
      }
      return result;
    };
    return { active: count(records.active), trash: count(records.trashed) };
  }, [getRecords]);

  const updateSelectedType = (next: WorkTypeDefinition) => {
    setDraftTypes(current => current.map(type => type.id === next.id ? next : type));
    setStatusMessage('');
  };

  const selectField = (id: string) => {
    setSelectedFieldId(id);
    setMobileStep(compactLayout ? 'field-editor' : 'type-editor');
  };

  const saveDraft = useCallback(async () => {
    saveFailureRef.current = 'none';
    if (!profileId || retryPending) {
      saveFailureRef.current = retryPending ? 'retry' : 'rejected';
      return false;
    }
    const typesToSave = [...draftTypes];
    let categoriesToSave = [...draftCategories];

    const pendingTypeName = normalizeSetupName(newTypeName);
    if (pendingTypeName) {
      if (typesToSave.some(type => type.kind === kind && normalizeSetupName(type.name).toLocaleLowerCase() === pendingTypeName.toLocaleLowerCase())) {
        saveFailureRef.current = 'validation';
        setSection('work-types');
        setStatusMessage(kind === 'note' ? 'A Note type already uses this name. Choose a different name.' : 'A Resource type already uses this name. Choose a different name.');
        return false;
      }
      typesToSave.push({ id: createEntityId('work-type'), name: pendingTypeName, kind, fields: [] });
    }

    if (categoryRenameDraft && normalizeSetupName(categoryRenameDraft.name) !== normalizeSetupName(categoryRenameDraft.originalName)) {
      const renamed = normalizeSetupName(categoryRenameDraft.name);
      if (!renamed || categoriesToSave.some(category => category.id !== categoryRenameDraft.id && normalizeSetupName(category.name).toLocaleLowerCase() === renamed.toLocaleLowerCase())) {
        saveFailureRef.current = 'validation';
        setSection('categories');
        setMobileStep('type-list');
        setStatusMessage(renamed ? 'A category already uses this name. Choose a different name.' : 'Enter a category name.');
        return false;
      }
      categoriesToSave = categoriesToSave.map(category => category.id === categoryRenameDraft.id ? { ...category, name: renamed } : category);
    }

    const pendingCategoryName = normalizeSetupName(newCategoryName);
    if (pendingCategoryName) {
      if (categoriesToSave.some(category => normalizeSetupName(category.name).toLocaleLowerCase() === pendingCategoryName.toLocaleLowerCase())) {
        saveFailureRef.current = 'validation';
        setSection('categories');
        setMobileStep('type-list');
        setStatusMessage('A category already uses this name. Choose a different name.');
        return false;
      }
      categoriesToSave.push({
        id: createTaxonomyId(pendingCategoryName),
        name: pendingCategoryName,
        subcategories: [],
        archivedSubcategories: [],
        customSubcategories: [],
      });
    }

    for (const type of typesToSave) {
      if (!type.name.trim()) {
        saveFailureRef.current = 'validation';
        setSection('work-types');
        setKind(type.kind);
        setSelectedTypeId(type.id);
        setSelectedFieldId('');
        setMobileStep('type-editor');
        setStatusMessage('Enter a name for this Work Type before saving.');
        return false;
      }
      for (const field of type.fields) {
        if (!field.label.trim() || (field.options || []).some(option => !option.label.trim())) {
          saveFailureRef.current = 'validation';
          setSection('work-types');
          setKind(type.kind);
          setSelectedTypeId(type.id);
          setSelectedFieldId(field.id);
          setMobileStep(compactLayout ? 'field-editor' : 'type-editor');
          setStatusMessage('Enter a label for this field and each of its options before saving.');
          return false;
        }
      }
    }
    const seenTypes = new Set<string>();
    for (const type of typesToSave) {
      const key = `${type.kind}:${type.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
      if (seenTypes.has(key)) {
        saveFailureRef.current = 'validation';
        setSection('work-types');
        setKind(type.kind);
        setSelectedTypeId(type.id);
        setSelectedFieldId('');
        setMobileStep('type-editor');
        setStatusMessage('Use a different name for each Work Type within Notes or Resources, including archived types.');
        return false;
      }
      seenTypes.add(key);
    }
    for (const type of typesToSave) {
      for (const field of type.fields) {
        const optionLabels = new Set<string>();
        for (const option of field.options || []) {
          const key = option.label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
          if (key && optionLabels.has(key)) {
            saveFailureRef.current = 'validation';
            setSection('work-types');
            setKind(type.kind);
            setSelectedTypeId(type.id);
            setSelectedFieldId(field.id);
            setMobileStep(compactLayout ? 'field-editor' : 'type-editor');
            setStatusMessage('Use a different label for each option in this field.');
            return false;
          }
          if (key) optionLabels.add(key);
        }
      }
    }
    const seenCategories = new Set<string>();
    for (const category of categoriesToSave) {
      const key = category.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!key || seenCategories.has(key)) {
        saveFailureRef.current = 'validation';
        setSection('categories');
        setMobileStep('type-list');
        setStatusMessage('Give every category a name and use a different name for each category.');
        return false;
      }
      seenCategories.add(key);
    }

    const normalizedTypes = normalizeWorkTypeDefinitions(typesToSave);
    const normalizedCategories = categoriesToSave.map(category => ({
      ...category,
      name: category.name.trim().replace(/\s+/g, ' '),
    }));
    setDraftTypes(normalizedTypes);
    setDraftCategories(normalizedCategories);
    setNewTypeName('');
    setNewCategoryName('');
    setCategoryRenameDraft(null);
    setNewTypeOpen(false);
    setSaving(true);
    return await new Promise<boolean>(resolve => {
      const pending: PendingSetupSave = {
        profileId,
        types: normalizedTypes,
        categories: normalizedCategories,
        resolve,
      };
      pendingSaveRef.current = pending;
      let result = false;
      try {
        result = onSave(
          profileId,
          serializeWorkTypeOverrides(normalizedTypes),
          normalizedCategories,
        );
      } catch {
        result = false;
      }
      if (!result) {
        saveFailureRef.current = 'rejected';
        pendingSaveRef.current = null;
        setSaving(false);
        setRetryPending(false);
        setStatusMessage('Could not save this Work setup. Your changes are still here. Try Save changes again.');
        resolve(false);
      }
    });
  }, [categoryRenameDraft, draftCategories, draftTypes, compactLayout, kind, newCategoryName, newTypeName, onSave, profileId, retryPending]);

  const requestLeave = useCallback(async (reason?: WorkSetupExitReason, closeWorkspace = true) => {
    if (!dirty) {
      if (closeWorkspace) onClose();
      return true;
    }
    if (leaveResolverRef.current) return false;
    leaveTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaveCloseWorkspaceRef.current = closeWorkspace;
    setLeaveDestination(
      reason === 'section-navigation' ? 'another section' :
        reason === 'profile-switch' ? 'another profile' :
          reason === 'profile-route' ? 'the requested record' : 'Work Hub',
    );
    setLeaveDialogOpen(true);
    return await new Promise<boolean>(resolve => {
      leaveResolverRef.current = resolve;
    });
  }, [dirty, onClose]);

  const finishLeave = (allow: boolean) => {
    const resolve = leaveResolverRef.current;
    const closeWorkspace = leaveCloseWorkspaceRef.current;
    leaveResolverRef.current = null;
    leaveCloseWorkspaceRef.current = true;
    setLeaveDialogOpen(false);
    resolve?.(allow);
    if (allow && closeWorkspace) onClose();
  };

  const keepEditing = () => {
    finishLeave(false);
    window.requestAnimationFrame(() => {
      const trigger = leaveTriggerRef.current;
      const fallback = setupBackButtonRef.current
        || setupContentRef.current?.closest('section')?.querySelector<HTMLElement>('nav button');
      (trigger?.isConnected ? trigger : fallback)?.focus({ preventScroll: true });
    });
  };

  const discardAndLeave = () => {
    if (saving) return;
    if (pendingSaveRef.current?.profileId === profileId) {
      onSave(profileId, serializeWorkTypeOverrides(savedTypes), savedCategories);
      pendingSaveRef.current = null;
      setRetryPending(false);
    }
    setDraftTypes(savedTypes);
    setDraftCategories(savedCategories);
    setNewTypeName('');
    setNewCategoryName('');
    setCategoryRenameDraft(null);
    setNewTypeOpen(false);
    finishLeave(true);
  };

  const discardDraft = () => {
    if (saving) return;
    if (pendingSaveRef.current?.profileId === profileId) {
      onSave(profileId, serializeWorkTypeOverrides(savedTypes), savedCategories);
      pendingSaveRef.current = null;
      setRetryPending(false);
    }
    setDraftTypes(savedTypes);
    setDraftCategories(savedCategories);
    setNewTypeName('');
    setNewCategoryName('');
    setCategoryRenameDraft(null);
    setNewTypeOpen(false);
    setStatusMessage('Unsaved changes discarded.');
  };

  const saveAndLeave = async () => {
    const leaveResolver = leaveResolverRef.current;
    if (!leaveResolver || saving || retryPending) return;
    const saved = await saveDraft();
    if (saved && leaveResolverRef.current === leaveResolver) {
      finishLeave(true);
    } else if (
      !saved &&
      leaveResolverRef.current === leaveResolver &&
      (saveFailureRef.current === 'validation' || saveFailureRef.current === 'rejected')
    ) {
      finishLeave(false);
    }
  };

  useEffect(() => registerWorkSetupLeaveGuard(reason => requestLeave(reason, true)), [requestLeave]);
  useEffect(() => {
    onLeaveRequestReady?.((reason, closeWorkspace = false) => requestLeave(reason, closeWorkspace));
  }, [onLeaveRequestReady, requestLeave]);

  useEffect(() => {
    const handleLocalSaveComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ changedProfileIds?: string[] }>).detail;
      const pending = pendingSaveRef.current;
      if (!pending || !detail?.changedProfileIds?.includes(pending.profileId)) return;
      setSavedTypes(pending.types);
      setSavedCategories(pending.categories);
      setSaving(false);
      setRetryPending(false);
      saveFailureRef.current = 'none';
      const latestDraftWasSaved =
        JSON.stringify(draftTypes) === JSON.stringify(pending.types) &&
        JSON.stringify(draftCategories) === JSON.stringify(pending.categories) &&
        !newTypeName.trim() &&
        !newCategoryName.trim() &&
        !(categoryRenameDraft && normalizeSetupName(categoryRenameDraft.name) !== normalizeSetupName(categoryRenameDraft.originalName));
      setStatusMessage(latestDraftWasSaved
        ? 'Work setup saved for this profile.'
        : 'Earlier changes saved. Save again to keep your latest edits.');
      pendingSaveRef.current = null;
      pending.resolve?.(true);
      const leaveResolver = leaveResolverRef.current;
      if (leaveResolver && latestDraftWasSaved) {
        const closeWorkspace = leaveCloseWorkspaceRef.current;
        leaveResolverRef.current = null;
        leaveCloseWorkspaceRef.current = true;
        setLeaveDialogOpen(false);
        leaveResolver(true);
        if (closeWorkspace) onClose();
      }
    };
    const handleStorageError = (event: Event) => {
      const pending = pendingSaveRef.current;
      if (!pending || pending.profileId !== profileId) return;
      const detail = (event as CustomEvent<string>).detail;
      setSaving(false);
      setRetryPending(true);
      saveFailureRef.current = 'retry';
      setStatusMessage(`${typeof detail === 'string' && detail.trim() ? detail : 'Caizen could not save your changes.'} Your changes are still here. Caizen will retry automatically.`);
      pending.resolve?.(false);
      pending.resolve = undefined;
    };
    window.addEventListener('caizen:local-save-complete', handleLocalSaveComplete);
    window.addEventListener('caizen-storage-error', handleStorageError);
    return () => {
      window.removeEventListener('caizen:local-save-complete', handleLocalSaveComplete);
      window.removeEventListener('caizen-storage-error', handleStorageError);
    };
  }, [categoryRenameDraft, draftCategories, draftTypes, newCategoryName, newTypeName, onClose, profileId]);

  useEffect(() => {
    activeElementBeforeSetupRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => {
      const previousElement = activeElementBeforeSetupRef.current;
      window.requestAnimationFrame(() => {
        if (previousElement?.isConnected) {
          previousElement.focus({ preventScroll: true });
          return;
        }
        document.querySelector<HTMLElement>('[data-caizen-work-setup-trigger]')?.focus({ preventScroll: true });
      });
    };
  }, []);

  const stepBack = useCallback(() => {
    if (section !== 'work-types') {
      setSection('work-types');
      setMobileStep('type-list');
      return;
    }
    if (mobileStep === 'field-editor') {
      setMobileStep('type-editor');
      return;
    }
    if (mobileStep === 'type-editor') {
      setMobileStep('type-list');
      return;
    }
    void requestLeave();
  }, [mobileStep, requestLeave, section]);

  useEffect(() => {
    if (!onBackRequestReady) return;
    onBackRequestReady(stepBack);
    return () => onBackRequestReady(null);
  }, [onBackRequestReady, stepBack]);

  useEffect(() => {
    if (onBackRequestReady) return;
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
    window.addEventListener('caizen:native-back-request', handleBack);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('caizen:native-back-request', handleBack);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onBackRequestReady, stepBack]);

  const changeSection = (next: SetupSection) => {
    setSection(next);
    setMobileStep('type-list');
    if (next === 'work-types') {
      const first = draftTypes.find(type => type.kind === kind && !type.archived)
        || draftTypes.find(type => !type.archived);
      if (first) {
        setKind(first.kind);
        setSelectedTypeId(first.id);
      }
    }
  };

  const selectKind = (nextKind: WorkRecordKind) => {
    setKind(nextKind);
    const first = draftTypes.find(type => type.kind === nextKind && !type.archived)
      || draftTypes.find(type => type.kind === nextKind);
    setSelectedTypeId(first?.id || '');
    setSelectedFieldId('');
    setMobileStep('type-list');
  };

  const createType = () => {
    const name = normalizeSetupName(newTypeName);
    if (!name) {
      setStatusMessage('Enter a type name.');
      return;
    }
    if (draftTypes.some(type => type.kind === kind && normalizeSetupName(type.name).toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setStatusMessage(kind === 'note' ? 'A Note type already uses this name. Choose a different name.' : 'A Resource type already uses this name. Choose a different name.');
      return;
    }
    const next: WorkTypeDefinition = {
      id: createEntityId('work-type'),
      name,
      kind,
      fields: [],
    };
    setDraftTypes(current => [...current, next]);
    setSelectedTypeId(next.id);
    setSelectedFieldId('');
    setNewTypeName('');
    setNewTypeOpen(false);
    setMobileStep('type-editor');
    setStatusMessage('');
  };

  const addPreset = (presetId: string) => {
    const result = addMissingPresetWorkTypes(draftTypes, presetId);
    if (!result.added.length) {
      setStatusMessage('No types added. All types in this preset already exist, including any archived types. Find them under Work Types.');
      return;
    }
    setDraftTypes(result.next);
    setStatusMessage(result.skipped
      ? `${result.added.length} ${result.added.length === 1 ? 'type added' : 'types added'}. ${result.skipped} ${result.skipped === 1 ? 'existing type kept' : 'existing types kept'}. Save changes to keep the additions.`
      : `${result.added.length} ${result.added.length === 1 ? 'type added' : 'types added'}. Save changes to keep the additions.`);
  };

  const addCategory = () => {
    const name = normalizeSetupName(newCategoryName);
    if (!name) {
      setStatusMessage('Enter a category name.');
      return;
    }
    if (draftCategories.some(category => normalizeSetupName(category.name).toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setStatusMessage('A category already uses this name. Choose a different name.');
      return;
    }
    setDraftCategories(current => [...current, {
      id: createTaxonomyId(name),
      name,
      subcategories: [],
      archivedSubcategories: [],
      customSubcategories: [],
    }]);
    setNewCategoryName('');
    setStatusMessage('');
  };

  const renameCategory = (id: string, name: string) => {
    const cleanName = normalizeSetupName(name);
    if (!cleanName) {
      setStatusMessage('Enter a category name.');
      return false;
    }
    if (draftCategories.some(category => category.id !== id && normalizeSetupName(category.name).toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      setStatusMessage('A category already uses this name. Choose a different name.');
      return false;
    }
    setDraftCategories(current => current.map(category => category.id === id ? { ...category, name: cleanName } : category));
    setStatusMessage('');
    return true;
  };

  const beginCategoryRename = (category: ModuleTaxonomyCategory) => {
    setCategoryRenameDraft({ id: category.id, name: category.name, originalName: category.name });
    setStatusMessage('');
  };

  const updateCategoryRename = (id: string, name: string) => {
    setCategoryRenameDraft(current => current?.id === id ? { ...current, name } : current);
    setStatusMessage('');
  };

  const saveCategoryRename = (id: string) => {
    if (!categoryRenameDraft || categoryRenameDraft.id !== id) return;
    if (renameCategory(id, categoryRenameDraft.name)) setCategoryRenameDraft(null);
  };

  const toggleCategoryArchived = (id: string) => {
    setDraftCategories(current => current.map(category => category.id === id ? { ...category, archived: !category.archived } : category));
    setStatusMessage('');
  };

  const restoreDefaults = () => {
    if (!resetTarget) return;
    const restored = restoreBuiltInWorkTypeDefaults(resetTarget);
    updateSelectedType(restored);
    setResetTarget(null);
    setStatusMessage('Defaults restored; existing fields are now archived. Save changes to keep this setup.');
  };

  const canRestoreDefaults = Boolean(
    selectedType?.builtIn &&
    JSON.stringify(serializeWorkTypeOverrides([selectedType])) !==
      JSON.stringify(serializeWorkTypeOverrides(BUILT_IN_WORK_TYPES.filter(type => type.id === selectedType.id))),
  );

  return (
    <section
      className={`work-setup-workspace @container/setup-workspace mx-auto flex w-full min-w-0 max-w-6xl ${embedded ? 'min-h-0 flex-1' : 'min-h-[calc(var(--cz-vh,100dvh)_-_7rem)]'} flex-col gap-6 ${androidPresentation ? 'android-workhub' : ''}`}
      data-caizen-nested-flow="open"
      data-android-screen={androidPresentation ? 'workhub' : undefined}
      aria-label="Work setup"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/55 pb-4">
        <div className="min-w-0">
          {!embedded ? <Button ref={setupBackButtonRef} type="button" variant="ghost" onClick={() => void requestLeave()} className="-ml-3 mb-2 min-h-11 rounded-xl px-3">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to Work Hub
          </Button> : null}
          <h1 className="text-page-title">Work setup</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Customize this profile’s Work Types, fields, and categories.</p>
        </div>
      </header>

      <div className="grid min-w-0 gap-6">
        <nav className="flex flex-wrap gap-1" aria-label="Work setup destinations">
          <SetupNavButton active={section === 'work-types'} onClick={() => changeSection('work-types')}>Work Types</SetupNavButton>
          <SetupNavButton active={section === 'categories'} onClick={() => changeSection('categories')}>Categories</SetupNavButton>
          <SetupNavButton active={section === 'presets'} onClick={() => changeSection('presets')}>Presets</SetupNavButton>
        </nav>

        <div ref={setupContentRef} className="@container/setup-content min-w-0">
          {section === 'work-types' ? (
            <div className="grid min-w-0 gap-6 @min-[48rem]/setup-content:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @min-[64rem]/setup-content:gap-8">
              <aside className={mobileStep === 'type-list' ? 'min-w-0' : 'hidden min-w-0 @min-[48rem]/setup-content:block'} aria-label="Work Type list">
                <div className="mb-6 grid gap-3">
                  <SegmentedControl
                    label="Work Type group"
                    value={kind}
                    onValueChange={value => selectKind(value as WorkRecordKind)}
                    options={[{ value: 'note', label: 'Notes' }, { value: 'resource', label: 'Resources' }]}
                    className="w-full"
                  />
                  <SearchField
                    value={typeQuery}
                    onChange={setTypeQuery}
                    placeholder="Search types"
                    aria-label="Search Work Types"
                    surface="solid"
                  />
                  <Button type="button" variant="outline" aria-expanded={newTypeOpen} aria-controls="new-work-type" onClick={() => { setNewTypeOpen(open => !open); setMobileStep('type-list'); }} className="min-h-11 w-full justify-start rounded-xl">
                    <Plus className="size-4" aria-hidden="true" /> New {kind === 'note' ? 'Note' : 'Resource'} type
                  </Button>
                  {newTypeOpen ? (
                    <div id="new-work-type" className="grid gap-2">
                      <label className="grid gap-1.5 text-sm font-semibold">Type name<Input autoFocus value={newTypeName} onChange={event => setNewTypeName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); createType(); } }} maxLength={80} aria-describedby="new-work-type-help" className={INPUT} /></label>
                      <p id="new-work-type-help" className="text-xs text-muted-foreground">{kind === 'note' ? 'Use a different name for each Note type, including archived types.' : 'Use a different name for each Resource type, including archived types.'}</p>
                      <Button type="button" onClick={createType} className="min-h-11 rounded-xl">Create type</Button>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {activeTypes.map(type => <WorkTypeRow key={type.id} type={type} selected={type.id === selectedTypeId} onClick={() => { setSelectedTypeId(type.id); setSelectedFieldId(''); setMobileStep('type-editor'); }} />)}
                  {!activeTypes.length ? <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">{typeQuery.trim() ? 'No active types match. Clear the search or check Archived types.' : 'No active types. Create a type, add one from Presets, or restore an archived type.'}</p> : null}
                </div>
                {archivedTypes.length ? (
                  <details className="group mt-3 border-t border-border/55 pt-2" open={showArchived} onToggle={event => setShowArchived(event.currentTarget.open)}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"><span>Archived types ({archivedTypes.length})</span><ChevronDown className="size-4 group-open:rotate-180" aria-hidden="true" /></summary>
                    <div className="space-y-1 pt-1">{archivedTypes.map(type => <WorkTypeRow key={type.id} type={type} selected={type.id === selectedTypeId} onClick={() => { setSelectedTypeId(type.id); setSelectedFieldId(''); setMobileStep('type-editor'); }} />)}</div>
                  </details>
                ) : null}
              </aside>

              <main className={mobileStep === 'type-editor' || mobileStep === 'field-editor' ? 'min-w-0' : 'hidden min-w-0 @min-[48rem]/setup-content:block'}>
                <div className="mb-3 flex items-center justify-between gap-2 @min-[48rem]/setup-content:hidden">
                  <Button type="button" variant="ghost" onClick={() => setMobileStep(mobileStep === 'field-editor' ? 'type-editor' : 'type-list')} className="min-h-11 min-w-0 whitespace-normal rounded-xl px-2 text-left [overflow-wrap:anywhere]"><ArrowLeft className="size-4" aria-hidden="true" />{mobileStep === 'field-editor' ? selectedType?.name || 'Work Type' : 'Work Types'}</Button>
                </div>
                {selectedType ? (
                  <section className="min-w-0">
                    <div className="mb-5 grid min-w-0 gap-3 @min-[64rem]/setup-content:grid-cols-[minmax(0,1fr)_auto] @min-[64rem]/setup-content:items-start">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{compactLayout && mobileStep === 'field-editor' ? 'Edit field' : selectedType.name}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedType.builtIn ? (canRestoreDefaults ? 'Customized for this profile' : 'Built-in type') : 'Custom Work Type'}
                          {selectedType.archived ? ' · Archived' : ''}
                        </p>
                        {selectedType.archived ? <p className="mt-2 max-w-prose text-sm text-muted-foreground">Existing records keep this type. Restore it to use it for new records.</p> : null}
                      </div>
                      {!compactLayout || mobileStep !== 'field-editor' ? (
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => updateSelectedType({ ...selectedType, archived: !selectedType.archived })} className="min-h-11 rounded-xl">{selectedType.archived ? 'Restore type' : 'Archive type'}</Button>
                          {canRestoreDefaults ? <Button type="button" variant="outline" onClick={() => setResetTarget(selectedType)} className="min-h-11 rounded-xl">Restore built-in defaults</Button> : null}
                        </div>
                      ) : null}
                    </div>
                    <WorkTypeEditor
                      key={selectedType.id}
                      value={selectedType}
                      onChange={updateSelectedType}
                      fieldValueCounts={fieldValueCounts}
                      selectedFieldId={selectedFieldId}
                      onSelectField={selectField}
                      mobileFieldOnly={compactLayout && mobileStep === 'field-editor'}
                    />
                  </section>
                ) : (
                  <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/60 p-6 text-center">
                    <div><h2 className="font-semibold">Choose a Work Type</h2><p className="mt-1 text-sm text-muted-foreground">Choose a type from the list to edit its name, description, and fields.</p></div>
                  </div>
                )}
              </main>
            </div>
          ) : null}

          {section === 'categories' ? (
            <CategoriesWorkspace
              categories={draftCategories}
              usage={categoryUsage}
              newName={newCategoryName}
              onNewNameChange={setNewCategoryName}
              onAdd={addCategory}
              renameDraft={categoryRenameDraft}
              onBeginRename={beginCategoryRename}
              onRenameValue={updateCategoryRename}
              onSaveRename={saveCategoryRename}
              onCancelRename={() => setCategoryRenameDraft(null)}
              onToggleArchived={toggleCategoryArchived}
            />
          ) : null}

          {section === 'presets' ? (
            <PresetsWorkspace
              onAdd={addPreset}
              workTypes={draftTypes}
            />
          ) : null}
        </div>
      </div>

      {statusMessage ? <p role="status" aria-live="polite" className="text-sm font-semibold text-muted-foreground">{statusMessage}</p> : null}
      {dirty || saving ? (
        <div className="sticky bottom-0 z-20 mt-auto grid min-w-0 gap-3 border-t border-border/60 bg-background/95 px-3 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/85 @min-[36rem]/setup-workspace:grid-cols-[minmax(0,1fr)_auto] @min-[36rem]/setup-workspace:items-center">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {saving ? 'Saving changes…' : retryPending ? 'Changes are not saved yet. Caizen will retry automatically.' : 'You have unsaved changes.'}
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-2 @min-[36rem]/setup-workspace:flex @min-[36rem]/setup-workspace:flex-wrap">
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={discardDraft} className="min-h-11 whitespace-normal rounded-xl">Discard changes</Button>
            <Button type="button" disabled={!dirty || saving || retryPending} onClick={() => void saveDraft()} className="min-h-11 rounded-xl">{saving ? 'Saving…' : retryPending ? 'Retry pending' : 'Save changes'}</Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={leaveDialogOpen}
        title="Save changes before leaving?"
        message={`This profile has unsaved Work setup changes. Save them before continuing to ${leaveDestination}, or discard them. Previously saved setup stays intact.`}
        details={<div className="grid gap-2"><Button type="button" disabled={saving || retryPending} onClick={saveAndLeave} className="min-h-11 rounded-xl">{saving ? 'Saving…' : retryPending ? 'Retry pending' : 'Save changes and leave'}</Button></div>}
        confirmText="Discard changes and leave"
        cancelText="Keep editing"
        confirmDisabled={saving}
        isDangerous
        onConfirm={discardAndLeave}
        onCancel={keepEditing}
      />
      <ConfirmDialog
        isOpen={Boolean(resetTarget)}
        title="Restore built-in defaults?"
        message="Restore this type’s original name, description, and icon, and make it active. Its fields move to Archived fields; saved values remain readable on existing records. Notes and Resources keep their assigned Work Type. Save changes to keep the restored setup."
        confirmText="Restore defaults"
        cancelText="Keep customized"
        isDangerous={false}
        onConfirm={restoreDefaults}
        onCancel={() => setResetTarget(null)}
      />
    </section>
  );
}

function SetupNavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <Button type="button" variant="ghost" aria-current={active ? 'page' : undefined} onClick={onClick} className={`min-h-11 rounded-xl px-3 ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>{children}</Button>;
}

function WorkTypeRow({ type, selected, onClick }: { type: WorkTypeDefinition; selected: boolean; onClick: () => void }) {
  const activeFieldCount = type.fields.filter(field => !field.archived).length;
  return <button type="button" onClick={onClick} aria-pressed={selected} aria-label={`${type.name}, ${type.builtIn ? 'built-in' : 'custom'}, ${activeFieldCount} ${activeFieldCount === 1 ? 'active field' : 'active fields'}${type.archived ? ', archived' : ''}`} className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 ${selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/55'}`}>
    {type.kind === 'note' ? <FileText className="size-4 shrink-0" aria-hidden="true" /> : <BriefcaseBusiness className="size-4 shrink-0" aria-hidden="true" />}
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold [overflow-wrap:anywhere]">{type.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{type.builtIn ? 'Built-in' : 'Custom'} · {activeFieldCount} {activeFieldCount === 1 ? 'field' : 'fields'}</span></span>
    {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
  </button>;
}

function CategoriesWorkspace({ categories, usage, newName, onNewNameChange, onAdd, renameDraft, onBeginRename, onRenameValue, onSaveRename, onCancelRename, onToggleArchived }: {
  categories: ModuleTaxonomyCategory[];
  usage: { active: Record<string, number>; trash: Record<string, number> };
  newName: string;
  onNewNameChange: (name: string) => void;
  onAdd: () => void;
  renameDraft: CategoryRenameDraft | null;
  onBeginRename: (category: ModuleTaxonomyCategory) => void;
  onRenameValue: (id: string, value: string) => void;
  onSaveRename: (id: string) => void;
  onCancelRename: () => void;
  onToggleArchived: (id: string) => void;
}) {
  const active = categories.filter(category => !category.archived);
  const archived = categories.filter(category => category.archived);
  return <section className="min-w-0 max-w-4xl">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Categories</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Group Notes and Resources by area of work. Archived categories stay on existing records.</p></div>
    </div>
    <form className="mb-5 flex flex-col gap-2 @min-[36rem]/setup-content:flex-row @min-[36rem]/setup-content:items-end" onSubmit={event => { event.preventDefault(); onAdd(); }}>
      <div className="grid min-w-0 flex-1 gap-1.5"><label htmlFor="new-work-category" className="text-sm font-semibold">Category name</label><Input id="new-work-category" value={newName} onChange={event => onNewNameChange(event.target.value)} maxLength={80} placeholder="e.g. Client work" className={INPUT} /></div>
      <Button type="submit" className="min-h-11 shrink-0 rounded-xl"><Plus className="size-4" aria-hidden="true" />Add category</Button>
    </form>
    <div className="space-y-5">
      <CategoryGroup title="Active" categories={active} usage={usage} renameDraft={renameDraft} onRenameValue={onRenameValue} onBeginRename={onBeginRename} onSaveName={onSaveRename} onCancelRename={onCancelRename} onToggleArchived={onToggleArchived} />
      {archived.length ? <details className="group border-t border-border/55 pt-2"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-1 text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"><span>Archived categories ({archived.length})</span><ChevronDown className="size-4 group-open:rotate-180" aria-hidden="true" /></summary><CategoryGroup categories={archived} usage={usage} renameDraft={renameDraft} onRenameValue={onRenameValue} onBeginRename={onBeginRename} onSaveName={onSaveRename} onCancelRename={onCancelRename} onToggleArchived={onToggleArchived} /></details> : null}
      {!categories.length ? <p className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">No categories yet. Add one above, or keep your records uncategorized.</p> : null}
    </div>
  </section>;
}

function CategoryGroup({ title, categories, usage, renameDraft, onRenameValue, onBeginRename, onSaveName, onCancelRename, onToggleArchived }: {
  title?: string;
  categories: ModuleTaxonomyCategory[];
  usage: { active: Record<string, number>; trash: Record<string, number> };
  renameDraft: CategoryRenameDraft | null;
  onRenameValue: (id: string, value: string) => void;
  onBeginRename: (category: ModuleTaxonomyCategory) => void;
  onSaveName: (id: string) => void;
  onCancelRename: () => void;
  onToggleArchived: (id: string) => void;
}) {
  if (!categories.length) return null;
  return <section>{title ? <h3 className="mb-2 px-1 text-sm font-medium text-muted-foreground">{title}</h3> : null}<div className="divide-y divide-border/55">{categories.map(category => <article key={category.id} className="flex flex-col gap-3 py-4 @min-[40rem]/setup-content:flex-row @min-[40rem]/setup-content:items-center">
    <div className="min-w-0 flex-1">{renameDraft?.id === category.id ? <div className="grid min-w-0 grid-cols-2 gap-2 @min-[48rem]/setup-content:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="sr-only" htmlFor={`rename-category-${category.id}`}>Rename {category.name}</label><Input id={`rename-category-${category.id}`} autoFocus value={renameDraft.name} onChange={event => onRenameValue(category.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSaveName(category.id); } }} maxLength={80} className={`${INPUT} col-span-2 min-w-0 @min-[48rem]/setup-content:col-span-1`} /><Button type="button" onClick={() => onSaveName(category.id)} className="min-h-11 rounded-xl">Apply name</Button><Button type="button" variant="ghost" onClick={onCancelRename} className="min-h-11 rounded-xl">Cancel</Button></div> : <><h4 className="font-bold [overflow-wrap:anywhere]">{category.name}</h4><p className="mt-1 text-xs text-muted-foreground">{usage.active[category.id] || 0} {(usage.active[category.id] || 0) === 1 ? 'active record' : 'active records'} · {usage.trash[category.id] || 0} in Trash</p></>}</div>
    {renameDraft?.id !== category.id ? <div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => onBeginRename(category)} className="min-h-11 rounded-xl">Rename</Button><Button type="button" variant="outline" onClick={() => onToggleArchived(category.id)} className="min-h-11 rounded-xl">{category.archived ? 'Restore' : 'Archive'}</Button></div> : null}
  </article>)}</div></section>;
}

function PresetsWorkspace({ workTypes, onAdd }: { workTypes: WorkTypeDefinition[]; onAdd: (id: string) => void }) {
  return <section className="min-w-0 max-w-4xl">
    <div className="mb-5"><h2 className="text-lg font-semibold">Presets</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Add ready-made Work Types, then customize them. Existing types, including archived types, are kept.</p></div>
    <div className="divide-y divide-border/55">{WORK_TYPE_PRESETS.map(preset => {
      const existing = preset.types.filter(candidate => workTypes.some(type => type.kind === candidate.kind && normalizeSetupName(type.name).toLocaleLowerCase() === normalizeSetupName(candidate.name).toLocaleLowerCase())).length;
      return <article key={preset.id} className="grid min-w-0 gap-3 py-5 @min-[40rem]/setup-content:grid-cols-[minmax(0,1fr)_auto] @min-[40rem]/setup-content:items-start">
        <div className="min-w-0"><h3 className="text-base font-semibold">{preset.label}{preset.id === 'general' ? <span className="ml-2 text-body-sm font-normal text-muted-foreground">Start here</span> : null}</h3><p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{preset.types.map((type, index) => <li key={`${type.kind}-${type.name}-${index}`} className="flex items-center gap-2 text-sm"><span className="text-xs text-muted-foreground">{type.kind === 'note' ? 'Note' : 'Resource'}</span><span>{type.name}</span></li>)}</ul></div>
        <Button type="button" variant="outline" aria-label={existing === preset.types.length ? `Check types in ${preset.label} preset` : `Add missing types from ${preset.label} preset`} onClick={() => onAdd(preset.id)} className="min-h-11 shrink-0 justify-between gap-3 rounded-xl">{existing === preset.types.length ? 'Check types' : 'Add missing types'}<ArrowRight className="size-4" aria-hidden="true" /></Button>
      </article>;
    })}</div>
  </section>;
}

function isTypeableWorkItem(item: WorkItem) {
  return item.type === 'note' || item.type === 'report' || item.type === 'file' || item.type === 'note_file' || item.type === 'presentation' || item.type === 'ticket' || item.type === 'test_data' || item.type === 'template';
}

function recordsFromTrashData(data: unknown): WorkItem[] {
  const candidates = Array.isArray(data) ? data : [data];
  return candidates.filter((value): value is WorkItem => Boolean(value && typeof value === 'object' && typeof (value as WorkItem).id === 'string' && typeof (value as WorkItem).type === 'string'));
}
