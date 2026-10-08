'use client';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { RecordImageField } from '@/components/common/RecordImageField';
import { toLocalDateKey } from '@/lib/utils';
import {
  AndroidAdaptiveCombobox,
  AndroidAdaptiveCreatableSelect,
  AndroidAdaptiveSelect,
} from '@/components/native/android-design';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FileText,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import {
  getInventoryCurrentValueIfKnown,
  getInventoryPurchaseCostIfKnown,
} from '@/lib/collections/inventory-metrics';
import {
  getInventoryCategoryEditorValue,
  normalizeInventoryCategoryKey,
} from '@/lib/collections/inventory-taxonomy';
import type { CurrencyCode, InventoryStatus } from '@/lib/types';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  formatPHP,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';

import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Input } from '@/components/ui/input';
import { LocalSuggestionInput } from '@/components/ui/local-suggestion-input';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { MediaPickerCancelled, pickPhoto } from '@/lib/native/media-picker';
import {
  clearInventoryCameraRequest,
  listRecoveredInventoryPhotos,
  markInventoryCameraRequest,
  removeRecoveredInventoryPhoto,
  type RecoveredInventoryPhoto,
} from '@/lib/native/inventory-photo-recovery';
import { isNativeApp } from '@/lib/platform';
import { mediaStorage } from '@/lib/storage/media-storage';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { processPendingMediaCleanup, queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import {
  composeInventoryStorageLocations,
  INVENTORY_STORAGE_LOCATION_MODULE,
} from '@/lib/inventory-storage-locations';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string | null;
  androidPresentation?: boolean;
  /** Prefills the Name field when creating a new item (e.g. from the Balance transaction Link picker). Purely a starting value - the user can still change it. */
  initialName?: string;
  /** Called with the new item's ID right after a create (not edit) succeeds, in addition to the normal onClose. */
  onSaved?: (id: string) => void;
}
/* =========================================
   CONSTANTS
========================================= */

const STATUS_OPTIONS: Array<{ value: InventoryStatus; label: string }> = [
  { value: 'using', label: 'Using' },
  { value: 'stored', label: 'Stored' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'replace', label: 'Replace soon' },
  { value: 'retired', label: 'Retired' },
  { value: 'archived', label: 'Archived' },
];

const SUBCATEGORIES = {
  personal_tech: [
    'Device',
    'Audio',
    'Accessory',
    'Power',
    'Cable',
    'Storage',
    'Other',
  ],

  utilities: [
    'Everyday',
    'Organizer',
    'Grooming',
    'Cleaning',
    'Repair',
    'Measuring',
    'Travel',
    'Other',
  ],

  wearables: [
    'Top',
    'Bottom',
    'Underwear',
    'Socks',
    'Shoes',
    'Bag',
    'Outerwear',
    'Accessory',
    'Towel',
    'Sleepwear',
    'Other',
  ],

  home: [
    'Furniture',
    'Appliance',
    'Bedding',
    'Kitchen',
    'Storage',
    'Cleaning',
    'Other',
  ],
};

const ACQUISITION_TYPES = [
  'bought',
  'included',
  'gift',
  'free',
  'unknown',
];
function normalizeInventoryCategory(value?: string) {
  return getInventoryCategoryEditorValue(value, 'personal_tech');
}

/* =========================================
   HELPERS
========================================= */

function toDateInputValue(value: any) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return toLocalDateKey(date);
}

function formatLabel(
  str: string
) {
  return str
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      l => l.toUpperCase()
    );
}

function Field({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="
          text-[11px]
          font-semibold
          uppercase
          tracking-[0.12em]
          text-muted-foreground
        "
      >
        {label}
      </label>

      {children}
    </div>
  );
}

/* =========================================
   INPUT STYLES
========================================= */

const inputStyle = `
  h-11
  sm:h-10
  w-full
  rounded-xl
  border border-border/70
  bg-background
  px-3
  text-sm
  transition-[border-color,box-shadow,background-color]
  duration-200
  focus:outline-none
`;

const textareaStyle = `
  min-h-24
  w-full
  rounded-xl
  border border-border/70
  bg-background
  px-3
  py-2.5
  text-sm
  transition-[border-color,box-shadow,background-color]
  duration-200
  focus:outline-none
`;

