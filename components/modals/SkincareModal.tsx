'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { FormField } from '@/components/common/FormPatterns';
import { RecordImageField } from '@/components/common/RecordImageField';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { AndroidAdaptiveCombobox, AndroidAdaptiveCreatableSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { LocalSuggestionInput } from '@/components/ui/local-suggestion-input';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { usePhotoSource, downscaleImage } from '@/hooks/use-photo-source';
import { parseLocalDateInput } from '@/lib/date-utils';
import { useAppContext } from '@/lib/context';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import type {
  SkincareArea,
  SkincareFrequency,
  SkincareProduct,
  SkincareProductType,
  SkincareSchedule,
  CurrencyCode,
} from '@/lib/types';
import { createEntityId, toLocalDateKey } from '@/lib/utils';
import { dataUrlToBlob, isInlineDataUrl } from '@/lib/storage/legacy-media';
import { mediaStorage } from '@/lib/storage/media-storage';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { SKINCARE_PRODUCT_TYPES } from '@/lib/skincare/taxonomy';

const AREAS: SkincareArea[] = [
  'Face',
  'Body',
  'Hair',
  'Oral',
  'Other',
];

const SIZE_UNITS = ['mL', 'g', 'oz', 'piece', 'pack'] as const;

const inputStyle = `
  h-11 sm:h-10 w-full rounded-xl border border-border/70
  bg-background px-3 text-sm
  transition-[border-color,box-shadow,background-color]
`;

const textareaStyle = `
  min-h-24 w-full rounded-xl border border-border/70
  bg-background px-3 py-2.5 text-sm
  transition-[border-color,box-shadow,background-color]
`;

function parseSize(value?: string) {
  const match = String(value || '').match(/^\s*(\d+(?:\.\d+)?)\s*(mL|g|oz|piece|pack)\s*$/i);
  if (!match) return { amount: '', unit: 'mL' };
  return {
    amount: match[1],
    unit: match[2].toLowerCase() === 'ml' ? 'mL' : match[2].toLowerCase(),
  };
}

interface SkincareModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string | null;
  androidPresentation?: boolean;
  /** Prefills the Name field when creating a new product (e.g. from the Balance transaction Link picker). Purely a starting value - the user can still change it. */
  initialName?: string;
  /** Called with the new product's ID right after a create (not edit) succeeds, in addition to the normal onClose. */
  onSaved?: (id: string) => void;
}

