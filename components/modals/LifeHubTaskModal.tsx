'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Bell, CheckCircle2, ImagePlus, Lightbulb, Loader2, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { RecordImageField } from '@/components/common/RecordImageField';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import {
  CancelButton,
  FormField,
  ModalFooter,
  SaveButton,
} from '@/components/common/FormPatterns';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import {
  AndroidAdaptiveSelect,
} from '@/components/native/android-design';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { Switch } from '@/components/ui/switch';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Input } from '@/components/ui/input';
import type {
  Game,
  LifeHubLinkedContext,
  ProductivityItem,
  ProductivityPriority,
  ProductivityType,
  SkincareProduct,
  Supplement,
  TrashItem,
  UpcomingMoneyItem,
  WorkItem,
  WorkoutPlan,
  WorkoutRoutine,
} from '@/lib/types';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { resolveEffectiveLinkedLifeHubLink } from '@/lib/lifehub/linked-context';

type CaptureType = Extract<ProductivityType, 'task' | 'idea' | 'reminder'>;

export type PendingVisualImage = {
  blob: Blob;
  fileName: string;
  fingerprint: string;
};

export type LifeHubTaskDraft = {
  title: string;
  description: string;
  type: CaptureType;
  priority: ProductivityPriority;
  deadline?: string;
  estimatedMinutes?: number;
  tags?: string[];
  reminderEnabled: boolean;
  reminderTime?: string;
  showInCalendar?: boolean;
  linkedGameId?: string;
  linkedContext?: LifeHubLinkedContext;
  photoAssetIds?: string[];
  visualReferenceUrl?: string;
  pendingVisualImage?: PendingVisualImage;
  removeVisualReference?: boolean;
};

type Props = {
  isOpen: boolean;
  item?: ProductivityItem | null;
  profileId?: string;
  games: Game[];
  supplements: Supplement[];
  skincareProducts: SkincareProduct[];
  workItems: WorkItem[];
  upcomingMoneyItems?: UpcomingMoneyItem[];
  workoutPlans?: WorkoutPlan[];
  workoutRoutines?: WorkoutRoutine[];
  trashItems?: TrashItem[];
  initialType?: ProductivityType;
  initialDeadline?: string;
  androidPresentation?: boolean;
  onSave: (draft: LifeHubTaskDraft) => void | Promise<void>;
  onClose: () => void;
};

const PRIORITIES: Array<{ value: ProductivityPriority; label: string; hint: string }> = [
  { value: 'critical', label: 'Urgent', hint: 'Needs attention first' },
  { value: 'important', label: 'High', hint: 'Meaningful and time-sensitive' },
  { value: 'normal', label: 'Medium', hint: 'Normal priority' },
  { value: 'optional', label: 'Low', hint: 'Nice to do' },
];

const CAPTURE_TYPES: Array<{ value: CaptureType; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'idea', label: 'Idea' },
  { value: 'reminder', label: 'Reminder' },
];

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function normalizeTaskTags(value: string): string[] {
  const tags = new Map<string, string>();
  value.split(',').forEach(raw => {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) return;
    const key = tag.toLocaleLowerCase();
    if (!tags.has(key)) tags.set(key, tag);
  });
  return [...tags.values()];
}

function captureSnapshot(input: {
  title: string;
  type: CaptureType;
  description: string;
  priority: ProductivityPriority;
  deadline: string;
  estimatedMinutes: string;
  tags: string;
  reminderEnabled: boolean;
  reminderTime: string;
  showInCalendar: boolean;
  linkedContext?: LifeHubLinkedContext;
  visualAssetId?: string;
  visualReferenceUrl: string;
  pendingVisualImage?: PendingVisualImage;
}) {
  const visual = input.visualAssetId || input.visualReferenceUrl.trim() || input.pendingVisualImage?.fingerprint
    ? {
        visualAssetId: input.visualAssetId,
        visualReferenceUrl: input.visualReferenceUrl.trim(),
        pendingVisualImage: input.pendingVisualImage?.fingerprint || null,
      }
    : {};

  return JSON.stringify({
    title: input.title,
    type: input.type,
    ...(input.type === 'task'
      ? {
          description: input.description,
          priority: input.priority,
          estimatedMinutes: input.estimatedMinutes,
          tags: input.tags,
          deadline: input.deadline,
          reminderEnabled: input.reminderEnabled,
          reminderTime: input.reminderTime,
          linkedContext: input.linkedContext,
        }
      : input.type === 'reminder'
        ? {
            description: input.description,
            deadline: input.deadline,
            reminderEnabled: input.reminderEnabled,
            reminderTime: input.reminderTime,
            showInCalendar: input.showInCalendar,
            ...visual,
          }
        : {
            description: input.description,
            ...visual,
          }),
  });
}

