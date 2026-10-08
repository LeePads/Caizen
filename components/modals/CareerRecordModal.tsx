'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';

import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { ResilientImage } from '@/components/media/ResilientImage';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { mediaStorage } from '@/lib/storage/media-storage';
import { getMediaAsset, putMediaAsset } from '@/lib/storage/media-repository';
import { hasLocalMediaCopy } from '@/lib/storage/media-residency';
import { resolveMedia } from '@/lib/storage/media-resolver';
import { processPendingMediaCleanup, queueMediaCleanup, scheduleMediaCleanup } from '@/lib/storage/media-cleanup';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { createEntityId } from '@/lib/utils';
import { isCareerDateRangeValid, isValidCareerUrl } from '@/lib/career/validation';
import { getCareerCredentialExpiryStatus } from '@/lib/career/expiry';
import type { CareerCourse, CareerCredential, CareerSkill, CareerSkillLevel, MediaAsset } from '@/lib/types';

type Mode = 'skill' | 'course' | 'credential';
type FieldErrorKey = 'title' | 'url' | 'image' | 'completionDate' | 'expiryDate';

type Props = {
  mode: Mode;
  profileId: string;
  initial?: CareerSkill | CareerCourse | CareerCredential;
  skills: CareerSkill[];
  courses: CareerCourse[];
  onClose: () => void;
  onSave: (record: CareerSkill | CareerCourse | CareerCredential) => void;
  readOnly?: boolean;
  onEdit?: () => void;
};