const inventoryFieldIds = {
  name: 'inventory-asset-name',
  productLink: 'inventory-product-link',
  storageLocation: 'inventory-storage-location',
  category: 'inventory-category',
  subcategory: 'inventory-subcategory',
  status: 'inventory-status',
  acquisitionType: 'inventory-acquisition-type',
  purchasePrice: 'inventory-purchase-price',
  currentPrice: 'inventory-current-value',
  replacementCost: 'inventory-replacement-cost',
  purchaseDate: 'inventory-acquired-date',
  quantity: 'inventory-quantity',
  notes: 'inventory-notes',
  imageUrl: 'inventory-image-url',
  photoUpload: 'inventory-photo-upload',
  receiptUpload: 'inventory-receipt-upload',
  form: 'inventory-edit-form',
} as const;

const inventoryA11yIds = {
  dialogTitle: 'inventory-dialog-title',
  dialogDescription: 'inventory-dialog-description',
  nameError: 'inventory-asset-name-error',
  valueHelp: 'inventory-value-help',
  notesCount: 'inventory-notes-count',
} as const;

/* =========================================
   COMPONENT
========================================= */
export default function InventoryModal({
  isOpen,
  onClose,
  itemId,
  androidPresentation = false,
  initialName,
  onSaved,
}: InventoryModalProps) {
  const {
    inventoryItems,
    addInventoryItem,
    updateInventoryItem,
    currentProfileId,
    profiles,
  } = useAppContext();

  const isEditing =
    Boolean(itemId);

  const item =
    inventoryItems.find(
      i => i.id === itemId
    );
  const fileRef =
    useRef<HTMLInputElement>(
      null
    );
  const receiptRef = useRef<HTMLInputElement>(null);

  const contentRef =
    useRef<HTMLDivElement>(
      null
    );
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;


  /* =========================================
     RESET SCROLL
  ========================================= */

  useEffect(() => {
    if (
      isOpen &&
      contentRef.current
    ) {
      contentRef.current.scrollTop =
        0;
    }
  }, [isOpen]);

  /* =========================================
     STATE
  ========================================= */

  const [name, setName] =
    useState('');

  const [
    productLink,
    setProductLink,
  ] = useState('');

  const [category, setCategory] =
    useState(
      'personal_tech'
    );

  const [subCategory, setSubCategory] =
    useState('');

  const [acquisitionType, setAcquisitionType] =
    useState<
      'bought' |
      'included' |
      'gift' |
      'free' |
      'unknown'
    >('bought');

  const [storageLocation, setStorageLocation] =
    useState('');

  const [status, setStatus] =
    useState<InventoryStatus>('using');

  const taxonomy = useProfileModuleTaxonomy('inventory', SUBCATEGORIES, inventoryItems.map(entry => ({
    category: normalizeInventoryCategory(entry.category),
    subcategory: entry.subCategory,
  })));
  const categoryOptions = [...taxonomy.activeCategories, ...(taxonomy.categories.some(entry => normalizeInventoryCategoryKey(entry.name) === normalizeInventoryCategoryKey(category)) ? [] : [{ name: category, subcategories: [] }])]
    .filter(entry => entry.name)
    .map(entry => ({ value: entry.name, label: formatLabel(entry.name) }));
  const selectedTaxonomyCategory = taxonomy.categories.find(entry => normalizeInventoryCategoryKey(entry.name) === normalizeInventoryCategoryKey(category));
  const subCategoryOptions = (selectedTaxonomyCategory?.subcategories || []).map(value => ({ value, label: value }));
  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const storageLocations = composeInventoryStorageLocations(
    currentProfile?.moduleTaxonomies?.[INVENTORY_STORAGE_LOCATION_MODULE],
    inventoryItems,
  );
  const activeStorageLocationOptions = storageLocations
    .filter(location => !location.archived)
    .map(location => ({ value: location.name, label: location.name }));
  const hasExactStorageLocationOption = activeStorageLocationOptions.some(option => option.value === storageLocation);
  const currentStorageLocationOption = isEditing && storageLocation.trim() && !hasExactStorageLocationOption
    ? [{ value: storageLocation, label: storageLocation, description: 'Current saved value' }]
    : [];
  const storageLocationOptions = [...activeStorageLocationOptions, ...currentStorageLocationOption];

  // Historical compatibility: Caizen's existing Inventory records were saved
  // with the "Purchase Cost" field persisted into item.currentPrice and the
  // "Current Value" field persisted into item.purchasePrice. The internal
  // property names are reversed from what they mean on screen, but every
  // existing record depends on this mapping, so it is preserved here rather
  // than migrated.
  const [
    purchaseCostInput,
    setPurchaseCostInput,
  ] = useState('');

  const [
    currentValueInput,
    setCurrentValueInput,
  ] = useState('');

  const [
    purchaseDate,
    setPurchaseDate,
  ] = useState('');

  const [quantity, setQuantity] =
    useState('1');

  const [notes, setNotes] =
    useState('');
  const [errors, setErrors] =
    useState<{
      name?: string;
    }>({});

  const [imageUrl, setImageUrl] =
    useState('');

  const [image, setImage] =
    useState<
      string | undefined
    >(undefined);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [receiptAssetIds, setReceiptAssetIds] = useState<string[]>([]);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [draftItemId, setDraftItemId] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [recoveredPhotos, setRecoveredPhotos] = useState<RecoveredInventoryPhoto[]>([]);
  const recoveryOperation = useRef(false);
  const [showUnsavedDialog, setShowUnsavedDialog] =
    useState(false);

  const persistedMediaIds = new Set(collectMediaReferenceIds(item || {}));
  const cleanupDraftMedia = (
    assetIds: Iterable<string>,
    reason: 'attachment-detached' | 'draft-cancelled' = 'draft-cancelled',
  ) => {
    const draftOnlyIds = [...new Set(assetIds)].filter(
      assetId => !persistedMediaIds.has(assetId),
    );
    if (draftOnlyIds.length === 0) return;
    queueMediaCleanup({ profileId: currentProfileId, assetIds: draftOnlyIds, reason });
    void processPendingMediaCleanup();
  };

  const hasUnsavedChanges =
    isEditing && item
      ? (
        name !== (item.name || '') ||
        productLink !== (item.productLink || '') ||
        normalizeInventoryCategoryKey(category) !== normalizeInventoryCategoryKey(item.category) ||
        subCategory !== (item.subCategory || '') ||
        acquisitionType !== (item.acquisitionType || 'bought') ||
        storageLocation !== (item.storageLocation || '') ||
        status !== ((item as any).status || 'using') ||
        purchaseCostInput !== formatMoneyInputValue(getInventoryPurchaseCostIfKnown(item), moneyInputCurrency) ||
        currentValueInput !== formatMoneyInputValue(getInventoryCurrentValueIfKnown(item), moneyInputCurrency) ||
        purchaseDate !== toDateInputValue(item.purchaseDate) ||
        quantity !== String(item.quantity || 1) ||
        notes !== (item.notes || '') ||
        image !== (item.image || undefined) ||
        imageUrl !== (
          item.image?.startsWith('http')
            ? item.image
            : ''
        ) ||
        JSON.stringify(photoAssetIds) !== JSON.stringify(item.photoAssetIds || []) ||
        JSON.stringify(receiptAssetIds) !== JSON.stringify(item.receiptAssetIds || [])
      )
      : (
        name.trim() !== '' ||
        productLink.trim() !== '' ||
        category !== 'personal_tech' ||
        subCategory !== '' ||
        acquisitionType !== 'bought' ||
        storageLocation.trim() !== '' ||
        status !== 'using' ||
        purchaseCostInput.trim() !== '' ||
        currentValueInput.trim() !== '' ||
        purchaseDate.trim() !== '' ||
        quantity !== '1' ||
        notes.trim() !== '' ||
        image !== undefined ||
        imageUrl.trim() !== '' ||
        photoAssetIds.length > 0 ||
        receiptAssetIds.length > 0
      );
  /* =========================================
     LOAD ITEM
  ========================================= */

  useEffect(() => {
    if (!isOpen) return;

    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(getActiveCurrency());
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    if (!isEditing || !item) {
      setName(initialName || '');
      setProductLink('');
      setCategory('personal_tech');
      setSubCategory('');
      setStatus('using');
      setAcquisitionType('bought');
      setStorageLocation('');
      setPurchaseCostInput('');
      setCurrentValueInput('');
      setPurchaseDate('');
      setQuantity('1');
      setNotes('');
      setImage(undefined);
      setPhotoAssetIds([]);
      setReceiptAssetIds([]);
      setDraftItemId(`inv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
      setMediaError(null);
      setImageUrl('');
      setErrors({});
      return;
    }

    setName(item.name || '');

    setProductLink(
      item.productLink || ''
    );

    setCategory(normalizeInventoryCategory(item.category));

    setSubCategory(
      item.subCategory || ''
    );

    setStatus(
      ((item as any).status === 'broken' ? 'retired' : (item as any).status || 'using') as InventoryStatus
    );

    setAcquisitionType(
      item.acquisitionType || 'bought'
    );

    setStorageLocation(
      item.storageLocation || ''
    );

    // Historical compatibility mapping — see the state declarations above.
    setPurchaseCostInput(formatMoneyInputValue(getInventoryPurchaseCostIfKnown(item), nextMoneyCurrency));

    setCurrentValueInput(formatMoneyInputValue(getInventoryCurrentValueIfKnown(item), nextMoneyCurrency));

    setPurchaseDate(
      toDateInputValue(item.purchaseDate)
    );

    setQuantity(
      String(item.quantity || 1)
    );

    setNotes(item.notes || '');

    setImage(item.image || undefined);
    setPhotoAssetIds(item.photoAssetIds || []);
    setReceiptAssetIds(item.receiptAssetIds || []);
    setDraftItemId(item.id);
    setMediaError(null);

    setImageUrl(
      item.image?.startsWith('http')
        ? item.image
        : ''
    );

  }, [isEditing, isOpen, item, initialName]);

  useEffect(() => {
    if (!isOpen || !isNativeApp()) return;
    let cancelled = false;
    setRecoveredPhotos([]);
    const refresh = () => {
      void listRecoveredInventoryPhotos().then(photos => {
        if (!cancelled) {
          setRecoveredPhotos(photos.filter(photo => photo.profileId === currentProfileId));
          setMediaError(current => current === 'Recovered photo information could not be read.' ? null : current);
        }
      }).catch(() => {
        if (!cancelled) {
          setRecoveredPhotos([]);
          setMediaError('Recovered photo information could not be read.');
        }
      });
    };
    refresh();
    window.addEventListener('caizen:inventory-photo-recovered', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('caizen:inventory-photo-recovered', refresh);
    };
  }, [isOpen, currentProfileId]);

  /* =========================================
     IMAGE
  ========================================= */

  const saveSelectedImage = async (blob: Blob, fileName: string): Promise<boolean> => {
    if (!draftItemId) return false;
    setMediaBusy(true);
    setMediaError(null);
    try {
      const asset = await mediaStorage.save(blob, {
        profileId: currentProfileId,
        ownerType: 'inventory',
        ownerId: draftItemId,
        role: photoAssetIds.length === 0 ? 'primary' : 'gallery',
        fileName,
      });
      setPhotoAssetIds((current) => [...current, asset.id]);
      setImage(undefined);
      setImageUrl('');
      return true;
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The image could not be saved.');
      return false;
    } finally {
      setMediaBusy(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await saveSelectedImage(file, file.name);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !draftItemId) return;

    setMediaBusy(true);
    setMediaError(null);
    try {
      const asset = await mediaStorage.save(file, {
        profileId: currentProfileId,
        ownerType: 'inventory',
        ownerId: draftItemId,
        role: 'receipt',
        fileName: file.name,
      });
      setReceiptAssetIds(current => [...current, asset.id]);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The receipt could not be saved.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleNativePhoto = async (source: 'camera' | 'gallery') => {
    if (source === 'camera' && !draftItemId) return;
    if (source === 'camera' && draftItemId) {
      try {
        await markInventoryCameraRequest(currentProfileId, draftItemId);
      } catch {
        setMediaError('The camera could not prepare photo recovery. Try again.');
        return;
      }
    }
    setMediaBusy(true);
    setMediaError(null);
    try {
      const selected = await pickPhoto(source);
      if (selected) {
        await saveSelectedImage(selected.blob, selected.fileName);
      }
    } catch (error) {
      // Backing out of the camera or picker is a normal outcome, not an error.
      if (error instanceof MediaPickerCancelled) return;
      setMediaError(error instanceof Error ? error.message : 'The photo could not be selected.');
    } finally {
      if (source === 'camera') await clearInventoryCameraRequest().catch(() => undefined);
      setMediaBusy(false);
    }
  };

  const attachRecoveredPhoto = async (photo: RecoveredInventoryPhoto) => {
    if (recoveryOperation.current || photo.profileId !== currentProfileId) return;
    recoveryOperation.current = true;
    setMediaBusy(true);
    try {
      const blob = await mediaStorage.read(photo.assetId, currentProfileId);
      if (!await saveSelectedImage(blob, 'recovered-camera.jpg')) return;
      await removeRecoveredInventoryPhoto(photo.assetId);
      setRecoveredPhotos(current => current.filter(entry => entry.assetId !== photo.assetId));
      cleanupDraftMedia([photo.assetId], 'attachment-detached');
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The recovered photo could not be attached.');
    } finally {
      recoveryOperation.current = false;
      setMediaBusy(false);
    }
  };

  const discardRecoveredPhoto = async (photo: RecoveredInventoryPhoto) => {
    if (recoveryOperation.current || photo.profileId !== currentProfileId) return;
    recoveryOperation.current = true;
    setMediaBusy(true);
    try {
      await removeRecoveredInventoryPhoto(photo.assetId);
      setRecoveredPhotos(current => current.filter(entry => entry.assetId !== photo.assetId));
      cleanupDraftMedia([photo.assetId], 'draft-cancelled');
    } catch {
      setMediaError('The recovered photo could not be discarded. Try again.');
    } finally {
      recoveryOperation.current = false;
      setMediaBusy(false);
    }
  };

  const quantityValue = Math.max(1, Number(quantity) || 1);
  const purchaseCostValue = purchaseCostInput.trim()
    ? convertMoneyInputToBase(purchaseCostInput, moneyInputCurrency)
    : undefined;
  const currentValueValue = currentValueInput.trim()
    ? convertMoneyInputToBase(currentValueInput, moneyInputCurrency)
    : undefined;
  const valueChange =
    purchaseCostValue !== undefined && currentValueValue !== undefined
      ? (currentValueValue - purchaseCostValue) * quantityValue
      : undefined;

  /* =========================================
     SUBMIT
  ========================================= */
  const attemptClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }

    onClose();
  };
  const discardDraftMedia = () => {
    cleanupDraftMedia(
      collectMediaReferenceIds({ photoAssetIds, receiptAssetIds }),
      'draft-cancelled',
    );
  };
  const validateForm = () => {
    const newErrors: {
      name?: string;
    } = {};

    if (!name.trim()) {
      newErrors.name =
        'Item name is required';
    }

    setErrors(newErrors);

    return (
      Object.keys(newErrors)
        .length === 0
    );
  };
  const handleSubmit = (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }
    const itemData = {
      name: name.trim(),
      productLink,
      category: item && normalizeInventoryCategoryKey(category) === normalizeInventoryCategoryKey(item.category)
        ? item.category
        : category,
      subCategory,

      acquisitionType,

      storageLocation:
        storageLocation.trim(),
      status,

      quantity:
        Number(quantity) ||
        1,

      // Historical compatibility mapping — see the state declarations above.
      currentPrice: purchaseCostInput.trim()
        ? convertMoneyInputToBase(purchaseCostInput, moneyInputCurrency)
        : undefined,

      purchasePrice: currentValueInput.trim()
        ? convertMoneyInputToBase(currentValueInput, moneyInputCurrency)
        : undefined,

      purchaseDate:
        new Date(
          purchaseDate || Date.now()
        ),

      notes,
      image,
      id: draftItemId,
      profileId: currentProfileId,
      photoAssetIds,
      receiptAssetIds,
    } as any;

    if (isEditing && item) {
      updateInventoryItem(
        item.id,
        itemData
      );
    } else {
      addInventoryItem({
        ...itemData,
        unit: 'piece',
      });
      if (inventoryItems.length === 0) {
        toast({
          title: 'Your first item is in the vault',
          description: 'Keep the things you own easy to find.',
        });
      }
      // draftItemId was generated up front (see the reset branch above), so
      // it is already the new item's real ID - no lookup needed.
      onSaved?.(draftItemId);
    }

    onClose();
  };

  if (!isOpen || (isEditing && !item))
    return null;

  return (
    <>
      <CaizenFormDialog
        title={isEditing ? 'Edit item' : 'Add item'}
        descriptionId={inventoryA11yIds.dialogDescription}
        description={isEditing ? 'Update and refine your equipment data.' : 'Add equipment into your inventory.'}
        onClose={onClose}
        onBeforeClose={() => {
          if (hasUnsavedChanges) {
            setShowUnsavedDialog(true);
            return false;
          }
          return true;
        }}
        initialFocusSelector={!androidPresentation ? `#${inventoryFieldIds.name}` : undefined}
        androidPresentation={androidPresentation}
        maxWidthClass="max-w-5xl"
        maxHeightClass="max-h-[92dvh]"
        bodyClassName="p-0"
        bodyRef={contentRef}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={attemptClose} className="h-11 rounded-xl px-5 sm:h-10">Cancel</Button>
            <Button type="submit" form={inventoryFieldIds.form} className="h-11 rounded-xl px-5 font-semibold sm:h-10">
              {isEditing ? 'Save Changes' : 'Add item'}
            </Button>
          </div>
        )}
      >
          <form
            id={inventoryFieldIds.form}
            onSubmit={
              handleSubmit
            }
            className="min-w-0"
          >

            {/* The enclosing dialog body owns scrolling. */}
            <div className="caizen-form-modal-body p-4 sm:px-5">

              <div
                className="
                  grid
                  grid-cols-1
                  gap-5
                  lg:grid-cols-[minmax(0,1fr)_16rem]
                "
              >

                {/* LEFT */}
                <div className="space-y-5">

                  {/* INFO */}
                  <section className="border-b border-border/50 pb-5">

                    <div className="mb-3">

                      <h3
                        className="
                          text-sm
                          font-semibold
                        "
                      >
                        Item details
                      </h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">

                      <Field label="Item name*" htmlFor={inventoryFieldIds.name}>

                        <div>

                          <LocalSuggestionInput
                            id={inventoryFieldIds.name}
                            value={name}
                            candidates={inventoryItems.filter(entry => entry.id !== itemId).map(entry => entry.name)}
                            onValueChange={value => {
                              setName(
                                value
                              );

                              if (
                                errors.name
                              ) {
                                setErrors({});
                              }
                            }}
                            className={`
        ${inputStyle}
        ${errors.name
                                ? 'border-red-500'
                                : ''
                              }
      `}
                            placeholder="MacBook Pro M4"
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={errors.name ? inventoryA11yIds.nameError : undefined}
                          />

                          {errors.name && (
                            <p
                              id={inventoryA11yIds.nameError}
                              role="alert"
                              className="
          mt-2
          text-xs
          font-medium
          text-red-500
        "
                            >
                              {errors.name}
                            </p>
                          )}

                        </div>

                      </Field>
                      <Field label="Product Link" htmlFor={inventoryFieldIds.productLink}>

                        <Input
                          id={inventoryFieldIds.productLink}
                          value={
                            productLink
                          }
                          onChange={e =>
                            setProductLink(
                              e.target.value
                            )
                          }
                          className={
                            inputStyle
                          }
                        />

                      </Field>

                      <Field label="Storage Location" htmlFor={inventoryFieldIds.storageLocation} className="sm:col-span-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <AndroidAdaptiveCombobox
                            id={inventoryFieldIds.storageLocation}
                            label="Storage Location"
                            value={storageLocation}
                            onChange={setStorageLocation}
                            options={storageLocationOptions}
                            placeholder="Select a location"
                            searchPlaceholder="Search locations"
                            emptyText="No active locations. Add one from Taxonomy."
                            clearable
                            wrapperClassName="min-w-0 flex-1"
                            className={`${inputStyle} min-w-0 flex-1`}
                          />
                        </div>
                      </Field>

                      <div
                        className="
                          grid
                          grid-cols-1
                          gap-3
                          md:grid-cols-2
                          sm:col-span-2
                        "
                      >

                        <Field label="Category" htmlFor={inventoryFieldIds.category}>
                          <AndroidAdaptiveCreatableSelect
                            id={inventoryFieldIds.category}
                            label="Category"
                            value={category}
                            onChange={nextCategory => {
                              taxonomy.addCategory(nextCategory);
                              setCategory(nextCategory);
                              const nextSubcategories = taxonomy.categories.find(entry =>
                                normalizeInventoryCategoryKey(entry.name) === normalizeInventoryCategoryKey(nextCategory),
                              )?.subcategories || [];
                              setSubCategory(nextSubcategories[0] || '');
                            }}
                            options={categoryOptions}
                            className={
                            inputStyle
                          }
                          />
                        </Field>

                        <Field label="Sub-category" htmlFor={inventoryFieldIds.subcategory}>
                          <AndroidAdaptiveCreatableSelect
                            id={inventoryFieldIds.subcategory}
                            label="Sub-category"
                            value={subCategory}
                            onChange={value => {
                              if (value.trim()) taxonomy.addSubcategory(category, value);
                              setSubCategory(value);
                            }}
                            options={subCategoryOptions}
                            placeholder="Select or create a sub-category"
                            className={
                            inputStyle
                          }
                          />
                        </Field>

                        <Field label="Status" htmlFor={inventoryFieldIds.status}>
                          <AndroidAdaptiveSelect
                            id={inventoryFieldIds.status}
                            label="Status"
                            value={status}
                            onChange={value => setStatus(value as InventoryStatus)}
                            options={STATUS_OPTIONS}
                            className={
                            inputStyle
                          }
                          />
                        </Field>

                        <Field label="Acquisition Type" htmlFor={inventoryFieldIds.acquisitionType}>
                          <AndroidAdaptiveSelect
                            id={inventoryFieldIds.acquisitionType}
                            label="Acquisition Type"
                            value={acquisitionType}
                            onChange={value =>
                              setAcquisitionType(
                                value as
                                | 'bought'
                                | 'included'
                                | 'gift'
                                | 'free'
                                | 'unknown'
                              )
                            }
                            options={ACQUISITION_TYPES.map(type => ({
                              value: type,
                              label: formatLabel(type),
                            }))}
                            className={
                            inputStyle
                          }
                          />
                        </Field>

                      </div>

                    </div>

                  </section>

                  {/* STATS */}
                  <section className="border-b border-border/50 pb-5">

                    <div className="mb-3">

                      <h3
                        className="
                          text-sm
                          font-semibold
                        "
                      >
                        Value & Purchase
                      </h3>

                    </div>

                    <div
                      className="
                        grid
                        grid-cols-1
                        gap-3
                        md:grid-cols-2
                      "
                    >

                      <Field label="Purchase Cost · What you paid" htmlFor={inventoryFieldIds.purchasePrice}>

                        <MoneyInput
                          id={inventoryFieldIds.purchasePrice}
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            purchaseCostInput
                          }
                          currency={moneyInputCurrency}
                          onChange={e =>
                            setPurchaseCostInput(
                              e.target.value
                            )
                          }
                          aria-describedby={inventoryA11yIds.valueHelp}
                        />

                      </Field>

                      <Field label="Current Value · Estimated worth now" htmlFor={inventoryFieldIds.currentPrice}>

                        <MoneyInput
                          id={inventoryFieldIds.currentPrice}
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            currentValueInput
                          }
                          currency={moneyInputCurrency}
                          onChange={e =>
                            setCurrentValueInput(
                              e.target.value
                            )
                          }
                          aria-describedby={inventoryA11yIds.valueHelp}
                        />

                      </Field>

                      <Field label="Acquired Date" htmlFor={inventoryFieldIds.purchaseDate}>

                        <AdaptiveDatePicker
                          id={inventoryFieldIds.purchaseDate}
                          label="Acquired Date"
                          value={purchaseDate}
                          onChange={setPurchaseDate}
                          className={
                            inputStyle
                          }
                        />

                      </Field>

                      <Field label="Quantity" htmlFor={inventoryFieldIds.quantity}>

                        <Input
                          id={inventoryFieldIds.quantity}
                          type="number"
                          value={
                            quantity
                          }
                          onChange={e =>
                            setQuantity(
                              e.target.value
                            )
                          }
                          className={
                            inputStyle
                          }
                        />

                      </Field>

                    </div>

                    {valueChange !== undefined && (
                      <div className="mt-3">
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="
          text-[11px]
          font-semibold
          uppercase
          tracking-[0.12em]
          text-muted-foreground
        ">
                            Value change since purchase
                          </p>
                          <p className={`mt-1 text-lg font-bold ${valueChange >= 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {valueChange >= 0 ? '+' : '-'}{formatPHP(Math.abs(valueChange))}
                          </p>
                        </div>
                      </div>
                    )}

                    <p id={inventoryA11yIds.valueHelp} className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Current value is what the item may be worth now. Savings versus current price compares it with what you originally paid.
                    </p>

                  </section>

                  {/* NOTES */}
                  <section>
                    <Field label="Notes" htmlFor={inventoryFieldIds.notes}>

                      <div>

                        <Textarea
                          id={inventoryFieldIds.notes}
                          value={notes}
                          maxLength={1000}
                          onChange={e =>
                            setNotes(
                              e.target.value
                            )
                          }
                          className={textareaStyle}
                          aria-describedby={inventoryA11yIds.notesCount}
                          placeholder="Specifications, condition, or anything worth remembering..."
                        />

                        <div
                          className="
        mt-2
        flex
        justify-end
      "
                        >
                          <p
                            id={inventoryA11yIds.notesCount}
                            className="
          text-xs
          text-muted-foreground
        "
                          >
                            {notes.length} / 1000
                          </p>
                        </div>

                      </div>

                    </Field>

                  </section>

                </div>

                {/* RIGHT */}
                <div className="space-y-4">

                  <section className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                    <input
                      id={inventoryFieldIds.receiptUpload}
                      ref={receiptRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleReceiptUpload}
                      className="hidden"
                    />
                    <RecordImageField
                      preview={photoAssetIds[0] ? (
                        <MediaAssetImage
                          profileId={currentProfileId}
                          assetId={photoAssetIds[0]}
                          alt="Inventory preview"
                          variant="full"
                          className="h-full w-full object-cover"
                        />
                      ) : image ? (
                        <img src={image} alt="Inventory preview" className="h-full w-full object-cover" />
                      ) : null}
                      hasPreview={Boolean(photoAssetIds[0] || image)}
                      alt="inventory image"
                      label="Add image"
                      chooseLabel="Upload item image"
                      description="PNG, JPG, or WebP"
                      onChoose={() => isNativeApp() ? setPhotoSourceOpen(true) : fileRef.current?.click()}
                      onRemove={() => {
                        if (photoAssetIds[0]) {
                          cleanupDraftMedia([photoAssetIds[0]], 'attachment-detached');
                          setPhotoAssetIds(current => current.slice(1));
                        } else {
                          setImage(undefined);
                          setImageUrl('');
                        }
                      }}
                      controls={(
                        <>
                          <input
                            id={inventoryFieldIds.photoUpload}
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            onChange={handleUpload}
                            className="hidden"
                          />
                          <Field label="Image URL" htmlFor={inventoryFieldIds.imageUrl}>
                            <Input
                              id={inventoryFieldIds.imageUrl}
                              value={imageUrl}
                              onChange={event => {
                                const value = event.target.value;
                                setImageUrl(value);
                                setImage(value.trim() || undefined);
                              }}
                              className={
                            inputStyle
                          }
                              placeholder="https://example.com/image.jpg"
                            />
                          </Field>
                        </>
                      )}
                    />

                    {recoveredPhotos.map(photo => (
                      <div key={photo.assetId} className="mt-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-border/60 bg-background/50 p-3">
                        <MediaAssetImage profileId={currentProfileId} assetId={photo.assetId} alt="Recovered camera photo" className="h-14 w-14 rounded-lg object-cover" />
                        <p className="min-w-0 self-center text-sm">A camera photo was recovered after Android restarted Caizen.</p>
                        <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
                          <button type="button" className="min-h-11 rounded-lg border border-primary/30 px-3 font-semibold text-primary" disabled={mediaBusy} onClick={() => void attachRecoveredPhoto(photo)}>Attach</button>
                          <button type="button" className="min-h-11 rounded-lg border border-border px-3" disabled={mediaBusy} onClick={() => void discardRecoveredPhoto(photo)}>Discard</button>
                        </div>
                      </div>
                    ))}

                    {photoAssetIds.length > 1 && (
                      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {photoAssetIds.map((assetId, index) => (
                          <div key={assetId} className="group/thumb relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-background/40">
                            <button
                              type="button"
                              onClick={() => setPhotoAssetIds(current => [assetId, ...current.filter(id => id !== assetId)])}
                              className="h-full w-full"
                              aria-label={`Use photo ${index + 1} as primary`}
                            >
                              <MediaAssetImage profileId={currentProfileId} assetId={assetId} alt={`${name || 'Item'} photo ${index + 1}`} className="h-full w-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                cleanupDraftMedia([assetId], 'attachment-detached');
                                setPhotoAssetIds(current => current.filter(id => id !== assetId));
                              }}
                              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover/thumb:opacity-100"
                              aria-label={`Remove photo ${index + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 border-t border-border/50 pt-4">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold">Receipt or proof of purchase</p>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              {receiptAssetIds.length > 0
                                ? `${receiptAssetIds.length} file${receiptAssetIds.length === 1 ? '' : 's'} attached`
                                : 'Optional · image or PDF'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button type="button" variant="outline" disabled={mediaBusy} onClick={() => receiptRef.current?.click()} className="mt-3 h-10 w-full rounded-xl">
                        Attach receipt
                      </Button>
                      {receiptAssetIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {receiptAssetIds.map((assetId, index) => (
                            <Tooltip key={assetId}><TooltipTrigger asChild><button aria-label="Remove attachment"
                              type="button"
                              onClick={() => {
                                cleanupDraftMedia([assetId], 'attachment-detached');
                                setReceiptAssetIds(current => current.filter(id => id !== assetId));
                              }}
                              className="rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-destructive/30 hover:text-destructive"
                            >
                              Receipt {index + 1} · Remove
                            </button></TooltipTrigger><TooltipContent>{"Remove attachment"}</TooltipContent></Tooltip>
                          ))}
                        </div>
                      )}
                    </div>

                    {mediaError && (
                      <p className="mt-2 text-sm text-destructive" role="alert">
                        {mediaError}
                      </p>
                    )}

                  </section>

                </div>

              </div>

            </div>

          </form>
      </CaizenFormDialog>
      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to close this modal?"
        confirmText="Discard"
        cancelText="Continue Editing"
        isDangerous
        onConfirm={() => {
          setShowUnsavedDialog(false);
          discardDraftMedia();
          onClose();
        }}
        onCancel={() => {
          setShowUnsavedDialog(false);
        }}
      />
      <PhotoSourceSheet
        open={photoSourceOpen}
        canRemove={photoAssetIds.length > 0}
        onClose={() => setPhotoSourceOpen(false)}
        onCamera={() => { setPhotoSourceOpen(false); void handleNativePhoto('camera'); }}
        onGallery={() => { setPhotoSourceOpen(false); void handleNativePhoto('gallery'); }}
        onRemove={() => {
          cleanupDraftMedia(photoAssetIds, 'attachment-detached');
          setPhotoAssetIds([]);
          setPhotoSourceOpen(false);
        }}
      />
    </>
  );
}
