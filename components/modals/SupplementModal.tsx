
'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  useState,
} from 'react';

import { createPortal } from 'react-dom';

import {
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNativeApp } from '@/lib/platform';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { RecordImageField } from '@/components/common/RecordImageField';
import { downscaleImage, usePhotoSource } from '@/hooks/use-photo-source';

import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { Combobox, CreatableCombobox } from '@/components/ui/combobox';
import { LocalSuggestionInput, dismissLocalSuggestionEscape } from '@/components/ui/local-suggestion-input';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { CaizenTimePicker } from '@/components/ui/sleep-time-picker';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { DEFAULT_SUPPLEMENT_TYPES } from '@/components/common/SupplementTypeSettingsButton';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { parseLocalDateInput } from '@/lib/date-utils';
import { toLocalDateKey } from '@/lib/utils';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { createEntityId } from '@/lib/utils';
import { dataUrlToBlob, isInlineDataUrl } from '@/lib/storage/legacy-media';
import { mediaStorage } from '@/lib/storage/media-storage';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import { AndroidBooleanControl, AndroidDismissibleBackdrop, CaizenSelectionSheet } from '@/components/native/android-design';

/* =========================================
   STYLES
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

  focus:border-emerald-500/30
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
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

  focus:border-emerald-500/30
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
`;

const formatSupplementTypeLabel = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());

/* =========================================
   FIELD
========================================= */

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">

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

      <div className="min-h-[16px] pt-0.5">
        {error ? <p role="alert" className="text-xs font-semibold text-destructive">{error}</p> : null}
      </div>

    </div>
  );
}

/* =========================================
   COMPONENT
========================================= */

interface SupplementModalProps {
  isOpen: boolean;
  supplementId?: string | null;
  onClose: () => void;
  /** Prefills the Name field when creating a new supplement (e.g. from the Balance transaction Link picker). Purely a starting value - the user can still change it. */
  initialName?: string;
  /** Called with the new supplement's ID right after a create (not edit) succeeds, in addition to the normal onClose. */
  onSaved?: (id: string) => void;
}

