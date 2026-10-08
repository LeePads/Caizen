'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { CategoryManagementEditor } from '@/components/balance/CategoryManagementModal';
import { InventoryStorageLocationSettingsButton } from '@/components/common/InventoryStorageLocationSettingsButton';
import { TaxonomyWorkspace, type TaxonomyWorkspaceProps } from '@/components/common/TaxonomyWorkspace';
import {
  TAXONOMY_HUB_OPEN_EVENT,
  type TaxonomyHubArea,
  type TaxonomyHubPanel,
  type TaxonomyHubRequest,
} from '@/components/common/taxonomy-hub-events';
import { Button } from '@/components/ui/button';
import { SectionTabs } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import WorkSetupWorkspace from '@/components/work/WorkSetupWorkspace';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useEditorLeaveGuard } from '@/hooks/use-editor-leave-guard';
import { useAppContext } from '@/lib/context';
import { createDefaultFinancialCategories } from '@/lib/finance/default-categories';
import { getInventoryCategoryEditorValue, INVENTORY_TAXONOMY_DEFAULTS } from '@/lib/collections/inventory-taxonomy';
import { DEFAULT_SUPPLEMENT_TYPES } from '@/components/common/SupplementTypeSettingsButton';
import { DEFAULT_SKINCARE_CATEGORIES, SKINCARE_PRODUCT_TYPES } from '@/lib/skincare/taxonomy';
import { resolveWorkTypes } from '@/lib/workhub/work-types';
import type { FinancialCategoryMutationResult } from '@/lib/balance';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { normalizePersonalVaultTaxonomy } from '@/lib/personal-vault/normalization';
import { PERSONAL_VAULT_SECTION_OPTIONS, PERSONAL_VAULT_TAXONOMY_DEFAULTS, personalVaultCategoryLabel } from '@/lib/personal-vault/taxonomy';
import type { PersonalVaultType } from '@/lib/types';

const AREA_TABS: Array<{ id: TaxonomyHubArea; label: string }> = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'skincare', label: 'Skincare' },
  { id: 'money', label: 'Money' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'work-hub', label: 'Work Hub' },
  { id: 'personal-vault', label: 'Personal Vault' },
];

const AREA_LABELS: Record<TaxonomyHubArea, string> = {
  inventory: 'Inventory',
  skincare: 'Skincare',
  money: 'Money',
  supplements: 'Supplements',
  'work-hub': 'Work Hub',
  'personal-vault': 'Personal Vault',
};

const defaultPanel = (area: TaxonomyHubArea): TaxonomyHubPanel => {
  if (area === 'inventory') return 'categories';
  if (area === 'skincare') return 'categories';
  if (area === 'supplements') return 'units';
  if (area === 'work-hub') return 'work-types';
  return 'categories';
};

function ProductTypesReadOnly() {
  return (
    <section className="w-full space-y-4">
      <div>
        <h2 className="text-section-title">Product types</h2>
        <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">These product types are fixed. Choose Categories to add or rename your own labels.</p>
      </div>
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {SKINCARE_PRODUCT_TYPES.map(type => (
          <li key={type.value} className="text-sm font-medium">{type.label}</li>
        ))}
      </ul>
    </section>
  );
}

