'use client';

import { useEffect, useState } from 'react';

import FoodModal from '@/components/modals/FoodModal';
import GameModal from '@/components/modals/GameModal';
import InventoryModal from '@/components/modals/InventoryModal';
import JournalModal from '@/components/modals/JournalModal';
import LifeHubDateModal, { type LifeHubDateDraft } from '@/components/modals/LifeHubDateModal';
import LifeHubRoutineModal, { type LifeHubRoutineDraft } from '@/components/modals/LifeHubRoutineModal';
import LifeHubTaskModal, { type LifeHubTaskDraft } from '@/components/modals/LifeHubTaskModal';
import EntertainmentModal from '@/components/modals/EntertainmentModal';
import SkincareModal from '@/components/modals/SkincareModal';
import SupplementModal from '@/components/modals/SupplementModal';
import WishlistModal from '@/components/modals/WishlistModal';
import WeightModal from '@/components/modals/WeightModal';
import SleepModal, { type SleepDraft } from '@/components/modals/SleepModal';
import { WaterQuickAddModal } from '@/components/modals/WaterQuickAddModal';
import WalletModal from '@/components/modals/WalletModal';
import MusicModal from '@/components/modals/MusicModal';
import TransactionModal from '@/components/balance/TransactionModal';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { useAppContext } from '@/lib/context';
import { mediaStorage } from '@/lib/storage/media-storage';
import { scheduleMediaCleanup } from '@/lib/storage/media-cleanup';
import { parseLocalDateKey } from '@/lib/lifehub/date-utils';
import { parseLocalDateInput } from '@/lib/date-utils';
import { normalizeSleepDurationMinutes } from '@/lib/health/sleep';
import { createEntityId } from '@/lib/utils';
import type { SleepEntry } from '@/lib/types';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { isNativeApp } from '@/lib/platform';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import type { PersonalVaultType } from '@/lib/types';
import type { QuickAddRequest } from '@/lib/quick-add';
import {
  PersonalVaultQuickAddModal,
} from '@/components/sections/PersonalVaultSection';
import {
  WorkHubQuickAddModal,
} from '@/components/sections/WorkHubSection';

type WorkKind = 'project' | 'task' | 'note' | 'resource';

const WORK_CHOICES: Array<{ value: WorkKind; label: string; description: string }> = [
  { value: 'project', label: 'Project', description: 'A focused workspace for related work.' },
  { value: 'task', label: 'Task', description: 'A concrete action inside a project.' },
  { value: 'note', label: 'Note or report', description: 'Capture a decision, update, or report draft.' },
  { value: 'resource', label: 'File or link', description: 'Save a useful file, presentation, or reference.' },
];

const PERSONAL_CHOICES: Array<{ value: PersonalVaultType; label: string; description: string }> = [
  { value: 'document', label: 'Document', description: 'Keep an important document reference.' },
  { value: 'career', label: 'Career', description: 'Save a skill, course, or credential.' },
  { value: 'creative', label: 'Creative', description: 'Keep a creative project or reference.' },
  { value: 'install', label: 'Install kit', description: 'Remember software and setup details.' },
  { value: 'links', label: 'Link', description: 'Save a useful site or reference link.' },
];

function ChoiceModal<T extends string>({
  title,
  description,
  choices,
  onChoose,
  onClose,
}: {
  title: string;
  description: string;
  choices: Array<{ value: T; label: string; description: string }>;
  onChoose: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <CaizenFormDialog title={title} eyebrow="Quick add" onClose={onClose} maxWidthClass="max-w-xl">
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {choices.map(choice => (
          <button
            key={choice.value}
            type="button"
            onClick={() => onChoose(choice.value)}
            className="rounded-2xl border border-border/60 bg-card/45 p-4 text-left transition hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="block text-sm font-black">{choice.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{choice.description}</span>
          </button>
        ))}
      </div>
    </CaizenFormDialog>
  );
}