export default function SupplementModal({
  isOpen,
  supplementId,
  onClose,
  initialName,
  onSaved,
}: SupplementModalProps) {
  const {
    addSupplement,
    supplements,
    currentProfileId,
    updateSupplement,
  } = useAppContext();

  const isEditing =
    Boolean(supplementId);

  const supplement =
    supplements.find(
      s => s.id === supplementId
    );

  const fileRef =
    useRef<HTMLInputElement>(null);

  const [name, setName] =
    useState('');

  const [price, setPrice] =
    useState('');

  const [currentPrice, setCurrentPrice] =
    useState('');

  const [startDate, setStartDate] =
    useState('');

  const [
    expiryDate,
    setExpiryDate,
  ] = useState('');

  const [
    benefits,
    setBenefits,
  ] = useState('');

  const [quantity, setQuantity] =
    useState('');

  const [unit, setUnit] =
    useState('capsules');
  const [unitSheetOpen, setUnitSheetOpen] = useState(false);
  const [intakeSheetOpen, setIntakeSheetOpen] = useState(false);
  const taxonomy = useProfileModuleTaxonomy('supplements', ['capsules', 'tablets', 'ml'], supplements.map(item => ({ category: item.dosage?.split(',')[0]?.trim().split(/\s+/).slice(1).join(' ') })));
  const unitOptions = useMemo(() => {
    const options = taxonomy.activeCategories.map(entry => ({ value: entry.name, label: entry.name }));
    const current = unit.trim();
    return current && !options.some(option => option.value.toLowerCase() === current.toLowerCase())
      ? [{ value: current, label: current }, ...options]
      : options;
  }, [taxonomy.activeCategories, unit]);

  // Type answers "what kind of supplement is this" (Vitamin, Mineral, ...)
  // and is a completely separate concept/taxonomy from the dosage Unit
  // above (capsules, tablets, ml). Do not merge the two.
  const [type, setType] = useState('');
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const typeTaxonomy = useProfileModuleTaxonomy('supplement-types', DEFAULT_SUPPLEMENT_TYPES, supplements.map(item => ({ category: item.type })));
  const typeOptions = useMemo(() => {
    const options = typeTaxonomy.activeCategories.map(entry => ({ value: entry.name, label: formatSupplementTypeLabel(entry.name) }));
    const current = type.trim();
    // A record whose type isn't in the active taxonomy (e.g. an archived or
    // otherwise unlisted value) still needs to be visible and selectable
    // here rather than silently dropped.
    return current && !options.some(option => option.value.toLowerCase() === current.toLowerCase())
      ? [{ value: current, label: formatSupplementTypeLabel(current) }, ...options]
      : options;
  }, [typeTaxonomy.activeCategories, type]);

  const [
    dailyIntake,
    setDailyIntake,
  ] = useState('1');

  const [
    productLink,
    setProductLink,
  ] = useState('');

  // Native capture path. The image lives inline in profile JSON here, so the
  // blob is downscaled before it is stored.
  const photoSource = usePhotoSource(async (blob) => {
    setImage(await downscaleImage(blob));
    setImageUrl('');
  });

  const [reminderEnabled, setReminderEnabled] =
    useState(false);

  const [reminderTime, setReminderTime] =
    useState('08:00');

  const [image, setImage] =
    useState<string | null>(null);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);

  const [imageUrl, setImageUrl] =
    useState('');

  const [
    showUnsavedDialog,
    setShowUnsavedDialog,
  ] = useState(false);

  const [errors, setErrors] = useState<{ name?: string; price?: string; currentPrice?: string; quantity?: string; intake?: string; benefits?: string; productLink?: string; imageUrl?: string; unit?: string; reminderTime?: string; form?: string }>({});
  const moneyInputCurrencyRef = useRef(
    getEffectiveMoneyInputCurrency(getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  /* =========================================
     LOAD DATA
  ========================================= */

  useEffect(() => {
    if (!isOpen) return;

    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(getActiveCurrency());
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    if (!isEditing || !supplement) {
      resetForm();
      setName(initialName || '');
      return;
    }

    setName(
      supplement.name || ''
    );

    setPrice(
      formatMoneyInputValue(supplement.purchasePrice, nextMoneyCurrency)
    );

    setCurrentPrice(formatMoneyInputValue(supplement.currentPrice, nextMoneyCurrency));

    setStartDate(
      supplement.startDate ? toLocalDateKey(supplement.startDate) : ''
    );

    setExpiryDate(
      supplement.expiryDate ? toLocalDateKey(supplement.expiryDate) : ''
    );

    setBenefits(
      supplement.effects ||
      ''
    );

    setQuantity(
      String(
        supplement.dosageAmount ?? supplement.quantityRemaining ??
        ''
      )
    );

    setUnit(supplement.dosageUnit || 'capsules');
    setType(supplement.type || '');
    setDailyIntake(String(supplement.dailyIntake ?? 1));

    setProductLink(
      supplement.productLink ||
      ''
    );

    setImage(
      supplement.image || null
    );
    setPhotoAssetIds(Array.isArray(supplement.photoAssetIds) ? supplement.photoAssetIds : []);

    setReminderEnabled(
      Boolean(supplement.reminderEnabled)
    );

    setReminderTime(
      supplement.reminderTime || '08:00'
    );

    /* =========================================
       PARSE DOSAGE
    ========================================= */

    if (
      supplement.dosage
    ) {
      const parts =
        supplement.dosage.split(
          ','
        );

      if (parts[0] && supplement.dosageAmount == null) {
        const qtyMatch =
          parts[0].match(
            /^(\d+(?:\.\d+)?)\s+(.+)$/
          );

        if (qtyMatch) {
          setQuantity(
            qtyMatch[1]
          );

          setUnit(
            qtyMatch[2]
          );
        }
      }

      if (parts[1] && supplement.dailyIntake == null) {
        const intakeMatch =
          parts[1].match(
            /(\d+(?:\.\d+)?)x/
          );

        if (intakeMatch) {
          setDailyIntake(
            intakeMatch[1]
          );
        }
      }
    }
  }, [isEditing, isOpen, supplement, initialName]);

  const hasUnsavedChanges =
    isEditing && supplement
      ? (
      name !==
      (supplement.name || '') ||

      price !==
        formatMoneyInputValue(supplement.purchasePrice, moneyInputCurrency) ||

      currentPrice !==
        formatMoneyInputValue(supplement.currentPrice, moneyInputCurrency) ||

      startDate !==
      (
        supplement.startDate ? toLocalDateKey(supplement.startDate) : ''
      ) ||

      expiryDate !==
      (
        supplement.expiryDate ? toLocalDateKey(supplement.expiryDate) : ''
      ) ||

      benefits !==
      (
        supplement.effects ||
        ''
      ) ||

      quantity !==
        String(supplement.dosageAmount ?? supplement.quantityRemaining ?? '') ||

      unit !==
        (supplement.dosageUnit || 'capsules') ||

      type !==
        (supplement.type || '') ||

      dailyIntake !==
        String(supplement.dailyIntake ?? 1) ||

      productLink !==
      (
        supplement.productLink ||
        ''
      ) ||

      imageUrl.trim() !== '' ||

      image !==
      (
        supplement.image ||
        null
      )
    )
      : (
      name.trim() !== '' ||
      price.trim() !== '' ||
      currentPrice.trim() !== '' ||
      startDate.trim() !== '' ||
      expiryDate.trim() !== '' ||
      benefits.trim() !== '' ||
      quantity.trim() !== '' ||
      unit !== 'capsules' ||
      type.trim() !== '' ||
      dailyIntake !== '1' ||
      productLink.trim() !== '' ||
      image !== null ||
      imageUrl.trim() !== ''
    );

  const resetForm = () => {
    setName('');
    setPrice('');
    setCurrentPrice('');
    setStartDate('');
    setExpiryDate('');
    setBenefits('');
    setQuantity('');
    setUnit('capsules');
    setType('');
    setDailyIntake('1');
    setProductLink('');
    setImage(null);
    setPhotoAssetIds([]);
    setImageUrl('');
    setReminderEnabled(false);
    setReminderTime('08:00');
    setErrors({});
  };


  const attemptClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }

    onClose();
  };
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useOverlayLifecycle(isOpen, attemptClose, { containerRef: modalPanelRef, onEscapeKeyDown: dismissLocalSuggestionEscape });

  /* =========================================
       IMAGE
    ========================================= */

  const handleUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onloadend = () =>
      setImage(reader.result as string);

    reader.readAsDataURL(file);
  };

  /* =========================================
     SUBMIT
  ========================================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName =
      name.trim();

    const unchanged = (value: string, legacy?: string | number | null) => isEditing && value === String(legacy ?? '');
    const nameError = unchanged(name, supplement?.name) ? undefined : validateHealthText(name, { label: 'Supplement name', maxLength: 120, required: true });
    const priceError = unchanged(price, supplement?.purchasePrice) ? undefined : validateHealthNumber(price, { label: 'Price', ...HEALTH_LIMITS.supplementPrice, allowBlank: true });
    const currentPriceError = unchanged(currentPrice, supplement?.currentPrice) ? undefined : validateHealthNumber(currentPrice, { label: 'Current price', ...HEALTH_LIMITS.supplementPrice, allowBlank: true });
    const quantityError = unchanged(quantity, supplement?.dosageAmount ?? supplement?.quantityRemaining) ? undefined : validateHealthNumber(quantity, { label: 'Quantity', ...HEALTH_LIMITS.supplementQuantity, allowBlank: true });
    const intakeError = unchanged(dailyIntake, supplement?.dailyIntake ?? 1) ? undefined : validateHealthNumber(dailyIntake, { label: 'Daily intake', ...HEALTH_LIMITS.dailyIntake });
    const benefitsError = unchanged(benefits, supplement?.effects) ? undefined : validateHealthText(benefits, { label: 'Benefits and notes', maxLength: 1000, mode: 'multiline' });
    const normalizedProductLink = productLink.trim() ? normalizeExternalWebUrl(productLink) : null;
    const normalizedImageUrl = imageUrl.trim() ? normalizeExternalWebUrl(imageUrl) : null;
    const urlError = productLink.trim() && !normalizedProductLink && !unchanged(productLink, supplement?.productLink) ? 'Enter a valid https URL.' : undefined;
    const imageUrlError = imageUrl.trim() && !normalizedImageUrl && !unchanged(imageUrl, supplement?.image) ? 'Enter a valid image URL.' : undefined;
    const unitError = quantity.trim() && !unit.trim() ? 'Enter a unit when quantity is supplied.' : undefined;
    const reminderError = reminderEnabled && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(reminderTime)
      ? 'Choose a valid reminder time.'
      : undefined;
    const dateError = expiryDate && startDate && expiryDate < startDate && !(unchanged(expiryDate, supplement?.expiryDate ? toLocalDateKey(supplement.expiryDate) : '') && unchanged(startDate, supplement?.startDate ? toLocalDateKey(supplement.startDate) : ''))
      ? 'Expiry date must be on or after the start date.'
      : undefined;
    const formError = [nameError, priceError, currentPriceError, quantityError, intakeError, benefitsError, urlError, imageUrlError, unitError, reminderError, dateError]
      .filter((message): message is string => Boolean(message))
      .join(' ');

    if (formError) {
      setErrors({
        name: nameError,
        price: priceError,
        currentPrice: currentPriceError,
        quantity: quantityError,
        intake: intakeError,
        benefits: benefitsError,
        productLink: urlError,
        imageUrl: imageUrlError,
        unit: unitError,
        reminderTime: reminderError,
        form: formError,
      });

      return;
    }

    setErrors({});

    const purchasePriceBase = convertMoneyInputToBase(price, moneyInputCurrency);
    const currentPriceBase = convertMoneyInputToBase(currentPrice, moneyInputCurrency);

    const amount = Math.max(0, Number.isFinite(Number(quantity)) ? Number(quantity) : 0);
    const intake = Math.max(0, Number.isFinite(Number(dailyIntake)) ? Number(dailyIntake) : 1);
    const normalizedUnit = unit.trim() || 'capsules';
    const supplementRecordId = supplement?.id || createEntityId('supplement');
    let nextImage: string | null | undefined = normalizedImageUrl || image;
    let nextPhotoAssetIds = [...photoAssetIds];
    if (isInlineDataUrl(nextImage)) {
      const blob = dataUrlToBlob(nextImage);
      if (!blob) {
        setErrors({ form: 'The selected supplement image could not be read.' });
        return;
      }
      try {
        const asset = await mediaStorage.save(blob, {
          profileId: currentProfileId,
          ownerType: 'health',
          ownerId: supplementRecordId,
          role: 'primary',
          fileName: 'supplement-photo.jpg',
        });
        nextPhotoAssetIds = [asset.id];
        nextImage = undefined;
      } catch (error) {
        setErrors({ form: error instanceof Error ? error.message : 'The supplement image could not be saved.' });
        return;
      }
    } else if (nextImage) {
      // A URL replaces a previously managed image. An unchanged managed
      // image has no inline URL in the editor, so its asset ID is retained.
      nextPhotoAssetIds = [];
    } else if (!photoAssetIds.length) {
      nextPhotoAssetIds = [];
    }

    const supplementData = {
        id: supplementRecordId,
        name: trimmedName,
        type: type.trim() || undefined,

        purchasePrice: price.trim() ? Math.max(0, purchasePriceBase ?? 0) : 0,
        currentPrice: currentPrice.trim() ? Math.max(0, currentPriceBase ?? 0) : undefined,

        startDate: parseLocalDateInput(startDate || toLocalDateKey(new Date())),

        expiryDate: expiryDate
          ? parseLocalDateInput(expiryDate)
          : null,

        effects: benefits
          .replace(
            /^[*-]\s/gm,
            '• '
          ),

        dosage: `${amount} ${normalizedUnit}, ${intake}x daily`,
        dosageAmount: amount,
        dosageUnit: normalizedUnit,
        dailyIntake: intake,

        quantityRemaining:
          amount,

        productLink: normalizedProductLink || (unchanged(productLink, supplement?.productLink) ? productLink.trim() || undefined : undefined),

        image: nextImage,
        photoAssetIds: nextPhotoAssetIds,

        reminderEnabled,
        reminderTime: reminderEnabled ? reminderTime : undefined,
      };

    if (reminderEnabled && isNativeApp()) void ensureNotificationPermission();

    if (isEditing && supplement) {
      updateSupplement(
        supplement.id,
        supplementData
      );
    } else {
      addSupplement(supplementData);
      // supplementRecordId was generated above before the save call, so it
      // is already the new supplement's real ID - no lookup needed.
      onSaved?.(supplementRecordId);
      resetForm();
    }

    onClose();
  };

  if (
    !isOpen ||
    (isEditing && !supplement)
  )
    return null;

  return createPortal(
    (
      <>
        <div
          data-caizen-overlay="open"
          className={healthResponsive.dialog + " fixed inset-0 z-[999] overflow-hidden"}
        >

          {/* BACKDROP */}
          <AndroidDismissibleBackdrop
            onClose={attemptClose}
            ariaLabel="Close supplement form"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* WRAPPER */}
          <div
            className="caizen-form-modal-root
          fixed inset-0

          flex
          items-center
          justify-center

          p-3
          sm:p-4
        "
          >

            {/* MODAL */}
            <div
              ref={modalPanelRef}
              tabIndex={-1}
              onClick={e =>
                e.stopPropagation()
              }
              className="caizen-form-modal
            modal-card-enter
            relative

            flex
            max-h-[90dvh]
            w-full
            max-w-4xl

            flex-col
            overflow-hidden

            rounded-2xl

            border border-border/70

            bg-background

            shadow-2xl shadow-black/30
          "
            >

              {/* HEADER */}
              <div
                className="
              relative
              shrink-0

              border-b border-border/50

              px-4 py-3
              sm:px-5 sm:py-4
            "
              >

                <div
                  className="
                flex
                items-start
                justify-between
                gap-4
              "
                >

                  <div className="min-w-0">

                    <h2
                      className="
                    text-xl
                    sm:text-2xl
                    font-bold
                    tracking-tight
                  "
                    >

                      {isEditing
                        ? 'Edit Supplement'
                        : 'Add Supplement'}

                    </h2>

                  </div>

                  <button
                    type="button"
                    onClick={attemptClose}
                    aria-label="Close supplement modal"
                    className="
                  grid size-11 shrink-0 place-items-center rounded-xl
                  border border-border/60
                  bg-background

                  text-muted-foreground

                  transition-colors
                  hover:bg-muted/40 hover:text-foreground
                "
                  >

                    <X className="h-5 w-5" />

                  </button>

                </div>

              </div>

              {/* FORM */}
              <form
                noValidate
                onSubmit={
                  handleSubmit
                }
                className="
              flex
              min-h-0
              flex-1
              flex-col
            "
              >

                {/* SCROLL */}
                <div
                  className="caizen-form-modal-body
                min-h-0
                flex-1
                overflow-y-auto

                px-4
                py-3
                sm:px-5
              "
                >

                  {errors.form ? <p className="mb-3 text-sm font-semibold text-destructive" role="alert">{errors.form}</p> : null}

                  <div className="space-y-4">
                    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">

                    {/* LEFT */}
                    <div className="min-w-0 space-y-3">

                      <Field label="Supplement Name" htmlFor="supplement-name" error={errors.name}>

                        <div className="space-y-2">

                          <LocalSuggestionInput
                            id="supplement-name"
                            value={name}
                            aria-invalid={Boolean(errors.name)}
                            candidates={supplements.filter(entry => entry.id !== supplementId).map(entry => entry.name)}
                            onValueChange={value => {
                              const result = guardHealthTextChange(name, value, { label: 'Supplement name', maxLength: 120 });
                              if (!result.accepted) return setErrors(current => ({ ...current, name: result.error }));
                              setName(result.value);
                              setErrors(current => ({ ...current, name: result.error, form: undefined }));
                            }}
                            className={`
        ${inputStyle}

        ${errors.name
                                ? 'border-red-500'
                                : ''
                              }
      `}
                          />

                        </div>

                      </Field>

                      <div
                        className="
                      grid
                      grid-cols-1
                      gap-3
                      sm:grid-cols-3
                    "
                      >

                        <Field label="Price" htmlFor="supplement-price" error={errors.price}>

                          <MoneyInput
                            id="supplement-price"
                            type="number"
                            value={price}
                            currency={moneyInputCurrency}
                            placeholder="Optional"
                            onChange={e =>
                              setPrice(
                                e.target.value
                              )
                            }
                          />

                        </Field>

                        <Field label="Current Price" htmlFor="supplement-current-price" error={errors.currentPrice}>

                          <MoneyInput
                            id="supplement-current-price"
                            type="number"
                            value={currentPrice}
                            currency={moneyInputCurrency}
                            placeholder="Optional"
                            onChange={e =>
                              setCurrentPrice(
                                e.target.value
                              )
                            }
                          />

                        </Field>

                        <Field label="Quantity" htmlFor="supplement-quantity" error={errors.quantity}>

                          <input
                            id="supplement-quantity"
                            value={quantity}
                            placeholder="Optional"
                            onChange={e => {
                              const result = guardHealthNumberChange(quantity, e.target.value, { label: 'Quantity', ...HEALTH_LIMITS.supplementQuantity, allowBlank: true, unit: unit || undefined });
                              if (!result.accepted) return setErrors(current => ({ ...current, quantity: result.error }));
                              setQuantity(result.value);
                              setErrors(current => ({ ...current, quantity: result.error, form: undefined }));
                            }}
                            onBlur={() => setErrors(current => ({ ...current, quantity: validateHealthNumber(quantity, { label: 'Quantity', ...HEALTH_LIMITS.supplementQuantity, allowBlank: true, unit: unit || undefined }) }))}
                            className={
                              `${inputStyle} health-number-input`
                            }
                          />

                        </Field>

                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Start Date" htmlFor="supplement-start-date">
                          <AdaptiveDatePicker
                            id="supplement-start-date"
                            label="Start date"
                            value={startDate}
                            onChange={setStartDate}
                            className={inputStyle}
                          />
                        </Field>

                        <Field label="Expiry Date" htmlFor="supplement-expiry-date">
                          <AdaptiveDatePicker
                            id="supplement-expiry-date"
                            label="Expiry date"
                            value={expiryDate}
                            onChange={setExpiryDate}
                            className={inputStyle}
                          />
                        </Field>
                      </div>

                    </div>

                    {/* RIGHT */}
                    <div className="min-w-0">
                      <RecordImageField
                        preview={photoAssetIds[0] && !imageUrl && !image ? (
                          <MediaAssetImage
                            assetId={photoAssetIds[0]}
                            profileId={currentProfileId}
                            alt={`${name || supplement?.name || 'Supplement'} image preview`}
                            className="h-full w-full object-cover"
                          />
                        ) : imageUrl || image ? (
                          <img
                            src={imageUrl || image || undefined}
                            alt={`${name || supplement?.name || 'Supplement'} image preview`}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                        hasPreview={Boolean(imageUrl || image || photoAssetIds[0])}
                        alt="supplement image"
                        label="Supplement image"
                        chooseLabel="Upload supplement image"
                        onChoose={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()}
                        onRemove={() => { setImage(null); setPhotoAssetIds([]); setImageUrl(''); }}
                        controls={(
                          <>
                            <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleUpload} />
                            <Field label="Image URL" htmlFor="supplement-photo-url" error={errors.imageUrl}>
                              <input
                                id="supplement-photo-url"
                                value={imageUrl}
                                onChange={e => {
                                  const result = guardHealthTextChange(imageUrl, e.target.value, { label: 'Image URL', maxLength: 2048 });
                                  if (!result.accepted) return setErrors(current => ({ ...current, imageUrl: result.error }));
                                  setImageUrl(result.value);
                                  setErrors(current => ({ ...current, imageUrl: result.error, form: undefined }));
                                }}
                                className={inputStyle}
                                placeholder="https://example.com/image.jpg"
                              />
                            </Field>
                          </>
                        )}
                      />
                    </div>
                    </div>

                    <div className="min-w-0 space-y-3">

                      <div
                        className="
                      grid
                      grid-cols-1
                        gap-3
                      sm:grid-cols-2
                    "
                      >

                        <Field label="Type" htmlFor="supplement-type">

                          {isNativeApp() ? <button id="supplement-type" type="button" onClick={() => setTypeSheetOpen(true)} className={`${inputStyle} flex items-center justify-between text-left font-semibold`} aria-haspopup="dialog"><span>{type ? formatSupplementTypeLabel(type) : 'Choose a type'}</span><span aria-hidden="true">›</span></button> : <CreatableCombobox
                            id="supplement-type"
                            value={type}
                            onChange={value => { typeTaxonomy.addCategory(value); setType(value.trim()); }}
                            ariaLabel="Supplement type"
                            options={typeOptions}
                            className={
                              inputStyle
                            }
                          />}

                        </Field>

                        <Field label="Unit" htmlFor="supplement-unit" error={errors.unit}>

                          {isNativeApp() ? <button id="supplement-unit" type="button" onClick={() => setUnitSheetOpen(true)} className={`${inputStyle} flex items-center justify-between text-left font-semibold`} aria-haspopup="dialog"><span>{unit || 'Choose a unit'}</span><span aria-hidden="true">›</span></button> : <CreatableCombobox
                            id="supplement-unit"
                            value={unit}
                            onChange={value => { taxonomy.addCategory(value); setUnit(value.trim()); }}
                            ariaLabel="Supplement unit"
                            options={unitOptions}
                            className={
                              inputStyle
                            }
                          />}

                        </Field>

                      </div>

                      <div className="grid grid-cols-1 gap-3">

                        <Field label="Daily Intake" htmlFor="supplement-daily-intake" error={errors.intake}>

                          {isNativeApp() ? <button id="supplement-daily-intake" type="button" onClick={() => setIntakeSheetOpen(true)} className={`${inputStyle} flex items-center justify-between text-left font-semibold`} aria-haspopup="dialog"><span>{dailyIntake}x Daily</span><span aria-hidden="true">›</span></button> : <Combobox
                            id="supplement-daily-intake"
                            value={
                              dailyIntake
                            }
                            onChange={setDailyIntake}
                            ariaLabel="Daily intake"
                            options={[
                              { value: '1', label: '1x Daily' },
                              { value: '2', label: '2x Daily' },
                              { value: '3', label: '3x Daily' },
                            ]}
                            className={
                              inputStyle
                            }
                          />}

                        </Field>

                      </div>

                      <Field label="Reminder" htmlFor="supplement-reminder-enabled" error={errors.reminderTime}>
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
                          <label className="flex items-center gap-2 text-sm font-semibold">
                            <AndroidBooleanControl
                              id="supplement-reminder-enabled"
                              checked={reminderEnabled}
                              onCheckedChange={setReminderEnabled}
                            />
                            Remind me to take this
                          </label>
                          {reminderEnabled && (
                            <CaizenTimePicker
                              label="Supplement reminder time"
                              value={reminderTime}
                              onChange={setReminderTime}
                              required={reminderEnabled}
                              className={inputStyle}
                            />
                          )}
                        </div>
                      </Field>

                      <Field label="Product Link" htmlFor="supplement-product-link" error={errors.productLink}>

                        <input
                          id="supplement-product-link"
                          type="url"
                          inputMode="url"
                          value={
                            productLink
                          }
                            onChange={e =>
                              (() => {
                                const result = guardHealthTextChange(productLink, e.target.value, { label: 'Product URL', maxLength: 2048 });
                                if (!result.accepted) {
                                  setErrors(current => ({ ...current, productLink: result.error }));
                                  return;
                                }
                                setProductLink(result.value);
                                setErrors(current => ({ ...current, productLink: result.error, form: undefined }));
                              })()
                            }
                          className={
                            inputStyle
                          }
                        />

                      </Field>

                      <Field label="Benefits & Notes" htmlFor="supplement-benefits" error={errors.benefits}>

                        <div className="space-y-2">

                          <textarea
                            id="supplement-benefits"
                            value={benefits}
                            onChange={e => {
                              const result = guardHealthTextChange(benefits, e.target.value, { label: 'Benefits and notes', maxLength: 1000, mode: 'multiline' });
                              if (!result.accepted) return setErrors(current => ({ ...current, benefits: result.error }));
                              setBenefits(result.value);
                              setErrors(current => ({ ...current, benefits: result.error, form: undefined }));
                            }}
                            className={
                              textareaStyle
                            }
                          />

                          <div
                            className="
        text-right
        text-xs
        text-muted-foreground
      "
                          >
                            {benefits.length} / 1000
                          </div>

                        </div>

                      </Field>

                    </div>

                  </div>

                </div>

                {/* FOOTER */}
                <div
                  className="
                shrink-0

                border-t border-border/50

                bg-background

                px-4
                py-3
                sm:px-5
              "
                >

                  <div
                    className="
                  flex
                  flex-col-reverse
                  gap-2

                  sm:flex-row
                  sm:justify-end
                "
                  >

                    <Button
                      type="button"
                      variant="outline"
                      onClick={attemptClose}
                      className="
                    h-11 sm:h-10
                    rounded-xl
                    px-5
                  "
                    >

                      Cancel

                    </Button>

                    <Button
                      type="submit"
                      className="
                    h-11 sm:h-10
                    rounded-xl
                    px-5
                    font-semibold
                  "
                    >

                      {isEditing
                        ? 'Save Changes'
                        : 'Add Supplement'}

                    </Button>

                  </div>

                </div>

              </form>

            </div>

          </div>

        </div>

        <ConfirmDialog
          isOpen={
            showUnsavedDialog
          }
          title="Discard Changes?"
          message="You have unsaved changes."
          confirmText="Discard"
          cancelText="Keep Editing"
          isDangerous
          onConfirm={() => {
            setShowUnsavedDialog(
              false
            );

            onClose();
          }}
          onCancel={() =>
            setShowUnsavedDialog(
              false
            )
          }
        />

        <CaizenSelectionSheet open={typeSheetOpen} title="Type" value={type} options={typeOptions} onChange={value => { typeTaxonomy.addCategory(value); setType(value.trim()); }} onClose={() => setTypeSheetOpen(false)} searchable creatable />
        <CaizenSelectionSheet open={unitSheetOpen} title="Unit" value={unit} options={unitOptions} onChange={value => { taxonomy.addCategory(value); setUnit(value.trim()); }} onClose={() => setUnitSheetOpen(false)} searchable creatable />
        <CaizenSelectionSheet open={intakeSheetOpen} title="Daily intake" value={dailyIntake} options={[{ value: '1', label: 'Once daily' }, { value: '2', label: 'Twice daily' }, { value: '3', label: 'Three times daily' }]} onChange={setDailyIntake} onClose={() => setIntakeSheetOpen(false)} />
        <PhotoSourceSheet
          open={photoSource.sheetOpen}
          title="Supplement photo"
          canRemove={Boolean(image || imageUrl || photoAssetIds.length)}
          onCamera={photoSource.chooseCamera}
          onGallery={photoSource.chooseGallery}
          onRemove={() => {
            setImage(null);
            setPhotoAssetIds([]);
            setImageUrl('');
            photoSource.close();
          }}
          onClose={photoSource.close}
        />

      </>
    ),
    document.body
  );
}
