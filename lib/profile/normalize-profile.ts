import type {
  DailyChecklistItem,
  HealthProfile,
  ImportantDateItem,
  InventoryItem,
  MediaItem,
  MilestoneUnlock,
  PetCompanionData,
  Profile,
} from '../types';
import { normalizeFeedbackPreferences } from '../feedback/types';
import { normalizeUpcomingMoneyItem } from '../upcoming-money';
import { createEntityId } from '../utils';
import { parseLocalDateKey } from '../date-utils';
import {
  normalizeBalanceCheckIn,
  normalizeBalanceProjectionRow,
  // normalizeFinancialCategory remains the item-level compatibility normalizer
  // used by normalizeFinancialCategoriesAndReferences at the profile boundary.
  normalizeFinancialCategoriesAndReferences,
  normalizeWalletType,
  toNumber,
} from '../balance';
import {
  normalizePersonalVaultItems,
  normalizePersonalVaultTaxonomy,
} from '../personal-vault/normalization';
import {
  normalizeCollectionRecords,
  normalizeSkincareProducts,
  normalizeSupplements,
  normalizeWishlistItems,
} from '../collections/normalization';
import {
  normalizeGameGuides,
  normalizeGames,
  normalizeMusicItems,
} from '../catalog/normalization';
import { normalizeWorkItemAttachments } from '../work-attachments';
import { normalizeModuleTaxonomies } from '../module-taxonomy-normalization';
import { normalizeTransactions } from '../transactions';
import { normalizeBudgets } from '../finance/budgets';
import { normalizeCareerCollections } from '../career/normalization';
import { normalizeSkincareUsageEvents } from '../skincare/usage';
import { normalizeBooks } from '../books';
import { normalizeWorkTypeDefinitions } from '../workhub/custom-fields';

export type ProfileNormalizationAdapters = {
  normalizeInventoryItem: (item: any) => InventoryItem;
  normalizeProductivityItem: (item: any) => Profile['productivityItems'][number];
  normalizeRoutineItem: (item: any) => DailyChecklistItem;
  normalizeImportantDateItem: (item: any) => ImportantDateItem;
  normalizeHealth: (value?: Partial<HealthProfile> | null) => HealthProfile;
  normalizePet: (pet?: Partial<PetCompanionData> | null) => PetCompanionData;
  normalizeMediaItem: (item: any) => MediaItem;
};

const normalizeDate = (value: unknown, fallback: Date | null = null) => {
  if (!value) return fallback;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : new Date(value);
  }
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseLocalDateKey(value)
    : new Date(value as string | number);
  if (!date) return fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const normalizeWallet = (wallet: any) => {
  const type = normalizeWalletType(wallet?.type);
  const hasGoalTarget = wallet?.goalTarget !== undefined && wallet?.goalTarget !== '';
  const goalTarget = hasGoalTarget ? Math.max(0, toNumber(wallet.goalTarget)) : undefined;
  const goalDeadline =
    typeof wallet?.goalDeadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wallet.goalDeadline)
      ? wallet.goalDeadline
      : undefined;
  return {
    ...wallet,
    id: wallet?.id || createEntityId('wallet'),
    name: wallet?.name || 'Wallet',
    balance: toNumber(wallet?.balance),
    color: wallet?.color || '#64748b',
    type,
    avatarAssetId:
      typeof wallet?.avatarAssetId === 'string' && wallet.avatarAssetId.trim()
        ? wallet.avatarAssetId.trim()
        : undefined,
    goalTarget,
    goalDeadline,
    useForWishlist:
      wallet?.useForWishlist !== undefined
        ? wallet.useForWishlist
        : type === 'free_spending' || type === 'cash_on_hand',
    includeInSpendable:
      wallet?.includeInSpendable !== undefined
        ? wallet.includeInSpendable
        : type === 'free_spending' || type === 'cash_on_hand',
    isProtected:
      wallet?.isProtected !== undefined
        ? wallet.isProtected
        : type === 'savings' || type === 'investment',
    purpose:
      wallet?.purpose ||
      (type === 'free_spending'
        ? 'Free Spending'
        : type === 'cash_on_hand'
          ? 'Cash'
          : type === 'savings'
            ? 'Emergency Fund'
            : 'Investment'),
    createdAt: normalizeDate(wallet?.createdAt, new Date()) || new Date(),
  };
};