export default function QuickAddModalHost({
  request,
  androidPresentation = false,
  onClose,
}: {
  request: QuickAddRequest;
  androidPresentation?: boolean;
  onClose: () => void;
}) {
  const context = useAppContext();
  const currentProfile = context.getCurrentProfile();
  const hideBalances = (() => {
    if (typeof window === 'undefined' || !context.currentProfileId) return false;
    try {
      return window.localStorage.getItem(`money-hide-balances-${context.currentProfileId}`) === 'true';
    } catch {
      return false;
    }
  })();
  const [workKind, setWorkKind] = useState<WorkKind | null>(null);
  const [personalType, setPersonalType] = useState<PersonalVaultType | null>(null);

  useEffect(() => {
    setWorkKind(null);
    setPersonalType(null);
  }, [request.kind]);

  const ensureReminderPermission = (description: string) => {
    if (!isNativeApp()) return;
    void ensureNotificationPermission().then(granted => {
      if (!granted) {
        toast({
          title: 'Reminder permission is off',
          description,
          variant: 'warning',
        });
      }
    }).catch(() => {
      toast({
        title: 'Reminder permission could not be checked',
        description,
        variant: 'warning',
      });
    });
  };

  const saveTask = async (draft: LifeHubTaskDraft) => {
    const deadline = draft.deadline
      ? parseLocalDateKey(draft.deadline) || undefined
      : undefined;
    const payload = {
      title: draft.title,
      description: draft.description,
      notes: draft.description,
      type: draft.type,
      priority: draft.type === 'task' ? draft.priority : 'normal' as const,
      deadline: draft.type === 'idea' ? undefined : deadline,
      estimatedMinutes: draft.type === 'task' ? draft.estimatedMinutes : undefined,
      reminderEnabled: draft.type !== 'idea' && draft.reminderEnabled && Boolean(deadline),
      reminderTime: draft.type === 'idea' ? undefined : draft.reminderTime,
      showInCalendar: draft.type === 'reminder' ? draft.showInCalendar : undefined,
      linkedContext: draft.type === 'task' ? draft.linkedContext : undefined,
      photoAssetIds: draft.pendingVisualImage ? undefined : draft.photoAssetIds,
      visualReferenceUrl: draft.pendingVisualImage
        ? undefined
        : normalizeExternalWebUrl(draft.visualReferenceUrl) || undefined,
    };
    if (payload.reminderEnabled) {
      ensureReminderPermission('The item was saved, but Android will not show its reminder until notification permission is enabled.');
    }
    const itemId = context.addProductivityItem({ ...payload, status: 'pending' });
    if (!itemId) throw new Error('The item could not be created.');

    let finalAssetIds = payload.photoAssetIds || [];
    if (draft.pendingVisualImage && context.currentProfileId) {
      try {
        const asset = await mediaStorage.save(draft.pendingVisualImage.blob, {
          profileId: context.currentProfileId,
          ownerType: 'other',
          ownerId: itemId,
          role: 'primary',
          fileName: draft.pendingVisualImage.fileName,
        });
        finalAssetIds = [asset.id];
        context.updateProductivityItem(itemId, {
          photoAssetIds: finalAssetIds,
          visualReferenceUrl: undefined,
        });
      } catch (caught) {
        toast({
          title: 'Item saved without its image',
          description: caught instanceof Error ? caught.message : 'The visual reference could not be attached.',
          variant: 'warning',
        });
      }
    }
    if (!finalAssetIds.length && draft.photoAssetIds?.length && context.currentProfileId) {
      scheduleMediaCleanup({ profileId: context.currentProfileId, assetIds: draft.photoAssetIds, reason: 'attachment-detached' });
    }
    onClose();
  };

  const saveRoutine = (draft: LifeHubRoutineDraft) => {
    const payload = {
      title: draft.title,
      category: draft.category,
      frequency: draft.frequency,
      weekdays: draft.weekdays,
      intervalDays: draft.intervalDays,
      anchorDate: draft.anchorDate ? parseLocalDateKey(draft.anchorDate) || undefined : undefined,
      dayOfMonth: draft.dayOfMonth,
      active: draft.active,
      reminderEnabled: draft.reminderEnabled,
      reminderTime: draft.reminderTime,
      reminderDays: draft.reminderDays,
      linkedSection: draft.linkedSection,
      linkedView: draft.linkedView,
      linkedGameId: draft.linkedGameId,
      linkedContext: draft.linkedContext,
      healthRoutineEvidence: draft.healthRoutineEvidence,
    };
    if (payload.reminderEnabled) {
      ensureReminderPermission('The routine was saved, but Android will not show its reminder until notification permission is enabled.');
    }
    context.addDailyChecklistItem({
      ...payload,
      completedAt: null,
      completionHistory: [],
      completionCount: 0,
    });
    toast({ title: 'Saved locally', description: `${draft.title} is ready in Life Hub.` });
    onClose();
  };

  const saveDate = (draft: LifeHubDateDraft) => {
    const date = parseLocalDateKey(draft.date);
    if (!date) return;
    if (draft.reminderEnabled) {
      ensureReminderPermission('The calendar item was saved, but Android will not show its reminder until notification permission is enabled.');
    }
    context.addImportantDate({
      title: draft.title,
      type: draft.type,
      date,
      endDate: draft.endDate ? parseLocalDateKey(draft.endDate) : null,
      repeat: draft.repeat,
      priority: draft.priority,
      reminder: draft.reminder,
      customReminderDays: draft.customReminderDays,
      reminderEnabled: draft.reminderEnabled,
      reminderTime: draft.reminderTime,
      trackAsOverdue: draft.trackAsOverdue,
      amount: draft.amount,
      link: draft.link,
      notes: draft.notes,
      status: 'upcoming',
    });
    onClose();
  };

  const saveSleep = (draft: SleepDraft) => {
    const createdAt = draft.createdAt || new Date();
    const duration = normalizeSleepDurationMinutes(draft);
    const entry: SleepEntry = {
      ...draft,
      id: draft.id || createEntityId('sleep'),
      date: parseLocalDateInput(draft.date) || new Date(),
      sleepDurationMinutes: duration,
      hours: duration / 60,
      quality: draft.quality,
      createdAt,
    };
    context.updateHealthProfile({
      sleepEntries: draft.id
        ? (context.health.sleepEntries || []).map(item => item.id === draft.id ? entry : item)
        : [...(context.health.sleepEntries || []), entry],
    }, { kind: 'sleep', entry });
    onClose();
  };

  const saveWallet = async (walletData: Parameters<NonNullable<React.ComponentProps<typeof WalletModal>['onSave']>>[0]) => {
    if (!context.currentProfileId) return;
    const {
      pendingImage,
      removeImage,
      avatarAssetId,
      ...walletFields
    } = walletData;
    let nextAssetId = removeImage ? undefined : avatarAssetId;
    let walletId: string | undefined;
    let createdAssetId: string | undefined;
    let imageAttached = false;
    try {
      walletId = context.addWallet(walletFields);
      if (!walletId) throw new Error('The wallet could not be created.');

      if (pendingImage) {
        const asset = await mediaStorage.save(pendingImage.blob, {
          profileId: context.currentProfileId,
          ownerType: 'finance',
          ownerId: walletId,
          role: 'primary',
          fileName: pendingImage.fileName,
        });
        nextAssetId = asset.id;
        createdAssetId = asset.id;
        scheduleMediaCleanup({
          profileId: context.currentProfileId,
          assetIds: [asset.id],
          reason: 'draft-cancelled',
        });
      }
      if (!context.updateWallet(walletId, { ...walletFields, avatarAssetId: nextAssetId })) {
        throw new Error('The wallet changed before it could be saved. Review it, then try again.');
      }
      imageAttached = Boolean(createdAssetId);
      onClose();
    } catch (error) {
      if (walletId) {
        const removed = context.deleteWallet(walletId);
        if (removed && createdAssetId && !imageAttached) {
          scheduleMediaCleanup({ profileId: context.currentProfileId, assetIds: [createdAssetId], reason: 'record-deleted' });
        }
        if (!removed) {
          const message = error instanceof Error ? error.message : 'The wallet image could not be saved.';
          throw new Error(`${message} The wallet was created but could not be rolled back; review it before retrying.`);
        }
      }
      throw error;
    }
  };

  const dateValue = request.initialDate
    ? parseLocalDateKey(request.initialDate) || undefined
    : undefined;

  if (request.kind === 'work' && !workKind) {
    return (
      <ChoiceModal
        title="Add a work item"
        description="Choose the kind of work you want to capture. The editor will open here without leaving your current section."
        choices={WORK_CHOICES}
        onChoose={setWorkKind}
        onClose={onClose}
      />
    );
  }

  if (request.kind === 'personal' && !personalType) {
    return (
      <ChoiceModal
        title="Add a personal item"
        description="Choose how to organize this reference in Personal Vault."
        choices={PERSONAL_CHOICES}
        onChoose={setPersonalType}
        onClose={onClose}
      />
    );
  }

  switch (request.kind) {
    case 'task':
      return <LifeHubTaskModal isOpen profileId={context.currentProfileId} games={context.games} supplements={context.supplements} skincareProducts={context.skincareProducts} workItems={context.workItems} upcomingMoneyItems={context.upcomingMoneyItems} workoutPlans={context.workoutPlans} workoutRoutines={context.workoutRoutines} trashItems={context.trashItems} initialType="task" androidPresentation={androidPresentation} onSave={saveTask} onClose={onClose} />;
    case 'routine':
      return <LifeHubRoutineModal isOpen games={context.games} supplements={context.supplements} skincareProducts={context.skincareProducts} workItems={context.workItems} upcomingMoneyItems={context.upcomingMoneyItems} workoutPlans={context.workoutPlans} workoutRoutines={context.workoutRoutines} trashItems={context.trashItems} androidPresentation={androidPresentation} onSave={saveRoutine} onClose={onClose} />;
    case 'date':
      return <LifeHubDateModal isOpen initialDate={request.initialDate} onSave={saveDate} onClose={onClose} />;
    case 'food':
      return <FoodModal isOpen mode="log-food" defaultDate={request.initialDate} onClose={onClose} />;
    case 'weight':
      return <WeightModal isOpen onClose={onClose} />;
    case 'sleep':
      return <SleepModal isOpen defaultDate={request.initialDate} onSave={saveSleep} onClose={onClose} />;
    case 'water':
      return <WaterQuickAddModal initialDate={request.initialDate} androidPresentation={androidPresentation} onClose={onClose} />;
    case 'journal':
      return <JournalModal isOpen initialDate={dateValue} onClose={onClose} />;
    case 'wallet':
      return <WalletModal isOpen profileId={context.currentProfileId} hideBalances={hideBalances} onClose={onClose} onSave={saveWallet} />;
    case 'expense':
      return (
        <TransactionModal
          wallets={context.wallets}
          categories={currentProfile?.financialCategories || []}
          hideBalances={hideBalances}
          initialType="expense"
          inventoryItems={context.inventoryItems}
          skincareProducts={context.skincareProducts}
          supplements={context.supplements}
          books={context.books}
          games={context.games}
          onClose={onClose}
          onSave={draft => {
            const saved = draft.id
              ? context.updateTransaction(draft.id, draft)
              : Boolean(context.addTransaction(draft));
            if (!saved) return false;
            onClose();
            return true;
          }}
        />
      );
    case 'inventory':
      return <InventoryModal isOpen onClose={onClose} />;
    case 'wishlist':
      return <WishlistModal isOpen onClose={onClose} />;
    case 'supplement':
      return <SupplementModal isOpen onClose={onClose} />;
    case 'game':
      return <GameModal isOpen onClose={onClose} />;
    case 'media':
      return <EntertainmentModal isOpen onClose={onClose} />;
    case 'music':
      return <MusicModal isOpen onClose={onClose} />;
    case 'skincare':
      return <SkincareModal isOpen onClose={onClose} />;
    case 'work':
      return <WorkHubQuickAddModal isOpen kind={workKind || 'project'} onClose={onClose} />;
    case 'personal':
      return <PersonalVaultQuickAddModal isOpen initialType={personalType || 'document'} onClose={onClose} />;
    default:
      return null;
  }
}
