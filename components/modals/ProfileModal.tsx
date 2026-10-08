'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ImageOff, Pencil, Plus, UserRound, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { usePhotoSource } from '@/hooks/use-photo-source';
import { mediaStorage } from '@/lib/storage/media-storage';
import { processPendingMediaCleanup, queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'add' | 'edit';
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ProfileModal({ isOpen, onClose, mode = 'edit' }: ProfileModalProps) {
  const { addProfile, getCurrentProfile, updateProfile } = useAppContext();
  const currentProfile = getCurrentProfile();
  const isEditing = mode === 'edit';

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarAssetId, setAvatarAssetId] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const modalPanelRef = useRef<HTMLElement | null>(null);

  const normalizedAvatar = useMemo(() =>
    isEditing && avatar === currentProfile?.avatar
      ? avatar
      : normalizeExternalWebUrl(avatar) || '',
  [avatar, currentProfile?.avatar, isEditing]);
  const currentSnapshot = JSON.stringify({ name, avatar, avatarAssetId, pending: Boolean(pendingAvatar) });
  const hasUnsavedChanges = isOpen && initialSnapshot !== '' && currentSnapshot !== initialSnapshot;
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    close();
  };

  useEffect(() => {
    if (!isOpen) return;
    const nextName = isEditing && currentProfile ? currentProfile.name : '';
    const nextAvatar = isEditing && currentProfile ? currentProfile.avatar || '' : '';
    const nextAvatarAssetId = isEditing && currentProfile ? currentProfile.avatarAssetId || '' : '';
    setName(nextName);
    setAvatar(nextAvatar);
    setAvatarAssetId(nextAvatarAssetId);
    setPendingAvatar(null);
    setPendingAvatarPreview('');
    setMediaError(null);
    setAvatarFailed(false);
    setInitialSnapshot(JSON.stringify({ name: nextName, avatar: nextAvatar, avatarAssetId: nextAvatarAssetId, pending: false }));
    setShowUnsavedDialog(false);
  }, [isOpen, isEditing, currentProfile]);

  useEffect(() => setAvatarFailed(false), [normalizedAvatar]);
  useEffect(() => {
    if (!pendingAvatar) {
      setPendingAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(pendingAvatar.blob);
    setPendingAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingAvatar]);
  useOverlayLifecycle(isOpen, requestClose, { containerRef: modalPanelRef });

  const onAvatarBlob = useCallback(async (blob: Blob, fileName: string) => {
    setPendingAvatar({ blob, fileName });
    setAvatar('');
    setAvatarAssetId('');
    setAvatarFailed(false);
    setMediaError(null);
  }, []);
  const photoSource = usePhotoSource(onAvatarBlob);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen || (isEditing && !currentProfile) || typeof document === 'undefined') return null;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void onAvatarBlob(file, file.name);
  };

  const hasAvatarSource = Boolean(avatarAssetId || pendingAvatar || avatar.trim());

  // Clears every avatar source in the draft. The saved asset is only queued for
  // cleanup on Save; Cancel keeps the original profile image.
  const clearAvatar = () => {
    setPendingAvatar(null);
    setAvatar('');
    setAvatarAssetId('');
    setAvatarFailed(false);
    setMediaError(null);
  };

  // A typed URL becomes the image source, so a managed or pending image must not
  // stay active (and hidden) behind it.
  const handleAvatarUrlChange = (value: string) => {
    setAvatar(value);
    if (value.trim()) {
      setPendingAvatar(null);
      setAvatarAssetId('');
    }
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (avatar.trim() && !normalizedAvatar) {
      setMediaError('Use a valid HTTPS image URL, or choose a managed image.');
      return;
    }
    setMediaBusy(true);
    setMediaError(null);
    const oldAssetId = isEditing ? currentProfile?.avatarAssetId : undefined;
    try {
      const profileId = isEditing && currentProfile
        ? currentProfile.id
        : addProfile({ name: cleanName, avatar: normalizedAvatar });
      let nextAssetId = avatarAssetId || undefined;
      if (pendingAvatar) {
        const asset = await mediaStorage.save(pendingAvatar.blob, {
          profileId,
          ownerType: 'profile',
          ownerId: profileId,
          role: 'primary',
          fileName: pendingAvatar.fileName,
        });
        nextAssetId = asset.id;
      }
      updateProfile(profileId, { name: cleanName, avatar: normalizedAvatar, avatarAssetId: nextAssetId });
      if (oldAssetId && oldAssetId !== nextAssetId) {
        queueMediaCleanup({ profileId, assetIds: [oldAssetId], reason: 'attachment-detached' });
        void processPendingMediaCleanup();
      }
      close();
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The profile image could not be saved.');
    } finally {
      setMediaBusy(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
        <div aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

        <section
          ref={modalPanelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="caizen-profile-title"
          className="caizen-profile-modal modal-card-enter relative z-10 flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-border/60 bg-background/96 shadow-2xl backdrop-blur-2xl sm:rounded-[2rem]"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 px-5 py-5 sm:px-7">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {isEditing ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  {isEditing ? 'Profile settings' : 'New workspace'}
                </p>
                <h2 id="caizen-profile-title" className="mt-1 text-2xl font-black tracking-tight">
                  {isEditing ? 'Edit profile' : 'Create profile'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Profiles keep separate Caizen workspaces on this device.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={requestClose}
              className="rounded-xl border border-border/60 bg-card/60 p-2.5 text-muted-foreground transition hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-7">
            <aside>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.75rem] border border-border/60 bg-muted/35">
                {pendingAvatarPreview ? (
                  <img src={pendingAvatarPreview} alt="Profile preview" className="h-full w-full object-cover" />
                ) : avatarAssetId && currentProfile ? (
                  <MediaAssetImage profileId={currentProfile.id} assetId={avatarAssetId} alt="Profile preview" variant="full" className="h-full w-full object-cover" />
                ) : normalizedAvatar && !avatarFailed ? (
                  <img
                    src={normalizedAvatar}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <div className="text-center">
                    <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/12 text-2xl font-black text-primary">
                      {name.trim() ? initials(name) : <UserRound className="h-8 w-8" />}
                    </span>
                    {avatarFailed ? (
                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" /> Image unavailable
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                Choose a managed image or use an HTTPS image URL. Remote images are fetched from their host. Initials are used when no image is available.
              </p>
            </aside>

            <div className="space-y-5">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Profile name</span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={50}
                  className="control-input mt-2 h-12"
                  placeholder="Personal, Work, Travel…"
                  autoFocus
                />
                <span className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>Required</span>
                  <span>{name.length}/50</span>
                </span>
              </label>

              <div className="rounded-2xl border border-border/55 bg-card/55 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Profile image</p>
                <p className="mt-1 text-xs text-muted-foreground">Stored privately with this profile.</p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={handleFile} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" disabled={mediaBusy} onClick={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()} className="rounded-xl">
                    {hasAvatarSource ? 'Replace' : 'Choose image'}
                  </Button>
                  {hasAvatarSource ? <Button type="button" variant="ghost" disabled={mediaBusy} onClick={clearAvatar} className="rounded-xl text-destructive hover:text-destructive">Remove profile image</Button> : null}
                </div>
                {mediaError ? <p className="mt-2 text-xs font-bold text-destructive" role="alert">{mediaError}</p> : null}
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Profile image URL</span>
                <input
                  value={avatar}
                  onChange={event => handleAvatarUrlChange(event.target.value)}
                  aria-invalid={Boolean(avatar.trim() && !normalizedAvatar)}
                  className="control-input mt-2 h-12"
                  placeholder="https://example.com/photo.webp"
                  inputMode="url"
                />
                {avatar.trim() && !normalizedAvatar ? <span className="mt-1 block text-xs font-semibold text-destructive">Enter a valid HTTPS image URL.</span> : null}
              </label>

              <div className="rounded-2xl border border-border/55 bg-card/55 p-4 text-sm leading-6 text-muted-foreground">
                Profile data remains local unless you explicitly export a backup or use Cloud Backup.
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <Button variant="outline" onClick={requestClose} className="rounded-xl">Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={!name.trim() || mediaBusy} className="rounded-xl">
              {isEditing ? 'Save profile' : 'Create profile'}
            </Button>
          </footer>
        </section>
      </div>

      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="Discard profile changes?"
        message="Your unsaved profile changes will be lost."
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous={false}
        onCancel={() => setShowUnsavedDialog(false)}
        onConfirm={() => {
          setShowUnsavedDialog(false);
          close();
        }}
      />
      <PhotoSourceSheet
        open={photoSource.sheetOpen}
        title="Choose profile image"
        canRemove={hasAvatarSource}
        onCamera={photoSource.chooseCamera}
        onGallery={photoSource.chooseGallery}
        onRemove={clearAvatar}
        onClose={photoSource.close}
      />
    </>,
    document.body,
  );
}