const normalizeTrashItems = (items: unknown) =>
  (Array.isArray(items) ? items : [])
    .map((item: any) => {
      const deletedAt = normalizeDate(item?.deletedAt, new Date()) || new Date();
      const deleteAfter = normalizeDate(item?.deleteAfter) || new Date(deletedAt);
      if (!item?.deleteAfter) deleteAfter.setDate(deleteAfter.getDate() + 30);
      return { ...item, deletedAt, deleteAfter };
    })
    .filter((item: any) => new Date(item.deleteAfter).getTime() > Date.now());

const normalizeAchievementUnlocks = (items: unknown) =>
  (Array.isArray(items) ? items : []).map((item: any) => ({
    ...item,
    unlockedAt: normalizeDate(item?.unlockedAt, new Date()) || new Date(),
    seenAt: normalizeDate(item?.seenAt),
  }));

const normalizeMasteryMilestones = (items: unknown) =>
  (Array.isArray(items) ? items : []).map((item: any) => ({
    ...item,
    reachedAt: normalizeDate(item?.reachedAt, new Date()) || new Date(),
    seenAt: normalizeDate(item?.seenAt),
  }));

const normalizeMilestoneUnlocks = (items: unknown): MilestoneUnlock[] =>
  [...(
    (Array.isArray(items) ? items : [])
      .map((item: any) => ({
        ...item,
        milestoneId: typeof item?.milestoneId === 'string' ? item.milestoneId : '',
        achievedAt: normalizeDate(item?.achievedAt),
        seenAt: normalizeDate(item?.seenAt),
      }))
      .filter((item: any) => item.milestoneId && item.achievedAt)
      .reduce((byId, item) => {
        const existing = byId.get(item.milestoneId);
        if (!existing || item.achievedAt.getTime() < existing.achievedAt.getTime()) {
          byId.set(item.milestoneId, item);
        }
        return byId;
      }, new Map<string, MilestoneUnlock>())
      .values()
  )];