export default function TaxonomyHub({ androidPresentation = false }: { androidPresentation?: boolean }) {
  const context = useAppContext();
  const { profiles, currentProfileId, updateProfile } = context;
  const profile = profiles.find(item => item.id === currentProfileId);
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<TaxonomyHubRequest>({ area: 'inventory', panel: 'categories' });
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const backRequestRef = useRef<(() => void) | null>(null);
  const transitionRef = useRef(false);
  const profileIdRef = useRef(currentProfileId);
  profileIdRef.current = currentProfileId;
  const transitionRequestRef = useRef<(next: TaxonomyHubRequest) => Promise<void>>(async () => {});
  const [storageError, setStorageError] = useState(false);
  const [moneyStatus, setMoneyStatus] = useState('');
  const [localSaveStatus, setLocalSaveStatus] = useState('');
  const { confirmingLeave, onDraftChange, requestLeave, resolveLeave } = useEditorLeaveGuard(open ? currentProfileId : null);
  const openRef = useRef(open);
  const requestRef = useRef(request);
  openRef.current = open;
  requestRef.current = request;
  const workLeaveRequestRef = useRef<(
    (reason: 'section-navigation' | 'profile-switch' | 'profile-route', closeWorkspace?: boolean) => Promise<boolean>
  ) | null>(null);
  const { close: closeAfterMotion, isClosing } = useAnimatedOverlayClose({ isOpen: open, onClose: () => setOpen(false), duration: 160 });

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<TaxonomyHubRequest>).detail;
      if (!detail) return;
      const nextRequest = { area: detail.area, panel: detail.panel || defaultPanel(detail.area), taxonomy: detail.taxonomy, section: detail.section };
      if (openRef.current) {
        void transitionRequestRef.current(nextRequest);
        return;
      }
      workLeaveRequestRef.current = null;
      setRequest(nextRequest);
      setOpen(true);
    };
    window.addEventListener(TAXONOMY_HUB_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(TAXONOMY_HUB_OPEN_EVENT, handleOpen);
  }, []);

  const requestEditorLeave = useCallback(async () => {
    if (requestRef.current.area === 'work-hub' && workLeaveRequestRef.current) {
      return workLeaveRequestRef.current('section-navigation', false);
    }
    return requestLeave();
  }, [requestLeave]);

  const transitionTo = useCallback(async (next: TaxonomyHubRequest) => {
    if (transitionRef.current || isClosing) return;
    const current = requestRef.current;
    if (current.area === next.area && current.panel === next.panel && current.section === next.section) return;
    const profileId = currentProfileId;
    transitionRef.current = true;
    try {
      if (!await requestEditorLeave() || !openRef.current || profileId !== profileIdRef.current) return;
      onDraftChange(false);
      backRequestRef.current = null;
      workLeaveRequestRef.current = null;
      setMoneyStatus('');
      setRequest(next);
    } catch {
      setLocalSaveStatus('Could not leave this editor. Keep editing and try again.');
    } finally { transitionRef.current = false; }
  }, [currentProfileId, isClosing, onDraftChange, requestEditorLeave]);
  transitionRequestRef.current = transitionTo;

  const closeHub = useCallback(async () => {
    if (isClosing || transitionRef.current) return;
    transitionRef.current = true;
    try {
      if (await requestEditorLeave()) closeAfterMotion();
    } catch {
      setLocalSaveStatus('Could not close this editor. Keep editing and try again.');
    } finally { transitionRef.current = false; }
  }, [closeAfterMotion, isClosing, requestEditorLeave]);

  const selectArea = useCallback(async (area: TaxonomyHubArea) => {
    if (area === request.area) return;
    await transitionTo({ area, panel: defaultPanel(area) });
  }, [request.area, transitionTo]);

  const selectPanel = (panel: TaxonomyHubPanel) => void transitionTo({ ...request, panel });
  const registerBackRequest = useCallback((back: (() => void) | null) => { backRequestRef.current = back; }, []);
  const requestWorkspaceNavigation = useCallback((navigate: () => void) => {
    if (transitionRef.current || isClosing) return;
    const profileId = currentProfileId;
    transitionRef.current = true;
    void requestEditorLeave().then(allow => {
      transitionRef.current = false;
      if (allow && openRef.current && profileId === profileIdRef.current) navigate();
    }).catch(() => {
      setLocalSaveStatus('Could not leave this editor. Keep editing and try again.');
    }).finally(() => { transitionRef.current = false; });
  }, [currentProfileId, isClosing, requestEditorLeave]);
  const requestBack = useCallback(() => {
    const back = backRequestRef.current;
    if (!back) void closeHub();
    else if (requestRef.current.area === 'work-hub') back();
    else requestWorkspaceNavigation(back);
  }, [closeHub, requestWorkspaceNavigation]);

  useOverlayLifecycle(open, requestBack, {
    containerRef: panelRef,
    initialFocusSelector: '[data-hub-title]',
    deferEscapeKeyDown: event => {
      // Radix menus and selectors own dismissal while their portals are open.
      return Boolean(document.querySelector('[data-slot="select-content"][data-state="open"], [data-slot="dropdown-menu-content"][data-state="open"], [data-radix-popper-content-wrapper]') || (event.target instanceof HTMLElement && event.target.closest('select')));
    },
  });

  useEffect(() => {
    if (!open) return;
    const handleBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean; kind: 'overlay' | 'nested-flow' }>).detail;
      if (!detail || detail.handled || detail.kind !== 'nested-flow') return;
      if (!backRequestRef.current && document.querySelector('[data-caizen-nested-flow="open"] [data-caizen-nested-flow="open"]')) return;
      detail.handled = true;
      requestBack();
    };
    window.addEventListener('caizen:native-back-request', handleBack);
    return () => {
      window.removeEventListener('caizen:native-back-request', handleBack);
    };
  }, [open, requestBack]);

  useEffect(() => {
    setStorageError(false);
    setLocalSaveStatus('');
    if (!open) return;
    const handleStorageError = () => setStorageError(true);
    const handleSaveComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ changedProfileIds?: string[] }>).detail;
      if (!detail?.changedProfileIds?.includes(currentProfileId)) return;
      setStorageError(false);
      setLocalSaveStatus('Saved on this device.');
    };
    window.addEventListener('caizen-storage-error', handleStorageError);
    window.addEventListener('caizen:local-save-complete', handleSaveComplete);
    return () => {
      window.removeEventListener('caizen-storage-error', handleStorageError);
      window.removeEventListener('caizen:local-save-complete', handleSaveComplete);
    };
  }, [currentProfileId, open]);

  const launchedTaxonomy = request.taxonomy;
  const inventoryTaxonomy: TaxonomyWorkspaceProps = launchedTaxonomy?.module === 'inventory'
    ? launchedTaxonomy
    : {
        module: 'inventory',
        defaults: INVENTORY_TAXONOMY_DEFAULTS,
        observed: (profile?.inventoryItems || []).map(item => ({ category: getInventoryCategoryEditorValue(item.category), subcategory: item.subCategory })),
        onRenameCategory: context.renameInventoryCategoryRecords,
        onRenameSubcategory: context.renameInventorySubcategoryRecords,
      };
  const skincareTaxonomy: TaxonomyWorkspaceProps = launchedTaxonomy?.module === 'skincare'
    ? launchedTaxonomy
    : {
        module: 'skincare',
        defaults: DEFAULT_SKINCARE_CATEGORIES,
        observed: (profile?.skincareProducts || []).map(product => ({ category: product.category })),
        showSubcategories: false,
        onRenameCategory: context.renameSkincareCategoryRecords,
      };
  const supplementTypeTaxonomy: TaxonomyWorkspaceProps = launchedTaxonomy?.module === 'supplement-types'
    ? launchedTaxonomy
    : {
        module: 'supplement-types',
        displayName: 'Supplement types',
        manageLabel: 'Manage types',
        itemSingular: 'type',
        defaults: DEFAULT_SUPPLEMENT_TYPES,
        observed: (profile?.supplements || []).map(item => ({ category: item.type })),
        showSubcategories: false,
        allowRenameCategory: false,
        allowRenameSubcategory: false,
      };
  const supplementUnitTaxonomy: TaxonomyWorkspaceProps = launchedTaxonomy?.module === 'supplements'
    ? launchedTaxonomy
    : {
        module: 'supplements',
        displayName: 'Dosage units',
        manageLabel: 'Manage units',
        itemSingular: 'unit',
        defaults: ['capsules', 'tablets', 'ml'],
        observed: (profile?.supplements || []).map(item => ({ category: item.dosageUnit })),
        blockInUseCategoryRename: true,
        showSubcategories: false,
      };

  const personalVaultSection: PersonalVaultType = PERSONAL_VAULT_SECTION_OPTIONS
    .find(option => option.value === request.section)?.value || 'document';
  const personalVaultTaxonomy: TaxonomyWorkspaceProps = {
    module: 'personal',
    displayName: 'Personal Vault',
    manageLabel: 'Manage categories',
    itemSingular: 'section category',
    defaults: { [personalVaultSection]: PERSONAL_VAULT_TAXONOMY_DEFAULTS[personalVaultSection] },
    focusedCategoryName: personalVaultSection,
    subcategoryLabel: personalVaultCategoryLabel,
    allowRenameCategory: false,
    observed: (profile?.personalVaultItems || [])
      .filter(item => item.type === personalVaultSection)
      .map(item => ({ category: item.type, subcategory: item.subType })),
    persistence: profile ? {
      value: normalizePersonalVaultTaxonomy(profile.personalVaultTaxonomy)
        .filter(category => category.name === personalVaultSection),
      migrateLegacy: false,
      onChange: categories => {
        const existing = normalizePersonalVaultTaxonomy(profile.personalVaultTaxonomy);
        const merged = [
          ...existing.filter(category => category.name !== personalVaultSection),
          ...categories,
        ];
        updateProfile(profile.id, { personalVaultTaxonomy: normalizePersonalVaultTaxonomy(merged) });
      },
    } : undefined,
    onRenameSubcategory: (_category, from, to) => {
      if (!profile) return;
      updateProfile(profile.id, {
        personalVaultItems: (profile.personalVaultItems || []).map(item =>
          item.type === personalVaultSection && item.subType === from
            ? { ...item, subType: to }
            : item,
        ),
      });
    },
  };

  const persistMoneyCategories = (result: FinancialCategoryMutationResult) => {
    if (!profile) return;
    updateProfile(profile.id, {
      financialCategories: result.categories,
      transactions: result.transactions,
      budgets: result.budgets || profile.budgets || [],
      balanceProjectionRows: result.projectionRows || profile.balanceProjectionRows || [],
    });
    setMoneyStatus('Changes applied.');
  };

  const saveWorkSetup = (profileId: string, types: Parameters<typeof context.saveWorkSetupForProfile>[1], categories: Parameters<typeof context.saveWorkSetupForProfile>[2]) =>
    context.saveWorkSetupForProfile(profileId, types, categories) === 'applied';

  if (!open || typeof document === 'undefined') return null;

  const innerPanels: Partial<Record<TaxonomyHubArea, Array<{ id: TaxonomyHubPanel; label: string }>>> = {
    inventory: [{ id: 'categories', label: 'Categories' }, { id: 'locations', label: 'Storage locations' }],
    skincare: [{ id: 'categories', label: 'Categories' }, { id: 'product-types', label: 'Product types' }],
    supplements: [{ id: 'types', label: 'Supplement types' }, { id: 'units', label: 'Dosage units' }],
  };
  const panels = innerPanels[request.area];
  const editorOwnsScroll = request.area === 'inventory' || request.area === 'supplements' || request.area === 'personal-vault' || (request.area === 'skincare' && request.panel !== 'product-types');

  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      className="modal-card-enter fixed inset-0 z-[100] flex h-[var(--cz-vh,100dvh)] flex-col overflow-hidden bg-background text-foreground motion-reduce:animate-none"
      data-state={isClosing ? 'closed' : 'open'}
      data-caizen-nested-flow="open"
      data-android-screen={androidPresentation ? 'taxonomy' : undefined}
    >
      <header className="shrink-0 border-b border-border/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 id={titleId} data-hub-title tabIndex={-1} className="text-page-title outline-none [overflow-wrap:anywhere]">{AREA_LABELS[request.area]} settings</h1>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <p id={descriptionId} className="min-w-0 [overflow-wrap:anywhere]">Profile: {profile?.name || 'your current profile'}</p>
              <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 [overflow-wrap:anywhere]">{localSaveStatus}</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => void closeHub()} disabled={isClosing} className="min-h-12 min-w-12 shrink-0 rounded-xl px-3" aria-label="Close settings">
            <X className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Close</span>
          </Button>
        </div>
        <div className={`grid gap-3 md:hidden ${panels ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="min-w-0 space-y-1.5">
          <label htmlFor={`${titleId}-area`} className={androidPresentation ? 'sr-only' : 'block text-sm font-medium'}>Settings area</label>
          <AndroidAdaptiveSelect id={`${titleId}-area`} label="Settings area" value={request.area} options={AREA_TABS.map(area => ({ value: area.id, label: area.label }))} onChange={area => void selectArea(area as TaxonomyHubArea)} searchable={false} className="min-h-12" />
          </div>
          {panels ? <div className="min-w-0 space-y-1.5">
            <label htmlFor={`${titleId}-editor`} className={androidPresentation ? 'sr-only' : 'block text-sm font-medium'}>Manage</label>
            <AndroidAdaptiveSelect id={`${titleId}-editor`} label="Manage" value={request.panel || defaultPanel(request.area)} options={panels.map(panel => ({ value: panel.id, label: panel.label }))} onChange={panel => selectPanel(panel as TaxonomyHubPanel)} searchable={false} className="min-h-12" />
          </div> : null}
        </div>
        <div className="hidden space-y-1 md:block">
          <SectionTabs mode="navigation" label="Settings areas" value={request.area} items={AREA_TABS.map(area => ({ value: area.id, label: area.label }))} onValueChange={area => void selectArea(area as TaxonomyHubArea)} listClassName="flex-wrap overflow-visible border-b-0 [&>button]:min-h-12" />
          {panels ? (
            <SectionTabs mode="navigation" label={`${AREA_LABELS[request.area]} editors`} value={request.panel || defaultPanel(request.area)} items={panels.map(panel => ({ value: panel.id, label: panel.label }))} onValueChange={panel => selectPanel(panel as TaxonomyHubPanel)} listClassName="border-b-0 [&>button]:min-h-12" />
          ) : null}
        </div>
        </div>
      </header>

      {storageError ? <div className="shrink-0 border-b border-destructive/30 bg-destructive/10"><p role="alert" className="mx-auto w-full max-w-6xl px-4 py-3 text-sm text-destructive sm:px-6">Local storage reported a problem. Keep Caizen open; recent changes may not be saved.</p></div> : null}
      <div key={currentProfileId} className={`mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col ${editorOwnsScroll ? 'overflow-hidden pb-[env(safe-area-inset-bottom)]' : 'overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-5 sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]'}`}>
        {!profile ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading your profile…</p> : null}
        {profile && request.area === 'inventory' ? request.panel === 'locations' ? (
          <InventoryStorageLocationSettingsButton embedded onDraftChange={onDraftChange} />
        ) : (
          <TaxonomyWorkspace key="inventory-taxonomy" {...inventoryTaxonomy} androidPresentation={androidPresentation} embedded embeddedOpen onDraftChange={onDraftChange} onBackRequestReady={registerBackRequest} onNavigationRequest={requestWorkspaceNavigation} onExit={() => void closeHub()} />
        ) : null}
        {profile && request.area === 'skincare' ? request.panel === 'product-types' ? (
          <ProductTypesReadOnly />
        ) : (
          <TaxonomyWorkspace key="skincare-taxonomy" {...skincareTaxonomy} androidPresentation={androidPresentation} embedded embeddedOpen onDraftChange={onDraftChange} onBackRequestReady={registerBackRequest} onNavigationRequest={requestWorkspaceNavigation} onExit={() => void closeHub()} />
        ) : null}
        {request.area === 'money' && profile ? (
          <div className="w-full space-y-5">
            <div className="max-w-[65ch] space-y-2"><h2 className="text-section-title">Categories and subcategories</h2><p className="text-sm text-muted-foreground">Renames and deletions affect linked transactions, budgets, and projections. Use Add or a Save button to apply names. Changes then save automatically on this device.</p><p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">{moneyStatus}</p></div>
            <CategoryManagementEditor
              categories={profile.financialCategories || []}
              transactions={profile.transactions || []}
              budgets={profile.budgets || []}
              projectionRows={profile.balanceProjectionRows || []}
              onChange={persistMoneyCategories}
              onDraftChange={onDraftChange}
              onUseStarterCategories={() => updateProfile(profile.id, { financialCategories: createDefaultFinancialCategories() })}
            />
          </div>
        ) : null}
        {profile && request.area === 'supplements' ? (
          <TaxonomyWorkspace
            key={request.panel === 'types' ? 'supplement-types-taxonomy' : 'supplement-units-taxonomy'}
            {...(request.panel === 'types' ? supplementTypeTaxonomy : supplementUnitTaxonomy)}
            androidPresentation={androidPresentation}
            embedded
            embeddedOpen
            onDraftChange={onDraftChange}
            onBackRequestReady={registerBackRequest}
            onNavigationRequest={requestWorkspaceNavigation}
            onExit={() => void closeHub()}
          />
        ) : null}
        {request.area === 'personal-vault' && profile ? (
          <div className="flex w-full min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
              <div className="max-w-sm space-y-1.5">
              <label htmlFor={`${titleId}-vault-section`} className={androidPresentation ? 'sr-only' : 'block text-sm font-medium'}>Personal Vault section</label>
              <AndroidAdaptiveSelect
                id={`${titleId}-vault-section`}
                label="Personal Vault section"
                value={personalVaultSection}
                options={PERSONAL_VAULT_SECTION_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
                onChange={value => void transitionTo({ ...request, section: value as PersonalVaultType })}
                searchable={false}
                className="min-h-12"
              />
              </div>
            </div>
            <TaxonomyWorkspace
              key={`${profile.id}-personal-vault-taxonomy-${personalVaultSection}`}
              {...personalVaultTaxonomy}
              androidPresentation={androidPresentation}
              embedded
              embeddedOpen
              onDraftChange={onDraftChange}
              onBackRequestReady={registerBackRequest}
              onNavigationRequest={requestWorkspaceNavigation}
              onExit={() => void closeHub()}
            />
          </div>
        ) : null}
        {request.area === 'work-hub' && profile ? (
          <WorkSetupWorkspace
            key={profile.id}
            profileId={profile.id}
            workTypes={resolveWorkTypes(profile.workTypes)}
            categories={profile.moduleTaxonomies?.work || []}
            workItems={profile.workItems || []}
            trashItems={profile.trashItems || []}
            androidPresentation={androidPresentation}
            embedded
            onBackRequestReady={registerBackRequest}
            onLeaveRequestReady={requestLeave => { workLeaveRequestRef.current = requestLeave; }}
            onSave={saveWorkSetup}
            onClose={() => closeAfterMotion()}
          />
        ) : null}
      </div>
      <ConfirmDialog isOpen={confirmingLeave} title="Discard unfinished input?" message="This unfinished input will be lost. Changes you already applied will stay." confirmText="Discard and continue" cancelText="Keep editing" onConfirm={() => resolveLeave(true)} onCancel={() => resolveLeave(false)} />
    </section>,
    document.body,
  );
}