const inputClass = 'control-input min-h-11 w-full';
const disclosureClass = 'min-h-11 cursor-pointer content-center text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const levels: CareerSkillLevel[] = ['Learning', 'Familiar', 'Proficient', 'Advanced'];
const modeLabels: Record<Mode, string> = { skill: 'Skill', course: 'Course', credential: 'Certificate' };

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value < 0) return 'Unknown size';
  if (value < 1024) return `${value} B`;
  const kilobytes = value / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(0)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function dateValue(value?: Date | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function Field({ label, id, error, children, className = "" }: { label: string; id?: string; error?: string; children: ReactNode; className?: string }) {
  const errorId = error && id ? `${id}-error` : undefined;
  return <div className={`min-w-0 space-y-1.5 ${className}`}>{id ? <label className="block text-label text-muted-foreground" htmlFor={id}>{label}</label> : <span className="block text-label text-muted-foreground">{label}</span>}{children}{error ? <span id={errorId} className="block text-body-sm font-semibold text-destructive" role="alert">{error}</span> : null}</div>;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="border-b border-border/50 pb-1 text-sm font-semibold text-foreground">{children}</h3>;
}

export default function CareerRecordModal({ mode, profileId, initial, skills, courses, onClose, onSave, readOnly = false, onEdit }: Props) {
  const [id] = useState(() => initial?.id || createEntityId(`career-${mode}`));
  const [title, setTitle] = useState(mode === 'skill' ? (initial as CareerSkill | undefined)?.name || '' : (initial as CareerCourse | CareerCredential | undefined)?.title || '');
  const [area, setArea] = useState(mode === 'skill' ? (initial as CareerSkill | undefined)?.area || '' : '');
  const [level, setLevel] = useState<CareerSkillLevel>((initial as CareerSkill | undefined)?.level || 'Learning');
  const [provider, setProvider] = useState((initial as CareerCourse | undefined)?.provider || '');
  const [status, setStatus] = useState<CareerCourse['status']>((initial as CareerCourse | undefined)?.status || 'Planned');
  const [startDate, setStartDate] = useState(dateValue((initial as CareerCourse | undefined)?.startDate));
  const [completionDate, setCompletionDate] = useState(dateValue((initial as CareerCourse | undefined)?.completionDate));
  const [issuer, setIssuer] = useState((initial as CareerCredential | undefined)?.issuer || '');
  const [issuedDate, setIssuedDate] = useState(dateValue((initial as CareerCredential | undefined)?.issuedDate));
  const [expiryDate, setExpiryDate] = useState(dateValue((initial as CareerCredential | undefined)?.expiryDate));
  const [noExpiry, setNoExpiry] = useState(Boolean((initial as CareerCredential | undefined)?.noExpiry));
  const [credentialId, setCredentialId] = useState((initial as CareerCredential | undefined)?.credentialId || '');
  const [url, setUrl] = useState((initial as CareerCourse | CareerCredential | undefined)?.url || '');
  const [image, setImage] = useState((initial as CareerCourse | CareerCredential | undefined)?.image || '');
  const [relatedSkillIds, setRelatedSkillIds] = useState<string[]>((initial as CareerCourse | CareerCredential | undefined)?.relatedSkillIds || []);
  const [relatedCourseIds, setRelatedCourseIds] = useState<string[]>((initial as CareerCredential | undefined)?.relatedCourseIds || []);
  const [notes, setNotes] = useState((initial as CareerSkill | CareerCourse | CareerCredential | undefined)?.notes || '');
  const initialAttachmentAssetId = mode === 'course'
    ? (initial as CareerCourse | undefined)?.attachmentAssetId
    : (initial as CareerCredential | undefined)?.proofAssetId;
  const [attachmentAssetId, setAttachmentAssetId] = useState(initialAttachmentAssetId);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentMetadata, setAttachmentMetadata] = useState<MediaAsset | null>(null);
  const [attachmentMetadataLoading, setAttachmentMetadataLoading] = useState(Boolean(initialAttachmentAssetId));
  const [attachmentLocalCopyAvailable, setAttachmentLocalCopyAvailable] = useState<boolean | null>(initialAttachmentAssetId ? null : false);
  const [attachmentCloudExcluded, setAttachmentCloudExcluded] = useState(false);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [attachmentPreviewImage, setAttachmentPreviewImage] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentPreviewText, setAttachmentPreviewText] = useState<string | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const [attachmentPreviewError, setAttachmentPreviewError] = useState('');
  const draftAttachmentIdsRef = useRef<Set<string>>(new Set());
  const pendingDetachedAttachmentIdsRef = useRef<Set<string>>(new Set());
  const openedProfileIdRef = useRef(profileId);
  const committedRef = useRef(false);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const previewRequestRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});
  const [showDiscard, setShowDiscard] = useState(false);
  const snapshot = JSON.stringify({ title, area, level, provider, status, startDate, completionDate, issuer, issuedDate, expiryDate, noExpiry, credentialId, url, image, relatedSkillIds, relatedCourseIds, notes, attachmentAssetId });
  const initialSnapshot = useRef(snapshot);
  const beforeClose = () => {
    if (busyRef.current) return false;
    if (!readOnly && (snapshot !== initialSnapshot.current || (
      !attachmentMetadataLoading && Boolean(attachmentAssetId) && attachmentCloudExcluded !== Boolean(attachmentMetadata?.cloudExcluded)
    ))) {
      setShowDiscard(true);
      return false;
    }
    return true;
  };
  const requestClose = () => { if (beforeClose()) onClose(); };

  const closeProofPreview = () => {
    previewRequestRef.current += 1;
    setAttachmentPreviewOpen(false);
    setAttachmentPreviewUrl(null);
    setAttachmentPreviewText(null);
    setAttachmentPreviewImage(false);
    setAttachmentPreviewError('');
  };

  useOverlayLifecycle(attachmentPreviewOpen, closeProofPreview, {
    lockScroll: false,
    restoreFocus: false,
    autoFocus: false,
    trapFocus: false,
  });

  useEffect(() => {
    if (openedProfileIdRef.current !== profileId) onClose();
  }, [onClose, profileId]);

  useEffect(() => () => {
    if (committedRef.current || !draftAttachmentIdsRef.current.size) return;
    const persisted = mode === 'course'
      ? (initial as CareerCourse | undefined)?.attachmentAssetId
      : (initial as CareerCredential | undefined)?.proofAssetId;
    const orphaned = [...draftAttachmentIdsRef.current].filter(assetId => assetId !== persisted);
    if (orphaned.length) {
      queueMediaCleanup({ profileId, assetIds: orphaned, reason: 'draft-cancelled' });
      void processPendingMediaCleanup();
    }
  }, [initial, mode, profileId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!attachmentAssetId) {
      setAttachmentName(null);
      setAttachmentMetadata(null);
      setAttachmentMetadataLoading(false);
      setAttachmentLocalCopyAvailable(false);
      setAttachmentCloudExcluded(false);
      return;
    }
    let active = true;
    setAttachmentMetadataLoading(true);
    void getMediaAsset(attachmentAssetId).then(async asset => {
      if (!active) return;
      const matchesProfile = Boolean(asset && asset.profileId === profileId);
      const localCopyAvailable = matchesProfile && asset
        ? await hasLocalMediaCopy(asset).catch(() => false)
        : false;
      if (!active) return;
      setAttachmentMetadata(matchesProfile ? asset ?? null : null);
      setAttachmentCloudExcluded(Boolean(matchesProfile && asset?.cloudExcluded));
      setAttachmentLocalCopyAvailable(localCopyAvailable);
      setAttachmentName(matchesProfile ? asset?.fileName || null : null);
      setAttachmentMetadataLoading(false);
    }).catch(() => {
      if (!active) return;
      setAttachmentMetadata(null);
      setAttachmentName(null);
      setAttachmentLocalCopyAvailable(false);
      setAttachmentCloudExcluded(false);
      setAttachmentMetadataLoading(false);
    });
    return () => { active = false; };
  }, [attachmentAssetId, profileId]);

  useEffect(() => () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
  }, [attachmentPreviewUrl]);

  const clearFieldError = (key: FieldErrorKey) => setFieldErrors(current => ({ ...current, [key]: undefined }));
  const addAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (busyRef.current || committedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const asset = await mediaStorage.save(file, { profileId, ownerType: 'career', ownerId: id, role: 'attachment', fileName: file.name });
      if (!mountedRef.current) {
        // A profile switch may unmount the editor while the file is saving.
        scheduleMediaCleanup({ profileId, assetIds: [asset.id], reason: 'draft-cancelled' });
        // No record was committed, so there is no profile save to trigger
        // cleanup. Reference checks still protect assets used elsewhere.
        void processPendingMediaCleanup().catch(() => undefined);
        return;
      }
      draftAttachmentIdsRef.current.add(asset.id);
      if (attachmentAssetId && attachmentAssetId !== asset.id) pendingDetachedAttachmentIdsRef.current.add(attachmentAssetId);
      setAttachmentAssetId(asset.id);
      setAttachmentName(asset.fileName);
      setAttachmentMetadata(asset);
      setAttachmentMetadataLoading(false);
      setAttachmentLocalCopyAvailable(true);
      setAttachmentCloudExcluded(false);
    } catch (uploadError) {
      if (mountedRef.current) setError(uploadError instanceof Error ? uploadError.message : 'The attachment could not be saved.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const downloadAttachment = async () => {
    if (!attachmentAssetId) return;
    try {
      const blob = await mediaStorage.read(attachmentAssetId, profileId);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachmentName || 'career-document';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError('The attachment could not be downloaded. Try again or replace the file.');
    }
  };

  const openAttachmentPreview = async () => {
    if (!attachmentAssetId) return;
    const request = ++previewRequestRef.current;
    setAttachmentPreviewOpen(true);
    setAttachmentPreviewError('');
    setAttachmentPreviewLoading(true);
    setAttachmentPreviewText(null);
    setAttachmentPreviewImage(false);
    try {
      const blob = await mediaStorage.read(attachmentAssetId, profileId);
      if (!mountedRef.current || request !== previewRequestRef.current) return;
      const mimeType = attachmentMetadata?.mimeType || blob.type;
      if (mimeType.startsWith('image/')) {
        setAttachmentPreviewImage(true);
        setAttachmentPreviewLoading(false);
        return;
      }
      if (mimeType === 'text/plain') {
        const text = await blob.text();
        if (!mountedRef.current || request !== previewRequestRef.current) return;
        setAttachmentPreviewText(text);
      } else {
        setAttachmentPreviewUrl(URL.createObjectURL(blob));
      }
    } catch {
      if (mountedRef.current && request === previewRequestRef.current) setAttachmentPreviewError('Could not preview this file. Try downloading it to open it on this device.');
    } finally {
      if (mountedRef.current && request === previewRequestRef.current) setAttachmentPreviewLoading(false);
    }
  };

  const openCredentialUrl = async () => {
    if (!url.trim() || !isValidCareerUrl(url)) return;
    try {
      await openExternalLink(url.trim());
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'The certificate link could not be opened.');
    }
  };

  const toggleId = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => setter(current => current.includes(value) ? current.filter(idValue => idValue !== value) : [...current, value]);

  const ensureAttachmentLocal = async (asset: MediaAsset) => {
    if (await hasLocalMediaCopy(asset)) {
      await mediaStorage.read(asset.id, profileId);
      return;
    }
    const resolved = await resolveMedia(asset.id, {
      variant: 'full',
      purpose: 'explicit-open',
      expectedProfileId: profileId,
    });
    resolved.release?.();
    if (!resolved.url) {
      throw new Error(resolved.message || 'Connect to Cloud and try again to keep this file on this device.');
    }
    const refreshed = await getMediaAsset(asset.id);
    if (!refreshed || refreshed.profileId !== profileId || !(await hasLocalMediaCopy(refreshed))) {
      throw new Error('The file could not be restored to this device, so the local-only setting was not saved.');
    }
    await mediaStorage.read(asset.id, profileId);
  };

  const save = async () => {
    if (busyRef.current || committedRef.current || readOnly) return;
    const nextFieldErrors: Partial<Record<FieldErrorKey, string>> = {};
    if (!title.trim()) nextFieldErrors.title = mode === 'skill' ? 'Enter a skill name.' : mode === 'course' ? 'Enter a course title.' : 'Enter a certificate title.';
    if (mode === 'course') {
      if (!isCareerDateRangeValid(startDate, completionDate)) nextFieldErrors.completionDate = 'Choose a completion date on or after the start date.';
      if (!isValidCareerUrl(url)) nextFieldErrors.url = 'Enter a website address starting with http:// or https://, or leave this field empty.';
    }
    if (mode === 'credential') {
      if (!noExpiry && !isCareerDateRangeValid(issuedDate, expiryDate)) nextFieldErrors.expiryDate = 'Choose an expiry date on or after the issued date.';
      if (!isValidCareerUrl(url)) nextFieldErrors.url = 'Enter a website address starting with http:// or https://, or leave this field empty.';
    }
    if (mode !== 'skill' && image.trim() && !normalizeExternalWebUrl(image)) {
      nextFieldErrors.image = 'Enter a valid HTTPS image URL, or leave this field empty.';
    }
    setFieldErrors(nextFieldErrors);
    setError('');
    if (Object.keys(nextFieldErrors).length) {
      const prefix = mode === 'skill' ? 'career-skill' : mode === 'course' ? 'career-course' : 'career-credential';
      const suffix = nextFieldErrors.title ? (mode === 'skill' ? 'name' : 'title') : nextFieldErrors.completionDate ? 'completion' : nextFieldErrors.expiryDate ? 'expiry' : nextFieldErrors.url ? 'url' : 'image';
      document.getElementById(`${prefix}-${suffix}`)?.focus();
      return;
    }

    if (attachmentAssetId && attachmentMetadataLoading) {
      setError('Wait for the attachment details to load, then save again.');
      return;
    }

    const common = { id, notes: notes.trim() || undefined, createdAt: initial?.createdAt || new Date(), updatedAt: new Date() };
    const record = mode === 'skill'
      ? { ...common, name: title.trim(), area: area.trim() || undefined, level } as CareerSkill
      : mode === 'course'
        ? { ...common, title: title.trim(), image: normalizeExternalWebUrl(image) || undefined, attachmentAssetId, provider: provider.trim() || undefined, status, startDate: startDate ? new Date(`${startDate}T12:00:00`) : undefined, completionDate: completionDate ? new Date(`${completionDate}T12:00:00`) : undefined, url: url.trim() || undefined, relatedSkillIds } as CareerCourse
        : { ...common, title: title.trim(), image: normalizeExternalWebUrl(image) || undefined, issuer: issuer.trim() || undefined, relatedSkillIds, relatedCourseIds, issuedDate: issuedDate ? new Date(`${issuedDate}T12:00:00`) : undefined, expiryDate: noExpiry || !expiryDate ? undefined : new Date(`${expiryDate}T12:00:00`), noExpiry, credentialId: credentialId.trim() || undefined, url: url.trim() || undefined, proofAssetId: attachmentAssetId } as CareerCredential;

    busyRef.current = true;
    setBusy(true);
    try {
      if (attachmentAssetId) {
        const asset = await getMediaAsset(attachmentAssetId);
        if ((!asset || asset.profileId !== profileId) && attachmentCloudExcluded) {
          throw new Error('The attachment is no longer available in this profile, so the local-only setting was not saved.');
        }
        if (asset?.profileId === profileId) {
          const wasExcluded = Boolean(asset.cloudExcluded);
          if (attachmentCloudExcluded) {
            let localOnlyAsset = asset;
            if (!wasExcluded) {
              // Pin the Cloud cache before restoring a previously evicted copy.
              // Roll the preference back if local residency cannot be verified.
              localOnlyAsset = { ...asset, cloudExcluded: true, updatedAt: new Date().toISOString() };
              await putMediaAsset(localOnlyAsset);
              try {
                await ensureAttachmentLocal(localOnlyAsset);
              } catch (lockError) {
                const latest = await getMediaAsset(asset.id);
                if (latest) await putMediaAsset({ ...latest, cloudExcluded: wasExcluded, updatedAt: new Date().toISOString() });
                throw lockError;
              }
            } else {
              // A previously locked file may have lost local residency outside
              // this flow; restore it before saving with the local-only claim.
              await ensureAttachmentLocal(localOnlyAsset);
            }
            const refreshed = await getMediaAsset(asset.id);
            setAttachmentMetadata(refreshed || localOnlyAsset);
            setAttachmentLocalCopyAvailable(true);
          } else if (wasExcluded) {
            const unlocked = { ...asset, cloudExcluded: false, updatedAt: new Date().toISOString() };
            await putMediaAsset(unlocked);
            setAttachmentMetadata(unlocked);
          }
        }
      }

      committedRef.current = true;
      onSave(record);
    } catch (saveError) {
      committedRef.current = false;
      setError(saveError instanceof Error ? saveError.message : 'This record could not be saved. Your changes are still here; try again.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
    if (committedRef.current && (mode === 'course' || mode === 'credential')) {
      const detached = new Set(pendingDetachedAttachmentIdsRef.current);
      for (const draftId of draftAttachmentIdsRef.current) {
        if (draftId !== attachmentAssetId) detached.add(draftId);
      }
      if (detached.size) scheduleMediaCleanup({ profileId, assetIds: detached, reason: 'attachment-detached' });
    }
  };

  const titleLabel = mode === 'skill' ? 'Skill name' : mode === 'course' ? 'Course title' : 'Certificate title';
  const attachmentLabel = mode === 'course' ? 'Supporting document' : 'Proof document';
  const attachmentLabelLower = mode === 'course' ? 'supporting document' : 'proof document';
  if (openedProfileIdRef.current !== profileId) return null;
  return <>
  <CaizenFormDialog title={readOnly ? title : `${initial ? 'Edit' : 'Add'} ${modeLabels[mode]}`} onClose={onClose} onBeforeClose={beforeClose} bodyClassName="space-y-5" maxWidthClass="max-w-3xl" footer={readOnly ? <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Close</Button>{onEdit ? <Button type="button" onClick={onEdit}>Edit {modeLabels[mode].toLowerCase()}</Button> : null}</div> : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>Cancel</Button>
      <Button type="button" onClick={() => void save()} disabled={busy || attachmentMetadataLoading}>{busy ? <><Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />Saving record…</> : initial ? 'Save changes' : `Add ${modeLabels[mode].toLocaleLowerCase()}`}</Button>
    </div>
  )}>
    {readOnly ? <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">{[
        ['Type', modeLabels[mode]], ['Area', area], ['Level', mode === 'skill' ? level : ''], ['Provider', provider], ['Status', mode === 'course' ? status : ''], ['Issuer', issuer], ['Start date', startDate], ['Completed date', completionDate], ['Issued date', issuedDate], ['Expiry', mode === 'credential' ? getCareerCredentialExpiryStatus(initial as CareerCredential) : ''], ['Expiry date', expiryDate], ['Certificate ID', credentialId],
        ['Related skills', skills.filter(item => relatedSkillIds.includes(item.id)).map(item => item.name).join(', ')], ['Related courses', courses.filter(item => relatedCourseIds.includes(item.id)).map(item => item.title).join(', ')],
      ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-label text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
      {url ? <Button type="button" variant="outline" onClick={() => void openCredentialUrl()}><ExternalLink className="size-4" />Open {mode === 'course' ? 'course' : 'certificate'} link</Button> : null}
      {image ? <section className="space-y-2"><h3 className="text-card-title">Image</h3><ResilientImage src={image} alt={`${title} image`} className="max-h-64 w-full rounded-xl object-cover" fallback={<div className="grid h-36 place-items-center rounded-xl bg-muted text-muted-foreground"><ImageIcon className="size-6" /></div>} /></section> : null}
      {attachmentAssetId ? <section className="space-y-2"><h3 className="text-card-title">{attachmentLabel}</h3><p className="break-words text-sm text-muted-foreground">{attachmentName || (attachmentMetadataLoading ? 'Loading file details…' : `Attached ${attachmentLabelLower}`)}</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void openAttachmentPreview()}>View file</Button><Button type="button" variant="outline" onClick={() => void downloadAttachment()}><Download className="size-4" />Download</Button></div>{attachmentCloudExcluded ? <p className="text-xs text-muted-foreground">This file is excluded from Cloud Backup. A previously uploaded copy may remain until a backup completes cleanup.</p> : null}</section> : null}
      {notes ? <section><h3 className="text-card-title">Notes</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{notes}</p></section> : null}
    </div> : <>
    <p className="text-sm text-muted-foreground">The name or title is required; other details are optional. Never store passwords or recovery codes.</p>
    {mode === 'skill' ? <>
      <section className="space-y-3"><div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2"><Field className="sm:col-span-2" label={titleLabel} id="career-skill-name" error={fieldErrors.title}><input id="career-skill-name" className={inputClass} value={title} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'career-skill-name-error' : undefined} onChange={event => { setTitle(event.target.value); clearFieldError('title'); }} autoFocus /></Field><Field label="Area" id="career-skill-area"><input id="career-skill-area" className={inputClass} value={area} onChange={event => setArea(event.target.value)} placeholder="e.g. Design, Languages" /><span /></Field><Field label="Level"><AndroidAdaptiveSelect label="Skill level" value={level} options={levels.map(value => ({ value, label: value }))} onChange={value => setLevel(value as CareerSkillLevel)} /></Field></div></section>
      <section className="space-y-3"><Field label="Notes" id="career-skill-notes"><textarea id="career-skill-notes" className={`${inputClass} min-h-28 py-3`} value={notes} onChange={event => setNotes(event.target.value)} /></Field></section>
    </> : null}
    {mode === 'course' ? <>
      <section className="space-y-3"><div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2"><Field className="sm:col-span-2" label={titleLabel} id="career-course-title" error={fieldErrors.title}><input id="career-course-title" className={inputClass} value={title} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'career-course-title-error' : undefined} onChange={event => { setTitle(event.target.value); clearFieldError('title'); }} autoFocus /></Field><Field label="Provider / platform" id="career-course-provider"><input id="career-course-provider" className={inputClass} value={provider} onChange={event => setProvider(event.target.value)} /><span /></Field><Field label="Status"><AndroidAdaptiveSelect label="Course status" value={status} options={['Planned', 'In progress', 'Completed'].map(value => ({ value, label: value }))} onChange={value => setStatus(value as CareerCourse['status'])} /></Field></div></section>
      <section className="space-y-3"><SectionHeading>Dates</SectionHeading><div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2"><Field label="Start date" id="career-course-start"><AdaptiveDatePicker id="career-course-start" label="Start date" value={startDate} onChange={value => { setStartDate(value); clearFieldError('completionDate'); }} className={inputClass} /><span /></Field><Field label="Completed date" id="career-course-completion" error={fieldErrors.completionDate}><AdaptiveDatePicker id="career-course-completion" label="Completed date" value={completionDate} ariaDescribedBy={fieldErrors.completionDate ? 'career-course-completion-error' : undefined} onChange={value => { setCompletionDate(value); clearFieldError('completionDate'); }} className={inputClass} /></Field></div></section>
      <RelationshipPicker label="Related skills" values={relatedSkillIds} options={skills.map(item => ({ id: item.id, label: item.name }))} onToggle={value => toggleId(setRelatedSkillIds, value)} />
      <section className="space-y-3"><Field label="Course link" id="career-course-url" error={fieldErrors.url}><input id="career-course-url" type="url" className={inputClass} value={url} aria-invalid={Boolean(fieldErrors.url)} aria-describedby={fieldErrors.url ? 'career-course-url-error' : undefined} onChange={event => { setUrl(event.target.value); clearFieldError('url'); }} placeholder="https://..." /></Field></section>
      <section className="space-y-3"><Field label="Notes" id="career-course-notes"><textarea id="career-course-notes" className={`${inputClass} min-h-28 py-3`} value={notes} onChange={event => setNotes(event.target.value)} /></Field></section>
    </> : null}
    {mode === 'credential' ? <>
      <section className="space-y-3"><div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2"><Field className="sm:col-span-2" label={titleLabel} id="career-credential-title" error={fieldErrors.title}><input id="career-credential-title" className={inputClass} value={title} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'career-credential-title-error' : undefined} onChange={event => { setTitle(event.target.value); clearFieldError('title'); }} autoFocus /></Field><Field label="Issuer" id="career-credential-issuer"><input id="career-credential-issuer" className={inputClass} value={issuer} onChange={event => setIssuer(event.target.value)} /><span /></Field></div></section>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><SectionHeading>Dates</SectionHeading><span className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-bold text-muted-foreground">{getCareerCredentialExpiryStatus({ noExpiry, expiryDate: expiryDate ? new Date(`${expiryDate}T12:00:00`) : undefined })}</span></div><div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2"><Field label="Issued date" id="career-credential-issued"><AdaptiveDatePicker id="career-credential-issued" label="Issued date" value={issuedDate} onChange={value => { setIssuedDate(value); clearFieldError('expiryDate'); }} className={inputClass} /><span /></Field><Field label="Expiry date" id="career-credential-expiry" error={fieldErrors.expiryDate}><AdaptiveDatePicker id="career-credential-expiry" label="Expiry date" value={expiryDate} disabled={noExpiry} ariaDescribedBy={fieldErrors.expiryDate ? 'career-credential-expiry-error' : undefined} onChange={value => { setExpiryDate(value); clearFieldError('expiryDate'); }} className={inputClass} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={noExpiry} onChange={event => { setNoExpiry(event.target.checked); clearFieldError('expiryDate'); }} className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /> No expiry</label></div></section>
      <details className="border-t border-border/50 pt-2" open={relatedSkillIds.length > 0 || relatedCourseIds.length > 0}><summary className={disclosureClass}>Related records <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span></summary><div className="mt-3 space-y-4"><RelationshipPicker label="Related skills" values={relatedSkillIds} options={skills.map(item => ({ id: item.id, label: item.name }))} onToggle={value => toggleId(setRelatedSkillIds, value)} /><RelationshipPicker label="Related courses" values={relatedCourseIds} options={courses.map(item => ({ id: item.id, label: item.title }))} onToggle={value => toggleId(setRelatedCourseIds, value)} /></div></details>
      <section className="space-y-3"><div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Certificate link" id="career-credential-url" error={fieldErrors.url}><input id="career-credential-url" type="url" className={inputClass} value={url} aria-invalid={Boolean(fieldErrors.url)} aria-describedby={fieldErrors.url ? 'career-credential-url-error' : undefined} onChange={event => { setUrl(event.target.value); clearFieldError('url'); }} placeholder="https://..." /></Field><Button type="button" variant="outline" disabled={!url.trim() || !isValidCareerUrl(url)} onClick={() => void openCredentialUrl()} className="min-h-11 sm:mt-6"><ExternalLink className="size-4" />Open certificate link</Button></div><details className="border-t border-border/50 pt-2" open={Boolean(credentialId)}><summary className={disclosureClass}>Certificate ID <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span></summary><Field label="Certificate ID" id="career-credential-id"><input id="career-credential-id" className={inputClass} value={credentialId} onChange={event => setCredentialId(event.target.value)} /><span /></Field></details></section>
      <details className="border-t border-border/50 pt-2" open={Boolean(notes)}><summary className={disclosureClass}>Notes <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span></summary><div className="mt-3"><Field label="Notes" id="career-credential-notes"><textarea id="career-credential-notes" className={`${inputClass} min-h-28 py-3`} value={notes} onChange={event => setNotes(event.target.value)} /></Field></div></details>
    </> : null}
    {mode !== 'skill' ? <>
      <section className="space-y-3">
        <Field label="External preview image" id={`career-${mode}-image`} error={fieldErrors.image}>
          <input id={`career-${mode}-image`} type="url" className={inputClass} value={image} aria-invalid={Boolean(fieldErrors.image)} aria-describedby={fieldErrors.image ? `career-${mode}-image-error` : undefined} onChange={event => { setImage(event.target.value); clearFieldError('image'); }} placeholder="https://..." />
        </Field>
        {image.trim() ? <ResilientImage src={normalizeExternalWebUrl(image)} alt={`${title || modeLabels[mode]} preview`} className="max-h-52 w-full rounded-xl object-cover" fallback={<div className="grid h-28 place-items-center rounded-xl bg-muted text-muted-foreground"><ImageIcon className="size-6" /></div>} /> : null}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-card-title">{attachmentLabel}</p><p className="text-xs text-muted-foreground">Attach one image, PDF, or text file to this profile.</p></div>
          <label data-caizen-focus-shell="true" className="career-proof-action inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border/60 px-3 text-sm font-bold focus-within:border-primary/50"><Paperclip className="mr-2 size-4" />{attachmentAssetId ? 'Replace file' : 'Add file'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={addAttachment} data-caizen-focus-inner="true" className="sr-only" /></label>
        </div>
        {attachmentAssetId ? <>
          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
            <button type="button" onClick={() => void openAttachmentPreview()} className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`Preview ${attachmentLabelLower} ${attachmentName || 'attachment'}`}>
              {attachmentMetadata?.mimeType.startsWith('image/') ? <MediaAssetImage profileId={profileId} assetId={attachmentAssetId} alt={`${attachmentLabel} thumbnail`} className="size-full object-cover" fallback={<ImageIcon className="size-6 text-muted-foreground" />} /> : <FileText className="size-6 text-muted-foreground" />}
            </button>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{attachmentName || attachmentMetadata?.fileName || (attachmentMetadataLoading ? 'Loading file…' : 'File attached')}</p><p className="mt-0.5 text-xs text-muted-foreground">{attachmentMetadata ? `${attachmentMetadata.mimeType} · ${formatFileSize(attachmentMetadata.sizeBytes)}` : attachmentMetadataLoading ? 'Loading file details' : 'File details unavailable'}</p></div>
            <div className="flex flex-wrap gap-1"><Button type="button" variant="outline" onClick={() => void openAttachmentPreview()} className="min-h-11"><ExternalLink className="size-4" />Open</Button><Button type="button" variant="ghost" onClick={() => void downloadAttachment()} className="min-h-11"><Download className="size-4" />Download</Button><Button type="button" variant="ghost" onClick={() => { pendingDetachedAttachmentIdsRef.current.add(attachmentAssetId); setAttachmentAssetId(undefined); setAttachmentName(null); setAttachmentMetadata(null); setAttachmentMetadataLoading(false); setAttachmentCloudExcluded(false); }} aria-label={`Remove ${attachmentLabelLower}`} className="min-h-11 min-w-11"><X className="size-4" /><span className="sr-only">Remove file</span></Button></div>
          </div>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm font-semibold">
            <input type="checkbox" checked={attachmentCloudExcluded} disabled={busy || attachmentMetadataLoading} onChange={event => setAttachmentCloudExcluded(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <span>Keep this file on this device only <span className="block pt-1 text-xs font-normal text-muted-foreground">{attachmentCloudExcluded && attachmentLocalCopyAvailable === false ? 'This file is excluded from new Cloud uploads, but this device has no local copy. Any previous Cloud copy will be kept until the file is restored here.' : 'When saved, it stays out of Cloud Backup and in local complete backups. A previously uploaded copy may remain until a backup completes cleanup.'}</span></span>
          </label>
        </> : <p className="text-xs text-muted-foreground">Career documents are included in Cloud Backup unless you mark the attached file as local-only.</p>}
      </section>
    </> : null}
    </>}
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : null}
  </CaizenFormDialog>
  <Dialog open={attachmentPreviewOpen} onOpenChange={open => open ? setAttachmentPreviewOpen(true) : closeProofPreview()}>
    <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col overflow-hidden">
      <DialogHeader><DialogTitle>{attachmentName || attachmentMetadata?.fileName || attachmentLabel}</DialogTitle><DialogDescription>{attachmentMetadata?.mimeType || 'Attached file'}{attachmentMetadata ? ` · ${formatFileSize(attachmentMetadata.sizeBytes)}` : ''}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/50 bg-muted/15">
        {attachmentPreviewLoading ? <p role="status" className="p-6 text-center text-sm text-muted-foreground">Opening file…</p>
          : attachmentPreviewError ? <p role="alert" className="p-6 text-center text-sm text-muted-foreground">{attachmentPreviewError}</p>
            : attachmentPreviewImage ? <MediaAssetImage profileId={profileId} assetId={attachmentAssetId || ''} alt={attachmentLabel} variant="full" className="mx-auto max-h-[65dvh] w-auto object-contain" />
              : attachmentPreviewText !== null ? <pre className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words p-4 text-sm">{attachmentPreviewText}</pre>
                : attachmentPreviewUrl ? <iframe title={`${attachmentLabel} PDF preview`} src={attachmentPreviewUrl} className="h-[65dvh] w-full border-0" />
                  : <p className="p-6 text-center text-sm text-muted-foreground">Preview is unavailable. Try downloading the file to open it on this device.</p>}
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => void downloadAttachment()} className="min-h-11"><Download className="size-4" />Download</Button><Button type="button" onClick={closeProofPreview} className="min-h-11">Close</Button></div>
    </DialogContent>
  </Dialog>
  <ConfirmDialog isOpen={showDiscard} title="Discard changes?" message="Your Career record has unsaved changes. Close without saving?" confirmText="Discard" cancelText="Keep editing" isDangerous onCancel={() => setShowDiscard(false)} onConfirm={() => { setShowDiscard(false); onClose(); }} />
  </>;
}

function RelationshipPicker({ label, values, options, onToggle }: { label: string; values: string[]; options: Array<{ id: string; label: string }>; onToggle: (id: string) => void }) {
  return <fieldset className="space-y-2"><legend className="text-label text-muted-foreground">{label}</legend><div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-border/60 p-2 sm:grid-cols-2">{options.length ? options.map(option => <label key={option.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted/50"><input type="checkbox" checked={values.includes(option.id)} onChange={() => onToggle(option.id)} className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /> <span className="min-w-0 break-words [overflow-wrap:anywhere]">{option.label}</span></label>) : <p className="p-2 text-xs text-muted-foreground">{label === 'Related skills' ? 'Add a skill in Career before linking it here.' : 'Add a course in Career before linking it here.'}</p>}</div></fieldset>;
}