const normalizeSharedProfileFields = (
  profile: any,
  adapters: ProfileNormalizationAdapters,
) => {
  const baseCurrency = profile?.baseCurrency || profile?.currency || 'PHP';
  const normalizedTransactions = normalizeTransactions(profile?.transactions);
  const normalizedFinancialCategories = normalizeFinancialCategoriesAndReferences(
    profile?.financialCategories,
    normalizedTransactions,
    index => createEntityId(`category-${index}`),
  );
  const normalizedWallets = (Array.isArray(profile?.wallets) ? profile.wallets : []).map(normalizeWallet);
  const normalizedProjectionRows = (Array.isArray(profile?.balanceProjectionRows)
    ? profile.balanceProjectionRows
    : []
  ).map((item: any, index: number) =>
    normalizeBalanceProjectionRow(
      item,
      item?.id || createEntityId(`projection-${index}`),
    ),
  ).map(row => {
    if (!row.recurrence) return row;
    const category = normalizedFinancialCategories.categories.find(
      item => item.id === row.recurrence?.categoryId && item.type === row.type,
    );
    const subcategory = category?.subcategories.find(
      item => item.id === row.recurrence?.subcategoryId,
    );
    return {
      ...row,
      recurrence: {
        ...row.recurrence,
        categoryId: category?.id,
        subcategoryId: subcategory?.id,
      },
    };
  });
  const normalizedCareer = normalizeCareerCollections(
    profile?.careerSkills,
    profile?.careerCourses,
    profile?.careerCredentials,
  );
  return {
    ...profile,
    id: String(profile?.id || createEntityId('profile')),
    name: String(profile?.name || 'Recovered Profile'),
    avatar: typeof profile?.avatar === 'string' ? profile.avatar : undefined,
    avatarAssetId:
      typeof profile?.avatarAssetId === 'string' && profile.avatarAssetId.trim()
        ? profile.avatarAssetId.trim()
        : undefined,
    baseCurrency,
    currency: profile?.currency || baseCurrency,
    wallets: normalizedWallets,
    transactions: normalizedFinancialCategories.transactions,
    inventoryItems: normalizeCollectionRecords(
      profile?.inventoryItems,
      item => adapters.normalizeInventoryItem(item),
    ),
    wishlistItems: normalizeWishlistItems(profile?.wishlistItems),
    upcomingMoneyItems: (Array.isArray(profile?.upcomingMoneyItems)
      ? profile.upcomingMoneyItems
      : []
    ).map((item: any) =>
      normalizeUpcomingMoneyItem({
        ...item,
        id: item?.id || createEntityId('money'),
        title: item?.title || 'Untitled money item',
        direction: item?.direction === 'incoming' ? 'incoming' : 'outgoing',
      }),
    ),
    productivityItems: (Array.isArray(profile?.productivityItems)
      ? profile.productivityItems
      : []
    ).map(adapters.normalizeProductivityItem),
    mediaItems: (Array.isArray(profile?.mediaItems) ? profile.mediaItems : []).map(
      adapters.normalizeMediaItem,
    ),
    books: normalizeBooks(profile?.books),
    games: normalizeGames(profile?.games),
    gameGuides: normalizeGameGuides(profile?.gameGuides),
    musicItems: normalizeMusicItems(profile?.musicItems),
    workItems: (Array.isArray(profile?.workItems) ? profile.workItems : []).map((item: any) =>
      normalizeWorkItemAttachments({
        ...item,
        id: item?.id || createEntityId('work'),
        severity: item?.severity === 'urgent' ? 'critical' : item?.severity,
        date: normalizeDate(item?.date),
        dueDate: normalizeDate(item?.dueDate),
        createdAt: normalizeDate(item?.createdAt, new Date()) || new Date(),
      }),
    ),
    journalEntries: (Array.isArray(profile?.journalEntries) ? profile.journalEntries : []).map((item: any) => ({
      ...item,
      id: item?.id || createEntityId('journal'),
      date: normalizeDate(item?.date, new Date()) || new Date(),
      createdAt: normalizeDate(item?.createdAt, new Date()) || new Date(),
      photoAssetIds: Array.isArray(item?.photoAssetIds)
        ? item.photoAssetIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
        : undefined,
      attachmentAssetIds: Array.isArray(item?.attachmentAssetIds)
        ? item.attachmentAssetIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
        : undefined,
    })),
    personalVaultItems: normalizePersonalVaultItems(profile?.personalVaultItems),
    careerSkills: normalizedCareer.skills,
    careerCourses: normalizedCareer.courses,
    careerCredentials: normalizedCareer.credentials,
    personalVaultTaxonomy: normalizePersonalVaultTaxonomy(
      profile?.personalVaultTaxonomy,
    ),
    moduleTaxonomies: normalizeModuleTaxonomies(profile?.moduleTaxonomies),
    workTypes: Array.isArray(profile?.workTypes)
      ? normalizeWorkTypeDefinitions(profile.workTypes)
      : undefined,
    skincareProducts: normalizeSkincareProducts(profile?.skincareProducts),
    skincareUsageEvents: normalizeSkincareUsageEvents(profile?.skincareUsageEvents),
    supplements: normalizeSupplements(profile?.supplements),
    pet: adapters.normalizePet(profile?.pet),
    achievementUnlocks: normalizeAchievementUnlocks(profile?.achievementUnlocks),
    milestoneUnlocks: normalizeMilestoneUnlocks(profile?.milestoneUnlocks),
    masteryMilestones: normalizeMasteryMilestones(profile?.masteryMilestones),
    trashItems: normalizeTrashItems(profile?.trashItems),
    dailyChecklistItems: (Array.isArray(profile?.dailyChecklistItems)
      ? profile.dailyChecklistItems
      : []
    ).map(adapters.normalizeRoutineItem),
    balanceProjectionRows: normalizedProjectionRows,
    financialCategories: normalizedFinancialCategories.categories,
    budgets: normalizeBudgets(
      profile?.budgets,
      normalizedFinancialCategories.categories,
    ),
    skippedRecurringBudgetScopes: Array.isArray(profile?.skippedRecurringBudgetScopes)
      ? profile.skippedRecurringBudgetScopes.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    balanceCheckIns: (Array.isArray(profile?.balanceCheckIns)
      ? profile.balanceCheckIns
      : []
    ).map((item: any, index: number) =>
      normalizeBalanceCheckIn(
        {
          ...item,
          completedAt: normalizeDate(item?.completedAt, new Date()) || new Date(),
        },
        item?.id || createEntityId(`checkin-${index}`),
      ),
    ),
    importantDates: (Array.isArray(profile?.importantDates) ? profile.importantDates : []).map(
      adapters.normalizeImportantDateItem,
    ),
    feedbackPreferences: normalizeFeedbackPreferences(profile?.feedbackPreferences),
    categoryXpEvents: Array.isArray(profile?.categoryXpEvents) ? profile.categoryXpEvents : [],
    masteryBondXpEvents: Array.isArray(profile?.masteryBondXpEvents) ? profile.masteryBondXpEvents : [],
    masteryBondClaims: Array.isArray(profile?.masteryBondClaims) ? profile.masteryBondClaims : [],
    masteryCompanionPreferences: profile?.masteryCompanionPreferences || {},
    activeMasteryCompanion: profile?.activeMasteryCompanion,
    health: adapters.normalizeHealth(profile?.health),
    createdAt: normalizeDate(profile?.createdAt, new Date()) || new Date(),
  };
};