export default function SkincareModal({
  isOpen,
  onClose,
  productId = null,
  androidPresentation = false,
  initialName,
  onSaved,
}: SkincareModalProps) {
  const {
    skincareProducts,
    currentProfileId,
    addSkincareProduct,
    updateSkincareProduct,
  } = useAppContext();

  const product = useMemo(
    () => skincareProducts.find(item => item.id === productId),
    [productId, skincareProducts],
  );
  const isEditing = Boolean(product);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const initialSnapshotRef = useRef('');
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  const [name, setName] = useState('');
  const [area, setArea] = useState<string>('Face');
  const [productType, setProductType] = useState<SkincareProductType>('other');
  const [price, setPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(toLocalDateKey(new Date()));
  const [startDate, setStartDate] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');
  const [frequency, setFrequency] = useState<SkincareFrequency>('Daily');
  const [schedule, setSchedule] = useState<SkincareSchedule>('both');
  const [sizeValue, setSizeValue] = useState('');
  const [sizeUnit, setSizeUnit] = useState<(typeof SIZE_UNITS)[number]>('mL');
  const [productLink, setProductLink] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [usageOpen, setUsageOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nameError, setNameError] = useState('');
  const [dateError, setDateError] = useState('');

  const taxonomy = useProfileModuleTaxonomy(
    'skincare',
    AREAS,
    skincareProducts.map(item => ({ category: item.category })),
  );
  const areaOptions = useMemo(() => {
    const options = taxonomy.activeCategories.map(item => ({ value: item.name, label: item.name }));
    const current = area.trim();
    if (current && !options.some(option => option.value.toLowerCase() === current.toLowerCase())) {
      return [{ value: current, label: current }, ...options];
    }
    return options;
  }, [area, taxonomy.activeCategories]);

  const suggestions = useMemo(() => {
    const seen = new Map<string, (typeof skincareProducts)[number]>();
    skincareProducts.forEach(item => {
      const key = item.name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, item);
    });
    return Array.from(seen.values());
  }, [skincareProducts]);

  const photoSource = usePhotoSource(async blob => {
    setPhoto(await downscaleImage(blob));
    setPhotoUrl('');
  });

  const getSnapshot = useCallback(
    () =>
      JSON.stringify({
        name,
        area,
        productType,
        price,
        currentPrice,
        purchaseDate,
        startDate,
        expectedDuration,
        frequency,
        schedule,
        sizeValue,
        sizeUnit,
        productLink,
        notes,
        photoUrl,
        photo,
        photoAssetIds,
      }),
    [
      name,
      area,
      productType,
      price,
      currentPrice,
      purchaseDate,
      startDate,
      expectedDuration,
      frequency,
      schedule,
      sizeValue,
      sizeUnit,
      productLink,
      notes,
      photoUrl,
      photo,
      photoAssetIds,
    ],
  );

  const resetForm = useCallback(() => {
    const today = toLocalDateKey(new Date());
    setName('');
    setArea('Face');
    setProductType('other');
    setPrice('');
    setCurrentPrice('');
    setPurchaseDate(today);
    setStartDate('');
    setExpectedDuration('');
    setFrequency('Daily');
    setSchedule('both');
    setSizeValue('');
    setSizeUnit('mL');
    setProductLink('');
    setNotes('');
    setPhotoUrl('');
    setPhoto(null);
    setPhotoAssetIds([]);
    setUsageOpen(true);
    setNotesOpen(false);
    setShowUnsavedDialog(false);
    setNameError('');
    setDateError('');
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(getActiveCurrency());
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    if (!product) {
      const today = toLocalDateKey(new Date());
      resetForm();
      setName(initialName || '');
      initialSnapshotRef.current = JSON.stringify({
        name: initialName || '',
        area: 'Face',
        productType: 'other',
        price: '',
        currentPrice: '',
        purchaseDate: today,
        startDate: '',
        expectedDuration: '',
        frequency: 'Daily',
        schedule: 'both',
        sizeValue: '',
        sizeUnit: 'mL',
        productLink: '',
        notes: '',
        photoUrl: '',
        photo: null,
        photoAssetIds: [],
      });
      return;
    }

    const parsedSize = parseSize(product.size);
    const savedPhoto = product.photo || product.image || null;
    const nextArea = product.category?.trim() || 'Other';

    setName(product.name || '');
    setArea(nextArea);
    setProductType(product.productType || 'other');
    setPrice(formatMoneyInputValue(product.purchasePrice, nextMoneyCurrency));
    setCurrentPrice(formatMoneyInputValue(product.currentPrice, nextMoneyCurrency));
    setPurchaseDate(product.purchaseDate ? toLocalDateKey(product.purchaseDate) : '');
    setStartDate(product.startDate ? toLocalDateKey(product.startDate) : '');
    setExpectedDuration(product.estimatedDuration ? String(product.estimatedDuration) : '');
    setFrequency(product.frequency || 'Daily');
    setSchedule(product.schedule || 'both');
    setSizeValue(parsedSize.amount);
    setSizeUnit(parsedSize.unit as (typeof SIZE_UNITS)[number]);
    setProductLink(product.productLink || '');
    setNotes(product.effects || '');
    setPhoto(savedPhoto);
    setPhotoAssetIds(Array.isArray(product.photoAssetIds) ? product.photoAssetIds : []);
    setPhotoUrl(savedPhoto?.startsWith('http') ? savedPhoto : '');
    setUsageOpen(true);
    setNotesOpen(Boolean(product.effects || product.productLink));
    setNameError('');
    setDateError('');
    setShowUnsavedDialog(false);

    queueMicrotask(() => {
      initialSnapshotRef.current = JSON.stringify({
        name: product.name || '',
        area: nextArea,
        productType: product.productType || 'other',
        price: formatMoneyInputValue(product.purchasePrice, nextMoneyCurrency),
        currentPrice: formatMoneyInputValue(product.currentPrice, nextMoneyCurrency),
        purchaseDate: product.purchaseDate ? toLocalDateKey(product.purchaseDate) : '',
        startDate: product.startDate ? toLocalDateKey(product.startDate) : '',
        expectedDuration: product.estimatedDuration ? String(product.estimatedDuration) : '',
        frequency: product.frequency || 'Daily',
        schedule: product.schedule || 'both',
        sizeValue: parsedSize.amount,
        sizeUnit: parsedSize.unit,
        productLink: product.productLink || '',
        notes: product.effects || '',
        photoUrl: savedPhoto?.startsWith('http') ? savedPhoto : '',
        photo: savedPhoto,
        photoAssetIds: product.photoAssetIds || [],
      });
    });
  }, [isOpen, product, resetForm, initialName]);

  const hasUnsavedChanges =
    isOpen &&
    initialSnapshotRef.current !== '' &&
    getSnapshot() !== initialSnapshotRef.current;

  const closeCleanly = useCallback(() => {
    initialSnapshotRef.current = '';
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const attemptClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    closeCleanly();
  }, [closeCleanly, hasUnsavedChanges]);

  const applySuggestion = (nextName: string) => {
    setName(nextName);
    if (isEditing) return;

    const suggestion = suggestions.find(
      item => item.name.toLowerCase() === nextName.trim().toLowerCase(),
    );
    if (!suggestion) return;

    const parsedSize = parseSize(suggestion.size);
    const savedPhoto = suggestion.photo || suggestion.image || null;
    const suggestedArea = AREAS.includes(suggestion.category as SkincareArea)
      ? (suggestion.category as SkincareArea)
      : 'Other';

    setArea(suggestedArea);
    setProductType(suggestion.productType || 'other');
    setPrice(formatMoneyInputValue(suggestion.purchasePrice, moneyInputCurrency));
    setCurrentPrice(formatMoneyInputValue(suggestion.currentPrice, moneyInputCurrency));
    setExpectedDuration(suggestion.estimatedDuration ? String(suggestion.estimatedDuration) : '');
    setFrequency(suggestion.frequency || 'Daily');
    setSchedule(suggestion.schedule || 'both');
    setSizeValue(parsedSize.amount);
    setSizeUnit(parsedSize.unit as (typeof SIZE_UNITS)[number]);
    setProductLink(suggestion.productLink || '');
    setNotes(suggestion.effects || '');
    setPhoto(savedPhoto);
    setPhotoUrl(savedPhoto?.startsWith('http') ? savedPhoto : '');
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhoto(reader.result as string);
      setPhotoUrl('');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const validate = () => {
    const trimmedName = name.trim();
    setNameError(trimmedName ? '' : 'Product name is required.');
    const finishedDate = product?.status === 'emptied' && product.emptiedAt
      ? toLocalDateKey(product.emptiedAt)
      : '';
    const datesOutOfOrder = Boolean(
      (purchaseDate && startDate && purchaseDate > startDate) ||
      (startDate && finishedDate && startDate > finishedDate) ||
      (purchaseDate && finishedDate && purchaseDate > finishedDate),
    );
    setDateError(datesOutOfOrder ? 'Dates must follow purchase, start, then finish order.' : '');
    const duration = expectedDuration.trim() ? Number(expectedDuration) : null;
    const invalidDuration = duration !== null && (!Number.isFinite(duration) || duration < 1);
    if (invalidDuration) setDateError('Typical duration must be at least one day.');
    return Boolean(trimmedName) && !datesOutOfOrder && !invalidDuration;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    taxonomy.addCategory(area);

    const productRecordId = product?.id || createEntityId('skincare');
    const purchasePriceBase = convertMoneyInputToBase(price, moneyInputCurrency);
    const currentPriceBase = convertMoneyInputToBase(currentPrice, moneyInputCurrency);
    let nextPhotoAssetIds = [...photoAssetIds];
    let nextPhoto = photo || '';
    if (isInlineDataUrl(photo)) {
      const blob = dataUrlToBlob(photo);
      if (!blob) {
        setNameError('The selected product photo could not be read.');
        return;
      }
      try {
        const asset = await mediaStorage.save(blob, {
          profileId: currentProfileId,
          ownerType: 'health',
          ownerId: productRecordId,
          role: 'primary',
          fileName: 'skincare-photo.jpg',
        });
        nextPhotoAssetIds = [asset.id];
        nextPhoto = '';
      } catch (error) {
        setNameError(error instanceof Error ? error.message : 'The product photo could not be saved.');
        return;
      }
    } else if (nextPhoto) {
      // An external URL replaces any previously managed asset. When the
      // editor is showing an existing managed asset, both fields are empty
      // until the user explicitly removes it, so retain its reference.
      nextPhotoAssetIds = [];
    } else if (!photoAssetIds.length) {
      nextPhotoAssetIds = [];
    }

    const payload = {
      id: productRecordId,
      name: name.trim(),
      category: area as SkincareProduct['category'],
      productType,
      purchasePrice: price.trim() ? Math.max(0, purchasePriceBase ?? 0) : undefined,
      currentPrice: currentPrice.trim() ? Math.max(0, currentPriceBase ?? 0) : undefined,
      purchaseDate: purchaseDate ? parseLocalDateInput(purchaseDate) : undefined,
      startDate: startDate ? parseLocalDateInput(startDate) : undefined,
      estimatedDuration: expectedDuration.trim() ? Math.max(1, Number(expectedDuration)) : undefined,
      frequency,
      schedule,
      size: sizeValue.trim() ? `${sizeValue.trim()}${sizeUnit}` : '',
      effects: notes.trim(),
      productLink: productLink.trim(),
      photo: nextPhoto,
      image: nextPhoto || undefined,
      status: product?.status || 'active',
      emptiedAt: product?.emptiedAt ?? null,
      emptiedNotes: product?.emptiedNotes,
      wouldRepurchase: product?.wouldRepurchase,
      repurchaseOfProductId: product?.repurchaseOfProductId,
      photoAssetIds: nextPhotoAssetIds,
    };

    if (product) {
      updateSkincareProduct(product.id, payload);
    } else {
      addSkincareProduct(payload);
      // productRecordId was generated above before the save call, so it is
      // already the new product's real ID - no lookup needed.
      onSaved?.(productRecordId);
    }

    closeCleanly();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return (
    <>
      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to close this modal?"
        confirmText="Discard"
        cancelText="Continue Editing"
        isDangerous
        onConfirm={() => {
          setShowUnsavedDialog(false);
          closeCleanly();
        }}
        onCancel={() => setShowUnsavedDialog(false)}
      />

      <CaizenFormDialog
        eyebrow={isEditing ? 'Edit product' : 'New product'}
        title={isEditing ? 'Edit Product' : 'Add Product'}
        description="Track price, usage dates, and a typical duration estimate."
        onClose={closeCleanly}
        onBeforeClose={() => {
          if (hasUnsavedChanges) {
            setShowUnsavedDialog(true);
            return false;
          }
          return true;
        }}
        maxWidthClass="max-w-3xl"
        maxHeightClass="max-h-[90dvh]"
        bodyClassName="p-0"
        androidPresentation={androidPresentation}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={attemptClose} className="h-11 rounded-xl px-5 sm:h-10">Cancel</Button>
            <Button type="submit" form="skincare-edit-form" disabled={!name.trim()} className="h-11 rounded-xl px-5 font-semibold sm:h-10">
              {isEditing ? 'Save Changes' : 'Add Product'}
            </Button>
          </div>
        )}
      >
            <form id="skincare-edit-form" onSubmit={handleSubmit} className="min-w-0">
              <div className="caizen-form-modal-body p-4 sm:p-5">
                <div className="mx-auto max-w-3xl space-y-4">
                    <section className="border-b border-border/50 pb-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold">Essentials</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          The minimum information needed to identify the product.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <FormField label="Product name" controlId="skincare-product-name" error={nameError || undefined}>
                          {({ id, describedBy, invalid }) => (
                            <>
                              <LocalSuggestionInput
                                id={id}
                                value={name}
                                candidates={suggestions.filter(item => item.id !== productId).map(item => item.name)}
                                onValueChange={value => {
                                  applySuggestion(value);
                                  if (nameError) setNameError('');
                                }}
                                placeholder="Beauty of Joseon Relief Sun"
                                aria-describedby={describedBy}
                                aria-invalid={invalid || undefined}
                                className={inputStyle}
                              />
                            </>
                          )}
                        </FormField>

                        <FormField label="Product link" controlId="skincare-product-link">
                          <Input
                            id="skincare-product-link"
                            value={productLink}
                            onChange={event => setProductLink(event.target.value)}
                            placeholder="https://..."
                            className={inputStyle}
                          />
                        </FormField>

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField label="Area" controlId="skincare-area">
                            <AndroidAdaptiveCreatableSelect
                              id="skincare-area"
                              value={area}
                              label="Area"
                              onChange={value => {
                                const normalized = value.trim() as SkincareArea;
                                taxonomy.addCategory(normalized);
                                setArea(normalized || 'Other');
                              }}
                              options={areaOptions}
                              className={inputStyle}
                            />
                          </FormField>

                          <FormField label="Product type" controlId="skincare-product-type">
                            <AndroidAdaptiveCombobox
                              id="skincare-product-type"
                              value={productType}
                              label="Product type"
                              onChange={value => setProductType(value as SkincareProductType)}
                              options={SKINCARE_PRODUCT_TYPES}
                              className={inputStyle}
                            />
                          </FormField>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <FormField label="Bought Price" controlId="skincare-bought-price">
                            <MoneyInput
                              id="skincare-bought-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={price}
                              currency={moneyInputCurrency}
                              onChange={event => setPrice(event.target.value)}
                              placeholder="Not entered"
                            />
                          </FormField>

                          <FormField label="Current / SRP Price" controlId="skincare-current-price">
                            <MoneyInput
                              id="skincare-current-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={currentPrice}
                              currency={moneyInputCurrency}
                              onChange={event => setCurrentPrice(event.target.value)}
                              placeholder="0"
                            />
                          </FormField>

                          <FormField asGroup label="Size" controlId="skincare-size-group">
                            <div className="flex min-w-0 gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                id="skincare-size-value"
                                aria-label="Size"
                                value={sizeValue}
                                onChange={event => setSizeValue(event.target.value)}
                                placeholder="50"
                                className={`${inputStyle} min-w-0`}
                              />
                              <AndroidAdaptiveCombobox
                                id="skincare-size-unit"
                                value={sizeUnit}
                                label="Size unit"
                                onChange={value => setSizeUnit(value as (typeof SIZE_UNITS)[number])}
                                options={SIZE_UNITS.map(value => ({ value, label: value }))}
                                className="h-11 w-24 shrink-0 rounded-xl border border-border/70 bg-background px-3 text-sm sm:h-10"
                              />
                            </div>
                          </FormField>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold">Product photo</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Upload, take a photo, or paste an image URL.
                        </p>
                      </div>

                      <RecordImageField
                        preview={photo ? (
                          <img src={photo} alt="Product preview" className="h-full w-full object-cover" />
                        ) : photoAssetIds[0] ? (
                          <MediaAssetImage assetId={photoAssetIds[0]} profileId={currentProfileId} alt="Product preview" className="h-full w-full object-cover" />
                        ) : null}
                        hasPreview={Boolean(photo || photoAssetIds[0])}
                        alt="product photo"
                        chooseLabel="Add product photo"
                        onChoose={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()}
                        onRemove={() => { setPhoto(null); setPhotoAssetIds([]); setPhotoUrl(''); }}
                        controls={(
                          <>
                            <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleUpload} />
                            <FormField label="Image URL" controlId="skincare-image-url">
                              <Input
                                id="skincare-image-url"
                                value={photoUrl}
                                onChange={event => {
                                  const value = event.target.value;
                                  setPhotoUrl(value);
                                  setPhoto(value.trim() || null);
                                }}
                                placeholder="https://example.com/image.jpg"
                                className={inputStyle}
                              />
                            </FormField>
                          </>
                        )}
                      />
                    </section>

                    <section className="overflow-hidden rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => setUsageOpen(value => !value)}
                        className="flex min-h-11 w-full items-center justify-between gap-4 p-3 text-left"
                      >
                        <div>
                          <h3 className="font-bold">Usage details</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Dates are used for actual duration and cost-per-day calculations.
                          </p>
                        </div>
                        <ChevronDown className={`h-5 w-5 transition-transform ${usageOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {usageOpen ? (
                        <div className="space-y-4 border-t border-border/40 p-4">
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <FormField label="Purchase date" controlId="skincare-purchase-date">
                              <AdaptiveDatePicker
                                id="skincare-purchase-date"
                                label="Purchase date"
                                value={purchaseDate}
                                onChange={setPurchaseDate}
                                className={inputStyle}
                              />
                            </FormField>
                            <FormField label="Start date" hint="Optional" controlId="skincare-start-date">
                              <AdaptiveDatePicker
                                id="skincare-start-date"
                                label="Start date"
                                value={startDate}
                                onChange={setStartDate}
                                className={inputStyle}
                              />
                            </FormField>
                            <FormField label="Typical duration" hint="Days · optional" controlId="skincare-expected-duration">
                              <Input
                                id="skincare-expected-duration"
                                type="number"
                                min="1"
                                step="1"
                                value={expectedDuration}
                                onChange={event => setExpectedDuration(event.target.value)}
                                placeholder="e.g. 60"
                                className={inputStyle}
                              />
                            </FormField>
                          </div>
                          {dateError ? <p className="text-sm font-medium text-destructive" role="alert">{dateError}</p> : null}

                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField label="Frequency" controlId="skincare-frequency">
                              <AndroidAdaptiveCombobox
                                id="skincare-frequency"
                                value={frequency}
                                label="Frequency"
                                onChange={value => setFrequency(value as SkincareFrequency)}
                                options={[
                                  { value: 'Daily', label: 'Daily' },
                                  { value: 'Weekly', label: 'Weekly' },
                                  { value: 'Custom', label: 'Custom' },
                                ]}
                                className={inputStyle}
                              />
                            </FormField>

                            <FormField label="Routine" controlId="skincare-routine">
                              <AndroidAdaptiveCombobox
                                id="skincare-routine"
                                value={schedule}
                                label="Routine"
                                onChange={value => setSchedule(value as SkincareSchedule)}
                                options={[
                                  { value: 'morning', label: 'Morning' },
                                  { value: 'night', label: 'Night' },
                                  { value: 'both', label: 'Morning & night' },
                                ]}
                                className={inputStyle}
                              />
                            </FormField>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="overflow-hidden rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => setNotesOpen(value => !value)}
                        className="flex min-h-11 w-full items-center justify-between gap-4 p-3 text-left"
                      >
                        <div>
                          <h3 className="font-bold">Notes</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Optional observations and benefits.
                          </p>
                        </div>
                        <ChevronDown className={`h-5 w-5 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {notesOpen ? (
                        <div className="space-y-4 border-t border-border/40 p-4">
                          <FormField label="Benefits and observations" controlId="skincare-benefits">
                            <Textarea
                              id="skincare-benefits"
                              value={notes}
                              onChange={event => setNotes(event.target.value)}
                              maxLength={1000}
                              placeholder="How it feels, visible results, irritation, texture, scent, or anything worth remembering."
                              className={textareaStyle}
                            />
                            <p className="text-right text-xs text-muted-foreground">
                              {notes.length} / 1000
                            </p>
                          </FormField>
                        </div>
                      ) : null}
                    </section>
                </div>
              </div>

            </form>
      </CaizenFormDialog>

      <PhotoSourceSheet
        open={photoSource.sheetOpen}
        title="Product photo"
        canRemove={Boolean(photo || photoUrl || photoAssetIds.length)}
        onCamera={photoSource.chooseCamera}
        onGallery={photoSource.chooseGallery}
        onRemove={() => {
          setPhoto(null);
          setPhotoAssetIds([]);
          setPhotoUrl('');
          photoSource.close();
        }}
        onClose={photoSource.close}
      />
    </>
  );
}