function imageFingerprint(file: File | Blob) {
  return `${file.type}:${file.size}:${file instanceof File ? file.name : 'clipboard-image'}`;
}

export default function LifeHubTaskModal({
  isOpen,
  item,
  profileId,
  initialType = 'task',
  initialDeadline,
  androidPresentation = false,
  onSave,
  onClose,
}: Props) {
  const managedByWorkHub = item?.linkOrigin === 'workhub-mirror';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CaptureType>('task');
  const [priority, setPriority] = useState<ProductivityPriority>('normal');
  const [deadline, setDeadline] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [tags, setTags] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [showInCalendar, setShowInCalendar] = useState(true);
  const [linkedContext, setLinkedContext] = useState<LifeHubLinkedContext | undefined>();
  const [existingVisualAssetId, setExistingVisualAssetId] = useState<string | undefined>();
  const [visualReferenceUrl, setVisualReferenceUrl] = useState('');
  const [pendingVisualImage, setPendingVisualImage] = useState<PendingVisualImage>();
  const [removeVisualReference, setRemoveVisualReference] = useState(false);
  const [imageError, setImageError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const hasExistingVisual = Boolean(existingVisualAssetId || visualReferenceUrl);
  const showVisualReference = type === 'idea' || hasExistingVisual || Boolean(pendingVisualImage);
  const effectiveVisualAssetId = removeVisualReference ? undefined : existingVisualAssetId;
  const visualPreviewUrl = visualReferenceUrl.trim()
    ? normalizeExternalWebUrl(visualReferenceUrl) || undefined
    : undefined;

  useEffect(() => {
    if (!isOpen) {
      setInitialSnapshot('');
      return;
    }

    const effectiveLink = item
      ? resolveEffectiveLinkedLifeHubLink(item)
      : { kind: 'none' as const };
    const nextType: CaptureType = item?.type === 'idea' || item?.type === 'reminder'
      ? item.type
      : item?.type === 'task'
        ? 'task'
        : initialType === 'idea' || initialType === 'reminder'
          ? initialType
          : 'task';
    const nextLinkedContext = effectiveLink.kind === 'context' ? effectiveLink.context : undefined;
    const nextVisualAssetId = item?.photoAssetIds?.[0];
    const nextUrl = item?.visualReferenceUrl || '';
    const next = {
      title: item?.title || '',
      description: item?.description || item?.notes || '',
      type: nextType,
      priority: item?.priority || 'normal',
      deadline: item?.deadline ? toLocalDateKey(item.deadline) : initialDeadline || '',
      estimatedMinutes: item?.estimatedMinutes ? String(item.estimatedMinutes) : '',
      tags: item?.tags?.join(', ') || '',
      reminderEnabled: nextType === 'reminder' ? item?.reminderEnabled !== false : Boolean(item?.reminderEnabled),
      reminderTime: item?.reminderTime || '09:00',
      showInCalendar: item?.showInCalendar !== false,
      linkedContext: nextLinkedContext,
      visualAssetId: nextVisualAssetId,
      visualReferenceUrl: nextUrl,
      pendingVisualImage: null,
    };

    setTitle(next.title);
    setDescription(next.description);
    setType(next.type);
    setPriority(next.priority);
    setDeadline(next.deadline);
    setEstimatedMinutes(next.estimatedMinutes);
    setTags(next.tags);
    setReminderEnabled(next.reminderEnabled);
    setReminderTime(next.reminderTime);
    setShowInCalendar(next.showInCalendar);
    setLinkedContext(next.linkedContext);
    setExistingVisualAssetId(nextVisualAssetId);
    setVisualReferenceUrl(nextUrl);
    setPendingVisualImage(undefined);
    setRemoveVisualReference(false);
    setImageError('');
    setUrlError('');
    setInitialSnapshot(captureSnapshot({
      title: next.title,
      type: next.type,
      description: next.description,
      priority: next.priority,
      deadline: next.deadline,
      estimatedMinutes: next.estimatedMinutes,
      tags: next.tags,
      reminderEnabled: next.reminderEnabled,
      reminderTime: next.reminderTime,
      showInCalendar: next.showInCalendar,
      linkedContext: next.linkedContext,
      visualAssetId: nextVisualAssetId,
      visualReferenceUrl: nextUrl,
    }));
    setShowUnsaved(false);
    setError('');
    setSaving(false);
  }, [initialDeadline, initialType, isOpen, item]);

  const currentSnapshot = useMemo(() => captureSnapshot({
    title,
    type,
    description,
    priority,
    estimatedMinutes,
    tags,
    deadline,
    reminderEnabled,
    reminderTime,
    showInCalendar,
    linkedContext,
    visualAssetId: effectiveVisualAssetId,
    visualReferenceUrl,
    pendingVisualImage,
  }), [
    deadline,
    description,
    effectiveVisualAssetId,
    estimatedMinutes,
    tags,
    linkedContext,
    pendingVisualImage,
    priority,
    reminderEnabled,
    reminderTime,
    showInCalendar,
    title,
    type,
    visualReferenceUrl,
  ]);

  const canClose = () => {
    if (initialSnapshot && currentSnapshot !== initialSnapshot) {
      setShowUnsaved(true);
      return false;
    }
    return true;
  };

  const requestClose = () => {
    if (canClose()) onClose();
  };

  const chooseType = (nextType: CaptureType) => {
    if (managedByWorkHub) return;
    setType(nextType);
    setError('');
    if (nextType === 'idea') {
      setDeadline('');
      setEstimatedMinutes('');
      setReminderEnabled(false);
      setLinkedContext(undefined);
    } else if (nextType === 'reminder') {
      setPriority('normal');
      setEstimatedMinutes('');
      setLinkedContext(undefined);
      setReminderEnabled(true);
    }
  };

  const acceptImageFile = (file?: File | null) => {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setImageError('Use a PNG, JPG, JPEG, or WebP image.');
      return;
    }
    setImageError('');
    setPendingVisualImage({ blob: file, fileName: file.name || 'idea-reference.png', fingerprint: imageFingerprint(file) });
    setVisualReferenceUrl('');
    setRemoveVisualReference(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    acceptImageFile(event.dataTransfer.files?.[0]);
  };

  const submit = async () => {
    setError('');
    setUrlError('');
    if (!title.trim()) {
      setError('Enter a title before saving this item.');
      return;
    }
    if (type === 'reminder' && !deadline) {
      setError('Choose a reminder date.');
      return;
    }
    if (type === 'reminder' && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      setError('Choose a reminder time.');
      return;
    }

    const normalizedUrl = visualReferenceUrl.trim()
      ? normalizeExternalWebUrl(visualReferenceUrl)
      : undefined;
    if (visualReferenceUrl.trim() && !normalizedUrl) {
      setUrlError('Enter a valid HTTPS image URL.');
      return;
    }

    const minutes = estimatedMinutes ? Number(estimatedMinutes) : undefined;
    const visualIsRelevant = type === 'idea' || hasExistingVisual || Boolean(pendingVisualImage);
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        type,
        priority: type === 'task' ? priority : 'normal',
        deadline: type === 'idea' ? undefined : deadline || undefined,
        estimatedMinutes: type === 'task' && minutes && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : undefined,
        tags: type === 'task' ? normalizeTaskTags(tags) : undefined,
        reminderEnabled: type === 'idea' ? false : reminderEnabled && Boolean(deadline),
        reminderTime: type === 'idea' ? undefined : reminderTime,
        showInCalendar: type === 'reminder' ? showInCalendar : undefined,
        linkedGameId: type === 'task' && linkedContext?.section === 'games' ? linkedContext.entityId : undefined,
        linkedContext: type === 'task' ? linkedContext : undefined,
        photoAssetIds: visualIsRelevant && effectiveVisualAssetId ? [effectiveVisualAssetId] : undefined,
        visualReferenceUrl: normalizedUrl || undefined,
        pendingVisualImage: visualIsRelevant ? pendingVisualImage : undefined,
        removeVisualReference: visualIsRelevant ? removeVisualReference : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This item could not be saved.');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentTypeLabel = CAPTURE_TYPES.find(option => option.value === type)?.label || 'item';

  return (
    <>
      <CaizenFormDialog eyebrow={item ? `Edit ${currentTypeLabel.toLowerCase()}` : 'Quick capture'} title={item ? `Update ${currentTypeLabel.toLowerCase()}` : 'Quick capture'} onClose={onClose} onBeforeClose={canClose} panelClassName={androidPresentation ? 'android-lifehub-modal android-quick-capture-modal' : undefined} footer={<ModalFooter><CancelButton onClick={requestClose} /><SaveButton onClick={() => { if (!saving) void submit(); }}>{saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving...</> : item ? 'Save changes' : `Add ${currentTypeLabel}`}</SaveButton></ModalFooter>}>
        <div className="grid gap-5">
          <div role="tablist" aria-label="Life Hub item type" className="grid gap-2 rounded-2xl border border-border/60 bg-muted/25 p-1.5 sm:grid-cols-3">
            {CAPTURE_TYPES.map(option => {
              const Icon = option.value === 'task' ? CheckCircle2 : option.value === 'idea' ? Lightbulb : Bell;
              return (
                <button key={option.value} id={`lifehub-capture-tab-${option.value}`} type="button" role="tab" aria-selected={type === option.value} aria-controls={`lifehub-capture-panel-${option.value}`} tabIndex={type === option.value ? 0 : -1} onClick={() => chooseType(option.value)} onKeyDown={event => {
                  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const currentIndex = CAPTURE_TYPES.findIndex(candidate => candidate.value === option.value);
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? CAPTURE_TYPES.length - 1
                      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + CAPTURE_TYPES.length) % CAPTURE_TYPES.length;
                  const nextType = CAPTURE_TYPES[nextIndex].value;
                  chooseType(nextType);
                  window.requestAnimationFrame(() => document.getElementById(`lifehub-capture-tab-${nextType}`)?.focus());
                }} disabled={managedByWorkHub} className={`min-h-11 rounded-xl border px-3 text-left text-sm font-black transition-colors ${type === option.value ? 'border-primary/45 bg-primary/10 text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}>
                  <span className="flex items-center gap-2"><Icon className={`size-4 ${type === option.value ? 'text-foreground' : 'text-muted-foreground'}`} aria-hidden="true" />{option.label}</span>
                </button>
              );
            })}
          </div>

          <section id={`lifehub-capture-panel-${type}`} role="tabpanel" aria-labelledby={`lifehub-capture-tab-${type}`} className="grid gap-5">
            <FormField label="Title" error={error} required>
              <Input value={title} onChange={event => setTitle(event.target.value)} readOnly={managedByWorkHub} placeholder={type === 'idea' ? 'Capture the idea' : type === 'reminder' ? 'What should you remember?' : 'What needs to be done?'} autoFocus />
            </FormField>

            {type === 'task' ? (
              <>
                <section className="grid gap-4 border-y border-border/50 py-4">
                  {managedByWorkHub ? (
                    <div className="min-w-0 space-y-1.5">
                      <span className="text-label text-muted-foreground">Deadline</span>
                      <div className="control-input flex items-center text-sm font-bold">{deadline || 'No deadline'}</div>
                    </div>
                  ) : (
                    <FormField label="Deadline">
                      <AdaptiveDatePicker label="Deadline" value={deadline} onChange={setDeadline} className="control-input" />
                    </FormField>
                  )}
                  {managedByWorkHub ? (
                    <div className="min-w-0 space-y-1.5">
                      <span className="text-label text-muted-foreground">Priority</span>
                      <div className="control-input flex items-center text-sm font-bold">{PRIORITIES.find(option => option.value === priority)?.label || 'Medium'}</div>
                    </div>
                  ) : (
                    <FormField label="Priority">
                      <AndroidAdaptiveSelect label="Priority" value={priority} onChange={value => setPriority(value as ProductivityPriority)} className="control-input" options={PRIORITIES.map(option => ({ value: option.value, label: option.label, description: option.hint }))} />
                    </FormField>
                  )}
                </section>
                <FormField label="Tags" hint="Optional comma-separated tags for search and filtering.">
                  <Input
                    value={tags}
                    onChange={event => setTags(event.target.value)}
                    readOnly={managedByWorkHub}
                    placeholder="Home, admin, personal"
                  />
                </FormField>
                <FormField label="Notes"><FormattedTextarea value={description} onChange={setDescription} placeholder="Notes, context, or a useful next step..." minRows={4} showToolbar={!androidPresentation} /></FormField>
                {managedByWorkHub ? <div className="rounded-xl border border-primary/20 bg-primary/[0.045] p-4"><p className="text-sm font-black">Connected to Work Hub</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Title, due date, and priority are owned by Work Hub. Completion stays synchronized in both directions.</p><button type="button" onClick={() => { const context = item?.linkedContext; if (context?.section !== 'work') return; window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: { section: 'workhub', feature: 'work-item', recordId: context.entityId } })); onClose(); }} className="mt-3 min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Edit in Work Hub</button></div> : null}
              </>
            ) : null}

            {type === 'idea' ? <><FormField label="Notes"><FormattedTextarea value={description} onChange={setDescription} placeholder="What do you want to remember?" minRows={4} showToolbar={!androidPresentation} /></FormField><VisualReferenceField title={title} profileId={profileId} assetId={effectiveVisualAssetId} url={visualReferenceUrl} previewUrl={visualPreviewUrl} pendingImage={pendingVisualImage} imageError={imageError} urlError={urlError} onFile={acceptImageFile} onUrlChange={value => { setVisualReferenceUrl(value); setPendingVisualImage(undefined); setRemoveVisualReference(true); setUrlError(''); setImageError(''); }} onRemove={() => { setPendingVisualImage(undefined); setVisualReferenceUrl(''); setRemoveVisualReference(true); setImageError(''); }} onImageError={() => setImageError('This visual reference is unavailable. You can replace or remove it.')} onDrop={handleDrop} /></> : null}

            {type === 'reminder' ? <>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <FormField label="Reminder date" required>
                  <AdaptiveDatePicker label="Reminder date" value={deadline} onChange={setDeadline} className="control-input w-full" />
                </FormField>
                <FormField label="Reminder time">
                  <SleepTimePicker label="Reminder time" value={reminderTime} onChange={setReminderTime} className="control-input w-full" />
                </FormField>
              </div>
              <div className="border-t border-border/50 pt-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Reminder settings</p>
                <div className="mt-1">
                  <NotificationFields label="Android notification" enabled={reminderEnabled} setEnabled={setReminderEnabled} time={reminderTime} setTime={setReminderTime} deadline={deadline} showTime={false} />
                  <label className="flex min-h-11 items-center justify-between gap-3 border-b border-border/50 py-3">
                    <span>
                      <span className="block text-sm font-black">Show in Calendar</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Keep this reminder in the derived Calendar view.</span>
                    </span>
                    <Switch checked={showInCalendar} onCheckedChange={setShowInCalendar} aria-label="Show reminder in Calendar" />
                  </label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">One-time reminder. Recurring reminders are not available yet.</p>
              <FormField label="Notes"><FormattedTextarea value={description} onChange={setDescription} placeholder="Optional reminder notes..." minRows={4} showToolbar={!androidPresentation} /></FormField>
              {showVisualReference ? <VisualReferenceField title={title} profileId={profileId} assetId={effectiveVisualAssetId} url={visualReferenceUrl} previewUrl={visualPreviewUrl} pendingImage={pendingVisualImage} imageError={imageError} urlError={urlError} onFile={acceptImageFile} onUrlChange={value => { setVisualReferenceUrl(value); setPendingVisualImage(undefined); setRemoveVisualReference(true); setUrlError(''); setImageError(''); }} onRemove={() => { setPendingVisualImage(undefined); setVisualReferenceUrl(''); setRemoveVisualReference(true); setImageError(''); }} onImageError={() => setImageError('This visual reference is unavailable. You can replace or remove it.')} onDrop={handleDrop} /> : null}
            </> : null}
          </section>

        </div>
      </CaizenFormDialog>

      <ConfirmDialog isOpen={showUnsaved} title="Discard LifeHub changes?" message="You have unsaved inputs. Close without saving?" confirmText="Discard" cancelText="Keep Editing" isDangerous onCancel={() => setShowUnsaved(false)} onConfirm={() => { setShowUnsaved(false); onClose(); }} />
    </>
  );
}

function NotificationFields({ label, enabled, setEnabled, time, setTime, deadline, showTime = true }: { label: string; enabled: boolean; setEnabled: (value: boolean) => void; time: string; setTime: (value: string) => void; deadline: string; showTime?: boolean }) {
  return <div className="border-y border-border/50 py-3"><label className="flex min-h-11 items-center justify-between gap-3"><span><span className="block text-sm font-black">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">Available when a date is set.</span></span><span className="flex shrink-0 items-center gap-2"><span className="min-w-6 text-right text-[10px] font-black uppercase tracking-wide text-muted-foreground">{enabled && deadline ? 'On' : 'Off'}</span><Switch checked={enabled && Boolean(deadline)} disabled={!deadline} onCheckedChange={setEnabled} aria-label={label} /></span></label>{showTime && enabled && deadline ? <div className="mt-3"><SleepTimePicker label="Notification time" value={time} onChange={setTime} className="control-input" /></div> : null}</div>;
}

function VisualReferenceField({ title, profileId, assetId, url, previewUrl, pendingImage, imageError, urlError, onFile, onUrlChange, onRemove, onImageError, onDrop }: { title: string; profileId?: string; assetId?: string; url: string; previewUrl?: string; pendingImage?: PendingVisualImage; imageError: string; urlError: string; onFile: (file?: File | null) => void; onUrlChange: (value: string) => void; onRemove: () => void; onImageError: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void }) {
  const previewObjectUrl = useMemo(() => pendingImage ? URL.createObjectURL(pendingImage.blob) : undefined, [pendingImage]);
  useEffect(() => () => { if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); }, [previewObjectUrl]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasReference = Boolean(assetId || previewUrl || pendingImage || url);
  const preview = previewObjectUrl && !imageError ? (
    <img src={previewObjectUrl} alt={`Visual reference for ${title || 'item'}`} className="h-full w-full object-cover" onError={onImageError} />
  ) : assetId && profileId ? (
    <MediaAssetImage assetId={assetId} profileId={profileId} alt={`Visual reference for ${title || 'item'}`} className="h-full w-full object-cover" fallback={<ImagePlaceholder />} />
  ) : previewUrl && !imageError ? (
    <img src={previewUrl} alt={`Visual reference for ${title || 'item'}`} className="h-full w-full object-cover" onError={onImageError} referrerPolicy="no-referrer" />
  ) : null;

  return (
    <section aria-labelledby="lifehub-visual-reference-label" className="border-t border-border/50 pt-4">
      <div>
        <h3 id="lifehub-visual-reference-label" className="text-sm font-black">
          Visual reference <span className="font-medium text-muted-foreground">(optional)</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">Add one image to help you remember the reference.</p>
      </div>
      <RecordImageField
        preview={preview}
        hasPreview={hasReference}
        alt={`visual reference for ${title || 'item'}`}
        chooseLabel="Upload or paste image"
        removeLabel="Remove visual reference"
        onChoose={() => fileInputRef.current?.click()}
        onRemove={onRemove}
        onDragOver={event => event.preventDefault()}
        onDrop={onDrop}
        className="mt-3 rounded-xl border border-dashed border-border/70 p-3"
        controls={(
          <div className="grid gap-2">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
            <label className="grid gap-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Image URL</span>
              <Input type="url" value={url} onChange={event => onUrlChange(event.target.value)} placeholder="https://..." aria-describedby={urlError ? 'lifehub-visual-url-error' : undefined} />
            </label>
            <p className="text-[11px] text-muted-foreground">PNG, JPG, JPEG, or WebP. Paste works when this dialog is active.</p>
            {imageError ? <p role="status" className="text-xs text-muted-foreground">{imageError}</p> : null}
            {urlError ? <p id="lifehub-visual-url-error" role="alert" className="text-xs text-amber-700 dark:text-amber-300">{urlError}</p> : null}
          </div>
        )}
      />
    </section>
  );
}

function ImagePlaceholder() {
  return <div className="grid place-items-center text-muted-foreground"><ImagePlus className="size-6" aria-hidden="true" /><span className="mt-1 text-[11px]">No preview</span></div>;
}