/**
 * Kept as a named compatibility boundary for callers from the previous
 * profile pipeline. New hydration/import paths intentionally do not replay
 * achievement or mastery progression.
 */
export function migrateProfile(profile: Profile, _now = new Date()): Profile {
  void _now;
  return profile;
}

export function normalizeProfile(
  input: unknown,
  adapters: ProfileNormalizationAdapters,
): Profile {
  return normalizeSharedProfileFields(input, adapters) as Profile;
}

export function normalizeAndMigrateProfile(
  input: unknown,
  adapters: ProfileNormalizationAdapters,
  now = new Date(),
): Profile {
  return migrateProfile(normalizeProfile(input, adapters), now);
}

export function normalizeLoadedProfile(
  input: unknown,
  adapters: ProfileNormalizationAdapters,
  now = new Date(),
): Profile {
  // Keep persisted-profile hydration on the same canonical boundary as
  // imports, recovery, and fallback initialization. Legacy mastery and
  // achievement migrations are intentionally not replayed here; legacy
  // milestones are projected read-only by lib/milestones.ts.
  return normalizeAndMigrateProfile(input, adapters, now);
}

export function normalizeFallbackProfile(
  input: unknown,
  adapters: ProfileNormalizationAdapters,
): Profile {
  const profile = input as any;
  const normalized = {
    ...normalizeSharedProfileFields(profile, adapters),
    trashItems: Array.isArray(profile?.trashItems) ? profile.trashItems : [],
    journalEntries: (Array.isArray(profile?.journalEntries) ? profile.journalEntries : []).map(
      (item: any) => ({
        ...item,
        id: item?.id || createEntityId('journal'),
        date: normalizeDate(item?.date, new Date()) || new Date(),
        createdAt: normalizeDate(item?.createdAt, new Date()) || new Date(),
      }),
    ),
    balanceCheckIns: (Array.isArray(profile?.balanceCheckIns)
      ? profile.balanceCheckIns
      : []
    ).map((item: any, index: number) =>
      normalizeBalanceCheckIn(
        {
          ...item,
          completedAt: normalizeDate(item?.completedAt, new Date()) || new Date(),
        },
        item?.id || createEntityId(`checkin-${index}`),
      ),
    ),
  } as Profile;

  return migrateProfile(normalized);
}
