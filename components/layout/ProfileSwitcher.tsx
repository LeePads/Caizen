'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cloud,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';

import { workspaceIsProtected } from '@/lib/storage/workspace-fence';
import { useAppContext } from '@/lib/context';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ProfileModal from '@/components/modals/ProfileModal';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { requestWorkSetupLeave } from '@/lib/workhub/setup-navigation';

function normalizeImageUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ProfilePhoto({
  name,
  avatar,
  avatarAssetId,
  profileId,
  className = '',
  size = 'md',
}: {
  name?: string;
  avatar?: string;
  avatarAssetId?: string;
  profileId?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const src = normalizeImageUrl(avatar);
  const initials = (name || 'Profile').trim().slice(0, 2).toUpperCase();
  const sizeClass =
    size === 'lg' ? 'h-11 w-11 text-sm' : size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';

  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || 'Profile'}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-border/70 ${className}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  if (avatarAssetId && profileId) {
    return (
      <MediaAssetImage
        profileId={profileId}
        assetId={avatarAssetId}
        alt={name || 'Profile'}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-border/70 ${className}`}
        fallback={
          <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/12 font-black text-primary ring-1 ring-primary/20 ${className}`} aria-hidden="true">
            {initials}
          </span>
        }
      />
    );
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/12 font-black text-primary ring-1 ring-primary/20 ${className}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export default function ProfileSwitcher({
  onOpenCloudBackup,
  cloudStatus = 'Signed out',
}: {
  onOpenCloudBackup?: () => void;
  cloudStatus?: string;
}) {
  const {
    profiles = [],
    currentProfileId,
    switchProfile,
    deleteProfile,
    getCurrentProfile,
  } = useAppContext();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(typeof profiles)[number] | null>(null);
  const currentProfile = getCurrentProfile();

  useEffect(() => {
    const openProfiles = () => { if (workspaceIsProtected()) window.dispatchEvent(new Event('caizen:demo-native-return-request')); else setShowEditModal(true); };
    window.addEventListener('caizen:open-profiles', openProfiles);
    return () => window.removeEventListener('caizen:open-profiles', openProfiles);
  }, []);

  if (workspaceIsProtected()) return <button type="button" className="min-h-11 rounded-xl border border-border px-3 text-sm" onClick={() => window.dispatchEvent(new Event('caizen:demo-native-return-request'))}>Demo profile - Return</button>;

  return (
    <>
      <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="caizen-profile-trigger group inline-flex min-h-11 items-center gap-2.5 rounded-2xl border border-border/65 bg-card/75 px-2.5 py-1.5 text-left shadow-sm backdrop-blur-xl transition hover:border-primary/25 hover:bg-card"
            aria-label="Open profile menu"
          >
            <ProfilePhoto
              name={currentProfile?.name}
              avatar={currentProfile?.avatar}
              avatarAssetId={currentProfile?.avatarAssetId}
              profileId={currentProfile?.id}
            />

            <span className="caizen-profile-name hidden min-w-0 xl:block">
              <span className="block max-w-[135px] truncate text-sm font-black leading-tight">
                {currentProfile?.name || 'Profile'}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Current profile
              </span>
            </span>

            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="w-[19rem] rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-2xl backdrop-blur-2xl"
        >
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <ProfilePhoto
                name={currentProfile?.name}
                avatar={currentProfile?.avatar}
                avatarAssetId={currentProfile?.avatarAssetId}
                profileId={currentProfile?.id}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{currentProfile?.name || 'Profile'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Personal Caizen workspace</p>
              </div>
            </div>
          </div>

          <DropdownMenuItem
            onSelect={() => setTimeout(() => setShowEditModal(true), 0)}
            className="mt-2 cursor-pointer rounded-xl px-3 py-2.5"
          >
            <Pencil className="mr-3 h-4 w-4 text-muted-foreground" />
            Edit current profile
          </DropdownMenuItem>

          {onOpenCloudBackup ? (
            <DropdownMenuItem
              onSelect={() => setTimeout(onOpenCloudBackup, 0)}
              className="cursor-pointer rounded-xl px-3 py-2.5"
            >
              <Cloud className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Cloud &amp; Backup</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{cloudStatus}</span>
              </span>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Switch workspace
          </DropdownMenuLabel>

          <div className="max-h-72 overflow-y-auto pr-1">
            {profiles.map(profile => {
              const active = profile.id === currentProfileId;
              return (
                <div key={profile.id} className="group/profile flex items-center rounded-xl hover:bg-muted/65">
                  <DropdownMenuItem
                    onSelect={() => {
                      if (active) setTimeout(() => setShowEditModal(true), 0);
                      else void requestWorkSetupLeave('profile-switch').then(allow => {
                        if (allow) switchProfile(profile.id);
                      });
                    }}
                    className="min-w-0 flex-1 cursor-pointer rounded-xl px-3 py-2.5 focus:bg-muted"
                  >
                    <ProfilePhoto name={profile.name} avatar={profile.avatar} avatarAssetId={profile.avatarAssetId} profileId={profile.id} />
                    <span className="ml-3 min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{profile.name}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {active ? 'Currently active' : 'Switch to this profile'}
                      </span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </DropdownMenuItem>

                  {profiles.length > 1 && !active ? (
                    <button
                      type="button"
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setProfileMenuOpen(false);
                        setDeleteTarget(profile);
                      }}
                      className="mr-2 rounded-lg p-2 text-muted-foreground opacity-70 transition hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/profile:opacity-100"
                      aria-label={`Delete ${profile.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setTimeout(() => setShowAddModal(true), 0)}
            className="cursor-pointer rounded-xl px-3 py-2.5 font-bold text-primary focus:bg-primary/10 focus:text-primary"
          >
            <Plus className="mr-3 h-4 w-4" />
            Create profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileModal isOpen={showAddModal} mode="add" onClose={() => setShowAddModal(false)} />
      <ProfileModal isOpen={showEditModal} mode="edit" onClose={() => setShowEditModal(false)} />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete profile?"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.name}”, its local records, and managed media from this device? This bypasses Recently Deleted and cannot be undone locally. A separate Cloud Backup snapshot is not automatically deleted.`
            : 'This cannot be undone.'
        }
        confirmText="Delete Profile"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteProfile(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
