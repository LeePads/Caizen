"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { parseLocalDateKey, parseLocalDateValue, toLocalDateKey } from "./lifehub/date-utils";
import {
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineOccurrenceKey,
  isRoutineDoneForDate,
  isRoutineDueForDate,
  recoverSkippedRoutineOccurrence,
  recordRoutineScheduleRevision,
} from "./lifehub/routine-schedule";
import {
  normalizeImportantDateItem,
  normalizeProductivityItem,
  normalizeRoutineItem,
} from './lifehub/normalization';
import {
  Wallet,
  InventoryItem,
  WishlistItem,
  UpcomingMoneyItem,
  JournalEntry,
  Game,
  GameGuide,
  ProductivityItem,
  MediaItem,
  BookItem,
  MusicItem,
  SkincareProduct,
  SkincareFinishDetails,
  SkincareRepurchaseInput,
  Supplement,
  Profile,
  AppContextType,
  FoodEntry,
  HealthProfile,
  ActivityEntry,
  WorkoutPlan,
  FoodTemplate,
  WeightEntry,
  NoXTracker,
  DailyChecklistItem,
  ImportantDateItem,
  ImportantDateStatus,
  TrashSource,
  TrashItem,
  PetCompanionData,
  MochiReaction,
  PersonalVaultItem,
  CareerSkill,
  CareerCourse,
  CareerCredential,
  WorkItem,
  WorkLifeHubMirrorIntent,
  Transaction,
  RecurringActionResult,
  RecurringOccurrenceOverrides,
  WorkoutExerciseDefinition,
  WorkoutRoutine,
  WorkoutSession,
  FastingSession,
  WaterEntry,
  BodyMeasurementEntry,
  HealthEvidenceEvent,
  ModuleTaxonomyCategory,
  WorkTypeDefinition,
} from "./types";
import { normalizeFeedbackPreferences } from './feedback/types';
import type { ActionOutcome } from './feedback/types';
import { publishActionOutcome } from './feedback/events';
import { setCurrencyContext } from "./currency";
import { initializeAppStorage } from "./storage/localstorage-migration";
import {
  createProfilePersistence,
  type ProfilePersistenceController,
} from './storage/profile-persistence';
import { assertRealWorkspace } from './storage/workspace-fence';
import { loadAppState as loadCloudWorkspace } from './storage/app-repository';
import { ONBOARDING_PENDING_KEY } from "./onboarding";
import {
  processPendingProfileMediaCleanups,
  queueProfileMediaCleanup,
} from "./storage/profile-media-cleanup";
import { collectMediaReferenceIds } from './storage/media-references';
import {
  processPendingMediaCleanup,
  queueMediaCleanup,
  scheduleMediaCleanup,
} from './storage/media-cleanup';
import {
  queueExpiredTrashMediaCleanup,
  queueTrashMediaCleanup,
  hasExpiredCollectionTrash,
} from './storage/trash-media';
import { normalizeUpcomingMoneyItem } from "./upcoming-money";
import { clearGameRoutineLinks } from './games/routine-activity';
import {
  clearGameLinksFromTasks,
  clearSkincareLinksFromRoutines,
  clearSkincareLinksFromTasks,
  clearSupplementLinksFromRoutines,
  clearSupplementLinksFromTasks,
  clearWorkLinksFromRoutines,
  clearWorkLinksFromTasks,
  clearHealthLinksFromRoutines,
  clearHealthLinksAndEvidenceFromRoutines,
  clearHealthLinksFromTasks,
  clearUpcomingMoneyLinksFromRoutines,
  clearUpcomingMoneyLinksFromTasks,
  getWorkItemIdsFromTrashData,
  getWorkItemIdFromLifeHubRecord,
  healthLinkedTargetKey,
  getSkincareProductIdsFromLifeHubRecord,
  getSupplementIdsFromLifeHubRecord,
  getUpcomingMoneyIdFromLifeHubRecord,
} from './lifehub/linked-context';
import {
  completeProductivityItemInProfile,
  changeRoutineProgressInProfile,
  completeRoutineOccurrenceInProfile,
} from './lifehub/completion';
import { completeLinkedLifeHubItemsForWorkTask } from './work/lifehub-completion';
import {
  completeManagedWorkMirrorFromLifeHub,
  reconcileWorkLifeHubMirror,
  workPriorityToLifeHub,
} from './work/lifehub-mirror';
import { applyHealthEvidenceToProfile } from './health/lifehub-completion';
import { applyJournalEvidenceToProfile } from './journal/lifehub-completion';
import { completeSkincareRoutineOccurrenceInProfile } from './skincare/lifehub-completion';
import { completeSupplementRoutineOccurrenceInProfile } from './supplements/lifehub-completion';
import { normalizeSkincareUsageEvents, getSkincareUsageSummary } from './skincare/usage';
import { getSkincareCycleDaysUsed, getSkincareTypicalDurationDays } from './skincare/duration';
import { normalizeReleaseHistory } from './entertainment/derived';
import { normalizeWorkItemAttachments } from './work-attachments';
import { normalizeWorkTypeDefinitions } from './workhub/custom-fields';
import { normalizeModuleTaxonomies } from './module-taxonomy-normalization';
import {
  normalizeCareerCollections,
  normalizeCareerCourses,
  normalizeCareerCredentials,
  normalizeCareerSkills,
} from './career/normalization';
import {
  aggregateTransactionWalletDeltas,
  applyTransactionToWallets,
  applyWalletDeltas,
  clearTransactionHistory,
  connectUnlinkedTransactionWallet,
  createAdjustmentTransaction,
  normalizeTransaction,
  normalizeTransactions,
  transactionValidationError,
} from './transactions';
import {
  createDefaultFinancialCategories,
  seedFinancialCategoriesIfEmpty,
} from './finance/default-categories';
import {
  advanceRecurringProjectionRow,
  getRecurringOccurrenceState,
} from './finance/recurring-transactions';
import { toNumber, walletBalancesMatchOpening } from './balance';
import { sumMoney } from './money';
import { createEntityId } from './utils';
import {
  finiteCollectionNumber,
  normalizeCollectionDate,
  normalizeInventoryRecord,
  normalizeInventoryItems,
  mapBalanceCategoryToInventoryCategory,
  normalizeSkincareRecord,
  normalizeSkincareProducts,
  normalizeSupplementRecord,
  normalizeSupplements,
  normalizeWishlistRecord,
  normalizeWishlistItems,
  optionalFiniteCollectionNumber,
} from './collections/normalization';
import {
  getInventoryCurrentValueIfKnown,
  getInventoryQuantity,
} from './collections/inventory-metrics';
import { normalizeInventoryCategoryKey } from './collections/inventory-taxonomy';
import {
  normalizeHealth,
  normalizeHealthNonNegative,
} from './health/normalization';
import { readFoodEntryMealType } from './health/food-entry';
import {
  hasConflictingActiveFastingSession,
  isValidFastingSession,
  isValidFastingTarget,
} from './health/fasting';
import {
  normalizePersonalVaultItems,
  normalizePersonalVaultTaxonomy,
} from './personal-vault/normalization';
import { normalizeMediaProgress } from './entertainment/progress';
import { normalizeBook, normalizeBooks } from './books';
import { normalizeExternalWebUrl } from './native/open-link';
import { hasMeaningfulJournalEntry } from './journal-content';
import {
  normalizeCatalogImageSource,
  normalizeEntertainmentMetadata,
  normalizeGameGuideRecord,
  normalizeGameGuides,
  normalizeGameRecord,
  normalizeGames,
  normalizeMusicItems,
  normalizeMusicRecord,
} from './catalog/normalization';
import {
  normalizeFallbackProfile,
  normalizeLoadedProfile,
  type ProfileNormalizationAdapters,
} from './profile/normalize-profile';
import { createDefaultPet, normalizePet } from './pets/normalization';
import { applyMilestoneTransition, MILESTONE_DEFINITIONS } from './milestones';
import { endRuntimeTrace, startRuntimeTrace } from './performance-trace';
const AppContext = createContext<AppContextType | undefined>(undefined);
const STORAGE_KEY = "asset-planning-app-data";
const TRASH_RETENTION_DAYS = 30;

const publishFeedback = (outcome: ActionOutcome) => {
  publishActionOutcome(outcome);
};

const normalizeDateValue = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseLocalDateKey(value) || undefined;
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeJournalEntry = (item: any): JournalEntry => ({
  ...item,
  id: item?.id || createEntityId('journal'),
  date: normalizeDateValue(item?.date) || new Date(),
  createdAt: normalizeDateValue(item?.createdAt) || new Date(),
  photoAssetIds: Array.isArray(item?.photoAssetIds)
    ? item.photoAssetIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
    : undefined,
  attachmentAssetIds: Array.isArray(item?.attachmentAssetIds)
    ? item.attachmentAssetIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
    : undefined,
});

const normalizeWorkItem = (item: any) =>
  normalizeWorkItemAttachments({
    ...item,
    id: item?.id || createEntityId('work'),
    date: normalizeDateValue(item?.date),
    dueDate: normalizeDateValue(item?.dueDate),
    createdAt: normalizeDateValue(item?.createdAt) || new Date(),
  });

const normalizeInventoryItem = (item: unknown) => normalizeInventoryRecord(item);

const normalizeMediaItem = (item: any): MediaItem => {
  const type = ["anime", "manga", "movie", "series"].includes(item?.type)
    ? item.type
    : "anime";
  const defaultStatus = type === "manga" ? "reading" : "watching";
  const status = [
    "reading",
    "watching",
    "completed",
    "planned",
    "paused",
    "dropped",
  ].includes(item?.status)
    ? item.status
    : defaultStatus;
  const normalizeNonNegative = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  };
  const totalSource = item?.totalUnits == null ? item?.episodes : item.totalUnits;
  const totalUnits = totalSource == null ? undefined : normalizeNonNegative(totalSource);
  const episodes = item?.episodes == null ? undefined : normalizeNonNegative(item.episodes);
  const completedAt = normalizeDateValue(item?.completedAt) || null;
  const normalizedProgress = normalizeMediaProgress({
    type,
    episodes,
    totalUnits,
    progress: item?.progress,
    currentEpisode: item?.currentEpisode,
    status,
    completedAt,
  });
  const catalogProvider = ["anilist", "tmdb", "manual"].includes(
    item?.catalogProvider,
  )
    ? item.catalogProvider
    : "manual";
  const metadataNumbers = normalizeEntertainmentMetadata(item || {});

  return {
    ...item,
    id: item?.id || createEntityId("media"),
    title: item?.title || item?.canonicalTitle || "Untitled media",
    type,
    status: normalizedProgress.status,
    episodes,
    totalUnits,
    unitLabel:
      item?.unitLabel === "chapters" || item?.unitLabel === "volumes"
        ? item.unitLabel
        : "episodes",
    progress: normalizedProgress.progress,
    currentSeason:
      item?.currentSeason == null
        ? undefined
        : metadataNumbers.currentSeason,
    currentEpisode: normalizedProgress.currentEpisode,
    rating:
      item?.rating == null
        ? undefined
        : metadataNumbers.rating,
    genres: Array.isArray(item?.genres)
      ? item.genres.filter(
          (value: unknown): value is string =>
            typeof value === "string" && Boolean(value.trim()),
        )
      : item?.genre
        ? [String(item.genre)]
        : [],
    links: Array.isArray(item?.links)
      ? item.links
          .map((link: any) => ({
            id: typeof link?.id === 'string' && link.id.trim() ? link.id : createEntityId('media-link'),
            label: typeof link?.label === 'string' ? link.label : 'External link',
            url: normalizeExternalWebUrl(link?.url) || '',
          }))
          .filter((link: { url: string }) => Boolean(link.url))
      : [],
    alternateTitles: Array.isArray(item?.alternateTitles)
      ? item.alternateTitles
      : [],
    catalogProvider,
    catalogId: item?.catalogId == null ? undefined : String(item.catalogId),
    sourceStatus: [
      "upcoming",
      "airing",
      "returning",
      "finished",
      "cancelled",
      "hiatus",
      "unknown",
    ].includes(item?.sourceStatus)
      ? item.sourceStatus
      : undefined,
    totalSeasons:
      item?.totalSeasons == null
        ? undefined
        : metadataNumbers.totalSeasons,
    availableUnits:
      item?.availableUnits == null
        ? undefined
        : metadataNumbers.availableUnits,
    acknowledgedAvailableUnits:
      item?.acknowledgedAvailableUnits == null
        ? item?.availableUnits == null
          ? undefined
          : metadataNumbers.availableUnits
        : metadataNumbers.acknowledgedAvailableUnits,
    newUnitsAvailable: metadataNumbers.newUnitsAvailable,
    hasNewSeason: Boolean(item?.hasNewSeason),
    nextEpisodeNumber:
      item?.nextEpisodeNumber == null
        ? undefined
        : metadataNumbers.nextEpisodeNumber,
    nextEpisodeAt: normalizeDateValue(item?.nextEpisodeAt) || null,
    nextEpisodeDate:
      typeof item?.nextEpisodeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.nextEpisodeDate)
        ? item.nextEpisodeDate
        : null,
    releaseDate:
      typeof item?.releaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)
        ? item.releaseDate
        : null,
    releaseHistory: normalizeReleaseHistory(item?.releaseHistory),
    image: normalizeCatalogImageSource(item?.image),
    imageAssetId: typeof item?.imageAssetId === 'string' && item.imageAssetId.trim()
      ? item.imageAssetId
      : undefined,
    backdrop: normalizeCatalogImageSource(item?.backdrop),
    website: normalizeExternalWebUrl(item?.website) || undefined,
    catalogUrl: normalizeExternalWebUrl(item?.catalogUrl) || undefined,
    relations: Array.isArray(item?.relations)
      ? item.relations.map((relation: any) => ({
          ...relation,
          image: normalizeCatalogImageSource(relation?.image),
          catalogUrl: normalizeExternalWebUrl(relation?.catalogUrl) || undefined,
        }))
      : [],
    seasonDetails: Array.isArray(item?.seasonDetails) ? item.seasonDetails : [],
    watchProviders: Array.isArray(item?.watchProviders)
      ? item.watchProviders.map((provider: any) => ({
          ...provider,
          logo: normalizeCatalogImageSource(provider?.logo),
          link: normalizeExternalWebUrl(provider?.link) || undefined,
        }))
      : [],
    runtimeMinutes: metadataNumbers.runtimeMinutes,
    lastSyncedAt: normalizeDateValue(item?.lastSyncedAt) || null,
    metadataUpdatedAt: normalizeDateValue(item?.metadataUpdatedAt) || null,
    startedAt: normalizeDateValue(item?.startedAt) || null,
    completedAt: normalizedProgress.completedAt,
    createdAt: normalizeDateValue(item?.createdAt) || new Date(),
    updatedAt: normalizeDateValue(item?.updatedAt) || undefined,
  };
};

const profileNormalizationAdapters: ProfileNormalizationAdapters = {
  normalizeInventoryItem,
  normalizeProductivityItem,
  normalizeRoutineItem,
  normalizeImportantDateItem,
  normalizeHealth,
  normalizePet,
  normalizeMediaItem,
};

const trashDeleteAfter = (deletedAt: Date) => {
  const date = new Date(deletedAt);
  date.setDate(date.getDate() + TRASH_RETENTION_DAYS);
  return date;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isFreshInstall, setIsFreshInstall] = useState(false);
  const [mochiReactionState, setMochiReactionState] = useState<MochiReaction>('idle');
  const mochiReactionTimerRef = useRef<number | null>(null);
  const persistenceRef = useRef<ProfilePersistenceController | null>(null);
  if (persistenceRef.current === null) {
    persistenceRef.current = createProfilePersistence();
  }
  const persistence = persistenceRef.current;
  const loadedExistingStateRef = useRef(false);
  const starterCategoriesInitializedRef = useRef(new Set<string>());

  // Load the record database, migrating the legacy localStorage snapshot once.
  useEffect(() => {
    if (typeof window === "undefined") return;

    void (async () => {
      let stored: string | null = null;
      let data: any = null;
      try {
        const initialized = await initializeAppStorage();
        // IndexedDB already returns the structured state object. Keep it as an
        // object instead of serializing it only to parse it again below.
        data = initialized.state;
        if (!data) stored = localStorage.getItem(STORAGE_KEY);
        try {
          const pendingCleanup = await processPendingProfileMediaCleanups();
          const failedCleanupCount = pendingCleanup.filter(
            result => result.failedIds.length > 0,
          ).length;
          if (failedCleanupCount > 0) {
            window.setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("caizen-storage-error", {
                  detail: `${failedCleanupCount} profile media cleanup ${failedCleanupCount === 1 ? "job remains" : "jobs remain"} pending. The app will retry again on the next launch.`,
                }),
              );
            }, 0);
          }
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent("caizen-storage-error", {
              detail: error instanceof Error ? error.message : "Profile media cleanup could not be completed.",
            }),
          );
        }
        try {
          const pendingMediaCleanup = await processPendingMediaCleanup();
          if (pendingMediaCleanup.pendingJobs > 0) {
            window.setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("caizen-storage-error", {
                  detail: `${pendingMediaCleanup.pendingJobs} managed media cleanup ${pendingMediaCleanup.pendingJobs === 1 ? "job remains" : "jobs remain"} pending. The app will retry after the next successful save.`,
                }),
              );
            }, 0);
          }
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent("caizen-storage-error", {
              detail: error instanceof Error ? error.message : "Managed media cleanup could not be completed.",
            }),
          );
        }
      } catch (error) {
        // This used to log a generic string and silently fall back to a
        // possibly-stale localStorage snapshot, which is exactly the shape of
        // the "import succeeds but data never appears" bug: a real error here
        // was invisible, and the fallback could resurrect pre-import data.
        console.error(
          "Caizen storage initialization failed:",
          error,
        );
        const message =
          error instanceof Error
            ? error.message
            : "Caizen could not initialize local storage.";
        window.dispatchEvent(
          new CustomEvent("caizen-storage-error", { detail: message }),
        );
        stored = localStorage.getItem(STORAGE_KEY);
      }

      if (data || stored) {
        loadedExistingStateRef.current = true;
        setIsFreshInstall(false);
        // `data`/`restoredProfileId` are parsed outside the per-field enhancement
        // try/catch below, so a failure in the enhancement logic (defaulting
        // wallet types, converting date strings, etc. - the part most likely to
        // choke on a real-world record shape it has not seen before) can still
        // fall back to the RAW parsed profiles instead of leaving `profiles`
        // empty. The previous version wrapped all of this in one try/catch, so
        // any throw during enhancement silently left profiles at its initial
        // `[]` and then still marked the app hydrated - a real, freshly
        // imported profile could be parsed correctly and then thrown away here
        // with only a generic, unhelpful console message.
        let restoredProfileId = "";
        try {
          data = data || (stored ? JSON.parse(stored) : null);
          restoredProfileId =
            data.currentProfileId ||
            (data.profiles && data.profiles[0]?.id) ||
            "";
          const restoredProfile = (data.profiles || []).find(
            (profile: any) => profile.id === restoredProfileId,
          );
          const restoredBaseCurrency =
            restoredProfile?.baseCurrency || restoredProfile?.currency || 'PHP';
          setCurrencyContext(
            restoredBaseCurrency,
            restoredProfile?.currency || restoredBaseCurrency,
          );
        } catch (e) {
          console.error("Caizen could not parse the saved app state:", e);
          data = null;
        }

        try {
          if (!data) throw new Error("no parsed data");
          let removedExpiredCollectionTrash = false;
          for (const profile of data.profiles || []) {
            if (typeof profile?.id === 'string' && profile.id.trim()) {
              removedExpiredCollectionTrash =
                hasExpiredCollectionTrash(profile.trashItems) || removedExpiredCollectionTrash;
              queueExpiredTrashMediaCleanup(profile.id, profile.trashItems);
            }
          }
          if (removedExpiredCollectionTrash) loadedExistingStateRef.current = false;
          const hydratedProfiles = (data.profiles || []).map(profile =>
            normalizeLoadedProfile(profile, profileNormalizationAdapters),
          );
          // Establish the persisted baseline before the first interactive render.
          // Otherwise a fast setup edit can become the "already saved" baseline
          // when the deferred scheduling effect runs for the first time.
          persistence.schedule({ profiles: hydratedProfiles, currentProfileId: restoredProfileId }, loadedExistingStateRef.current);
          setProfiles(hydratedProfiles);
          setCurrentProfileId(restoredProfileId);
        } catch (e) {
          // Fall back to the RAW parsed profiles rather than leaving `profiles`
          // at its initial empty array. Previously this branch logged a generic
          // string and did nothing else, so a real (freshly imported) profile
          // that merely failed this cosmetic enhancement pass - a bad wallet
          // type, an unparsable legacy date field, anything - was silently
          // replaced with an empty app, indistinguishable from "import failed"
          // even though the data was sitting right there in `data`.
          console.error(
            "Caizen recovered profiles after a normalization error:",
            e,
          );
          if (data?.profiles?.length) {
            setProfiles(
              data.profiles.map(profile =>
                normalizeFallbackProfile(profile, profileNormalizationAdapters),
              ),
            );
            setCurrentProfileId(
              restoredProfileId || data.profiles[0]?.id || "",
            );
          }
        }
      } else {
        setIsFreshInstall(true);
        // AppProvider still creates a usable empty profile so the rest of the
        // application can hydrate safely, but that provider-owned profile must
        // not count as completed first-run setup.
        localStorage.setItem(ONBOARDING_PENDING_KEY, "true");
        const defaultProfile: Profile = {
          id: "default-" + Date.now().toString(),
          name: "My Profile",
          baseCurrency: "PHP",
          currency: "PHP",
          wallets: [],
          transactions: [],
          inventoryItems: [],
          wishlistItems: [],
          upcomingMoneyItems: [],
          journalEntries: [],
          games: [],
          gameGuides: [],
          productivityItems: [],
          mediaItems: [],
          books: [],
          musicItems: [],
          workItems: [],
          personalVaultItems: [],
          careerSkills: [],
          careerCourses: [],
          careerCredentials: [],
          personalVaultTaxonomy: [],
          trashItems: [],
          pet: createDefaultPet(),
          skincareProducts: [],
          skincareUsageEvents: [],
          dailyChecklistItems: [],
          importantDates: [],
          supplements: [],
          balanceProjectionRows: [],
          budgets: [],
          balanceProjectionIncludeAllWallets: false,
          financialCategories: createDefaultFinancialCategories(),
          balanceCheckIns: [],
          achievementUnlocks: [],
          milestoneUnlocks: [],
          achievementMigrationVersion: 2,
          masteryMilestones: [],
          categoryXpEvents: [],
          masteryBondXpEvents: [],
          masteryBondClaims: [],
          masteryCompanionPreferences: {},
          activeMasteryCompanion: undefined,
          feedbackPreferences: normalizeFeedbackPreferences(undefined),
          health: normalizeHealth(),

          createdAt: new Date(),
        };
        setProfiles([defaultProfile]);
        setCurrentProfileId(defaultProfile.id);
      }
      setIsHydrated(true);
    })();
  }, []);

  // Persist after a short idle window; the controller owns queueing, retries,
  // storage events, and profile cleanup while Context owns React state.
  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return;

    const timeout = window.setTimeout(() => {
      persistence.schedule(
        { profiles, currentProfileId },
        loadedExistingStateRef.current,
      );
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [profiles, currentProfileId, isHydrated, persistence]);

  useEffect(
    () => () => persistence.dispose(),
    [persistence],
  );

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return;

    const retryMediaCleanup = () => {
      void processPendingMediaCleanup()
        .then(result => {
          if (result.pendingJobs > 0) {
            window.dispatchEvent(
              new CustomEvent('caizen-storage-error', {
                detail: `${result.pendingJobs} managed media cleanup ${result.pendingJobs === 1 ? 'job remains' : 'jobs remain'} pending. The app will retry after the next successful save.`,
              }),
            );
          }
        })
        .catch(error => {
          window.dispatchEvent(
            new CustomEvent('caizen-storage-error', {
              detail: error instanceof Error ? error.message : 'Managed media cleanup could not be completed.',
            }),
          );
        });
    };

    window.addEventListener('caizen:local-save-complete', retryMediaCleanup);
    return () => window.removeEventListener('caizen:local-save-complete', retryMediaCleanup);
  }, [isHydrated]);

  useEffect(() => {
    const profile = profiles.find((item) => item.id === currentProfileId);
    const baseCurrency = profile?.baseCurrency || profile?.currency || 'PHP';
    setCurrencyContext(baseCurrency, profile?.currency || baseCurrency);
  }, [profiles, currentProfileId]);

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === currentProfileId),
    [profiles, currentProfileId],
  );
  // Feedback actions can run after the render that created them (for example,
  // after a profile switch or after the skip mutation has committed). Keep
  // delayed recovery callbacks on the latest profile collection without
  // changing the persisted profile ownership contract.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const cloudProfileRef = useRef(currentProfileId);
  cloudProfileRef.current = currentProfileId;

  const triggerMochiHappy = () => {
    setMochiReactionState('happy');
    if (mochiReactionTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mochiReactionTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      mochiReactionTimerRef.current = window.setTimeout(() => {
        mochiReactionTimerRef.current = null;
        setMochiReactionState('idle');
      }, 1400);
    }
  };

  useEffect(() => () => {
    if (mochiReactionTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mochiReactionTimerRef.current);
    }
  }, []);

  const commitProfiles = (nextProfiles: Profile[], occurredAt = new Date()) => {
    const previousProfiles = profilesRef.current;
    const previousProfilesById = new Map(
      previousProfiles.map(profile => [profile.id, profile]),
    );
    const unlocksByProfile = new Map<string, ReturnType<typeof applyMilestoneTransition>['unlocks']>();
    const committedProfiles = nextProfiles.map(nextProfile => {
      const beforeProfile = previousProfilesById.get(nextProfile.id);
      // Most mutations replace only the active profile. Re-evaluating the
      // complete milestone snapshot for every untouched profile made a
      // single click scale with the number and size of profiles.
      if (!beforeProfile || !isHydrated || beforeProfile === nextProfile) return nextProfile;
      const milestoneStartedAt = startRuntimeTrace('milestone-transition');
      const transition = applyMilestoneTransition(beforeProfile, nextProfile, occurredAt);
      endRuntimeTrace('milestone-transition', milestoneStartedAt);
      if (transition.unlocks.length > 0) unlocksByProfile.set(nextProfile.id, transition.unlocks);
      return transition.profile;
    });

    profilesRef.current = committedProfiles;
    setProfiles(committedProfiles);

    const currentUnlocks = unlocksByProfile.get(currentProfileId) || [];
    if (currentUnlocks.length > 0) {
      triggerMochiHappy();
      publishFeedback({
        actionId: `milestone-unlock:${currentProfileId}:${currentUnlocks.map(item => item.milestoneId).join('|')}`,
        kind: 'achievement',
        title: currentUnlocks.length === 1 ? 'Milestone reached' : `${currentUnlocks.length} milestones reached`,
        description: currentUnlocks
          .map(item => MILESTONE_DEFINITIONS.find(definition => definition.id === item.milestoneId)?.name || item.milestoneId)
          .join(' · '),
      });
    }
  };

  const currentPetValue = currentProfile?.pet;
  const currentPet = useMemo(
    () => normalizePet(currentPetValue),
    [currentPetValue],
  );
  const currentHealth = useMemo(
    () => normalizeHealth(currentProfile?.health),
    [currentProfile?.health],
  );

  const getCurrentProfile = (): Profile | undefined => currentProfile;

  const updateCurrentProfile = (updates: Partial<Profile>) => {
    const nextProfiles = profilesRef.current.map(profile =>
      profile.id === currentProfileId
        ? {
            ...profile,
            ...updates,
            ...(updates.inventoryItems !== undefined
              ? { inventoryItems: normalizeInventoryItems(updates.inventoryItems) }
              : {}),
            ...(updates.wishlistItems !== undefined
              ? { wishlistItems: normalizeWishlistItems(updates.wishlistItems) }
              : {}),
            ...(updates.skincareProducts !== undefined
              ? { skincareProducts: normalizeSkincareProducts(updates.skincareProducts) }
              : {}),
            ...(updates.skincareUsageEvents !== undefined
              ? { skincareUsageEvents: normalizeSkincareUsageEvents(updates.skincareUsageEvents) }
              : {}),
            ...(updates.supplements !== undefined
              ? { supplements: normalizeSupplements(updates.supplements) }
              : {}),
            ...(updates.health !== undefined
              ? { health: normalizeHealth(updates.health) }
              : {}),
            ...(updates.games !== undefined
              ? { games: normalizeGames(updates.games) }
              : {}),
            ...(updates.gameGuides !== undefined
              ? { gameGuides: normalizeGameGuides(updates.gameGuides) }
              : {}),
            ...(updates.musicItems !== undefined
              ? { musicItems: normalizeMusicItems(updates.musicItems) }
              : {}),
            ...(updates.pet !== undefined
              ? { pet: normalizePet(updates.pet) }
              : {}),
          }
        : profile,
    );
    commitProfiles(nextProfiles);
  };

  const applyHealthMutation = (
    profile: Profile,
    health: HealthProfile,
    evidenceEvents: HealthEvidenceEvent[] = [],
  ) => {
    let nextProfile: Profile = {
      ...profile,
      health: normalizeHealth(health),
    };
    const completedRoutineIds: string[] = [];

    for (const event of evidenceEvents) {
      const routineStartedAt = startRuntimeTrace('routine-mutation');
      const result = applyHealthEvidenceToProfile(nextProfile, event, new Date());
      endRuntimeTrace('routine-mutation', routineStartedAt);
      nextProfile = result.profile;
      completedRoutineIds.push(...result.completedRoutineIds);
    }

    const nextProfiles = profilesRef.current.map(item =>
      item.id === profile.id ? nextProfile : item,
    );
    commitProfiles(nextProfiles);

    return { profile: nextProfile, completedRoutineIds };
  };

  const updateHealthProfile = (
    updates: Partial<HealthProfile>,
    evidence?: HealthEvidenceEvent,
  ) => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return;

    const result = applyHealthMutation(
      profile,
      {
        ...normalizeHealth(profile.health),
        ...updates,
      },
      evidence ? [evidence] : [],
    );

    if (evidence && result.completedRoutineIds.length > 0) {
      const label = evidence.kind === 'sleep' ? 'Sleep saved' : 'Food logged';
      const count = result.completedRoutineIds.length;
      publishFeedback({
        actionId: `health-evidence:${evidence.kind}:${toLocalDateKey(new Date())}:${Date.now()}`,
        kind: 'success',
        title: label,
        description: `${count} Life Hub routine${count === 1 ? '' : 's'} completed.`,
      });
    }
  };

  // Existing profiles may legitimately have an empty taxonomy. Seed those
  // profiles only after hydration, outside the normalizer/import boundaries,
  // and only once per profile during this runtime. The functional update is
  // the final guard against a stale render racing another category mutation.
  useEffect(() => {
    if (!isHydrated || !currentProfile?.id) return;

    const profileId = currentProfile.id;
    if (
      (currentProfile.financialCategories || []).length > 0 ||
      starterCategoriesInitializedRef.current.has(profileId)
    ) {
      return;
    }

    starterCategoriesInitializedRef.current.add(profileId);
    setProfiles(current =>
      current.map(profile => {
        if (profile.id !== profileId || (profile.financialCategories || []).length > 0) {
          return profile;
        }

        return seedFinancialCategoriesIfEmpty(profile);
      }),
    );
  }, [currentProfile, isHydrated]);

  const queueRemovedMedia = (
    profile: Profile,
    previousValue: unknown,
    nextValue: unknown,
    reason: 'attachment-detached' | 'record-deleted' | 'section-deleted',
  ) => {
    const before = collectMediaReferenceIds(previousValue);
    const after = collectMediaReferenceIds(nextValue);
    queueMediaCleanup({
      profileId: profile.id,
      assetIds: [...before].filter(assetId => !after.has(assetId)),
      reason,
    });
  };

  const removeFromSource = (
    profile: Profile,
    source: TrashSource,
    itemId: string,
  ): Partial<Profile> => {
    if (source === "productivityItems") {
      return {
        productivityItems: (profile.productivityItems || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "importantDates") {
      return {
        importantDates: (profile.importantDates || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "dailyChecklistItems") {
      return {
        dailyChecklistItems: (profile.dailyChecklistItems || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "musicItems") {
      return {
        musicItems: (profile.musicItems || []).filter(
          item => item.id !== itemId,
        ),
      };
    }

    if (source === "mediaItems") {
      return {
        mediaItems: (profile.mediaItems || []).filter(
          item => item.id !== itemId,
        ),
      };
    }

    if (source === "workItems") {
      const childIds = (profile.workItems || [])
        .filter((item) => item.projectId === itemId)
        .map((item) => item.id);
      return {
        workItems: (profile.workItems || []).filter(
          (item) => item.id !== itemId && !childIds.includes(item.id),
        ),
      };
    }

    if (source === "inventoryItems") {
      return {
        inventoryItems: (profile.inventoryItems || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "skincareProducts") {
      return {
        skincareProducts: (profile.skincareProducts || []).filter(item => item.id !== itemId),
      };
    }

    if (source === "wishlistItems") {
      return {
        wishlistItems: (profile.wishlistItems || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "books") {
      return {
        books: (profile.books || []).filter(
          (item) => item.id !== itemId,
        ),
      };
    }

    if (source === "careerSkills") {
      return {
        careerSkills: (profile.careerSkills || []).filter(item => item.id !== itemId),
        careerCourses: (profile.careerCourses || []).map(item => ({
          ...item,
          relatedSkillIds: item.relatedSkillIds.filter(id => id !== itemId),
        })),
        careerCredentials: (profile.careerCredentials || []).map(item => ({
          ...item,
          relatedSkillIds: item.relatedSkillIds.filter(id => id !== itemId),
        })),
      };
    }

    if (source === "careerCourses") {
      return {
        careerCourses: (profile.careerCourses || []).filter(item => item.id !== itemId),
        careerCredentials: (profile.careerCredentials || []).map(item => ({
          ...item,
          relatedCourseIds: item.relatedCourseIds.filter(id => id !== itemId),
        })),
      };
    }

    if (source === "careerCredentials") {
      return {
        careerCredentials: (profile.careerCredentials || []).filter(item => item.id !== itemId),
      };
    }

    return {
      personalVaultItems: normalizePersonalVaultItems(
        ((profile as any).personalVaultItems || []).filter(
          (item: any) => item.id !== itemId,
        ),
      ),
    } as Partial<Profile>;
  };

  const hasDestinationIdCollision = (
    restoredItems: unknown[],
    existingItems: readonly unknown[],
  ): boolean => {
    const restoredIds = restoredItems
      .map(item => item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined)
      .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));
    const normalizedRestoredIds = restoredIds.map(id => id.trim());
    const existingIds = new Set(
      existingItems
        .map(item => item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined)
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
        .map(id => id.trim()),
    );
    return normalizedRestoredIds.length !== restoredItems.length ||
      new Set(normalizedRestoredIds).size !== normalizedRestoredIds.length ||
      normalizedRestoredIds.some(id => existingIds.has(id));
  };

  const restoreToSource = (
    profile: Profile,
    source: TrashSource,
    data: any,
  ): Partial<Profile> | null => {
    if (source === "productivityItems") {
      const raw = Array.isArray(data) ? data : [data];
      if (!raw.length || hasDestinationIdCollision(raw, profile.productivityItems || [])) return null;
      const restored = raw.map(normalizeProductivityItem);
      if (hasDestinationIdCollision(restored, profile.productivityItems || [])) return null;
      return {
        productivityItems: [...restored, ...(profile.productivityItems || [])],
      };
    }
    if (source === "importantDates") {
      const raw = Array.isArray(data) ? data : [data];
      if (!raw.length || hasDestinationIdCollision(raw, profile.importantDates || [])) return null;
      const restored = raw.map(normalizeImportantDateItem);
      if (hasDestinationIdCollision(restored, profile.importantDates || [])) return null;
      return { importantDates: [...restored, ...(profile.importantDates || [])] };
    }
    if (source === "dailyChecklistItems") {
      const raw = Array.isArray(data) ? data : [data];
      if (!raw.length || hasDestinationIdCollision(raw, profile.dailyChecklistItems || [])) return null;
      const restored = raw.map(normalizeRoutineItem);
      if (hasDestinationIdCollision(restored, profile.dailyChecklistItems || [])) return null;
      return {
        dailyChecklistItems: [...restored, ...(profile.dailyChecklistItems || [])],
      };
    }
    if (source === "musicItems") {
      const restored = normalizeMusicItems(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.musicItems || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      return {
        musicItems: [...restored, ...(profile.musicItems || [])],
      };
    }
    if (source === "mediaItems") {
      const restored = normalizeMediaItem(data);
      const existingIds = new Set((profile.mediaItems || []).map(item => item.id));
      if (!restored.id || existingIds.has(restored.id)) return null;
      return {
        mediaItems: [restored, ...(profile.mediaItems || [])],
      };
    }
    if (source === "workItems") {
      const raw = Array.isArray(data) ? data : [data];
      if (!raw.length || hasDestinationIdCollision(raw, profile.workItems || [])) return null;
      const restored = raw.map(normalizeWorkItem);
      if (hasDestinationIdCollision(restored, profile.workItems || [])) return null;
      return {
        workItems: [...restored, ...((profile as any).workItems || [])],
      } as Partial<Profile>;
    }

    if (source === "inventoryItems") {
      const restored = normalizeInventoryItems(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.inventoryItems || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      return {
        inventoryItems: [...restored, ...(profile.inventoryItems || [])],
      };
    }

    if (source === "skincareProducts") {
      const restored = normalizeSkincareProducts(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.skincareProducts || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      return { skincareProducts: [...restored, ...(profile.skincareProducts || [])] };
    }

    if (source === "wishlistItems") {
      const restored = normalizeWishlistItems(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.wishlistItems || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      return {
        wishlistItems: [...restored, ...(profile.wishlistItems || [])],
      };
    }

    if (source === "books") {
      const restored = normalizeBooks(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.books || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      return {
        books: [...restored, ...(profile.books || [])],
      };
    }

    if (source === "careerSkills") {
      const restored = normalizeCareerSkills(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.careerSkills || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      const normalized = normalizeCareerCollections(
        [...restored, ...(profile.careerSkills || [])],
        profile.careerCourses,
        profile.careerCredentials,
      );
      return {
        careerSkills: normalized.skills,
        careerCourses: normalized.courses,
        careerCredentials: normalized.credentials,
      };
    }

    if (source === "careerCourses") {
      const restored = normalizeCareerCourses(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.careerCourses || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      const normalized = normalizeCareerCollections(
        profile.careerSkills,
        [...restored, ...(profile.careerCourses || [])],
        profile.careerCredentials,
      );
      return {
        careerSkills: normalized.skills,
        careerCourses: normalized.courses,
        careerCredentials: normalized.credentials,
      };
    }

    if (source === "careerCredentials") {
      const restored = normalizeCareerCredentials(Array.isArray(data) ? data : [data]);
      const existingIds = new Set((profile.careerCredentials || []).map(item => item.id));
      if (!restored.length || restored.some(item => existingIds.has(item.id))) return null;
      const normalized = normalizeCareerCollections(
        profile.careerSkills,
        profile.careerCourses,
        [...restored, ...(profile.careerCredentials || [])],
      );
      return {
        careerSkills: normalized.skills,
        careerCourses: normalized.courses,
        careerCredentials: normalized.credentials,
      };
    }

    const restored = Array.isArray(data) ? data : [data];
    const normalized = normalizePersonalVaultItems(restored);
    if (hasDestinationIdCollision(normalized, (profile as any).personalVaultItems || [])) return null;
    return {
      personalVaultItems: normalizePersonalVaultItems([
        ...normalized,
        ...((profile as any).personalVaultItems || []),
      ]),
    } as Partial<Profile>;
  };

  // Personal Vault operations
  const addPersonalVaultItem = (
    item: Omit<PersonalVaultItem, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const newItem = normalizePersonalVaultItems([
      {
        ...item,
        id: item.id || createEntityId("vault"),
        createdAt: new Date(),
      },
    ])[0];
    if (!newItem) return;

    updateCurrentProfile({
      personalVaultItems: normalizePersonalVaultItems([
        newItem,
        ...((profile as any).personalVaultItems || []),
      ]),
    } as Partial<Profile>);
  };

  const updatePersonalVaultItem = (
    id: string,
    updates: Partial<Omit<PersonalVaultItem, "id" | "createdAt">>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      personalVaultItems: normalizePersonalVaultItems(
        (profile.personalVaultItems || []).map((item) =>
          item.id === id
            ? {
                ...item,
                ...updates,
                date: updates.date === undefined ? item.date : updates.date,
                expiryDate:
                  updates.expiryDate === undefined
                    ? item.expiryDate
                    : updates.expiryDate,
              }
            : item,
        ),
      ),
    });
  };

  const addCareerSkill = (
    item: Omit<CareerSkill, 'id' | 'createdAt'> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const id = item.id || createEntityId('career-skill');
    const normalized = normalizeCareerCollections(
      [{ ...item, id, createdAt: new Date() }, ...(profile.careerSkills || [])],
      profile.careerCourses,
      profile.careerCredentials,
    );
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
    return id;
  };

  const updateCareerSkill = (
    id: string,
    updates: Partial<Omit<CareerSkill, 'id' | 'createdAt'>>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const next = (profile.careerSkills || []).map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item,
    );
    const normalized = normalizeCareerCollections(next, profile.careerCourses, profile.careerCredentials);
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
  };

  const deleteCareerSkill = (id: string) => {
    const profile = getCurrentProfile();
    const item = profile?.careerSkills?.find(entry => entry.id === id);
    if (item) moveToTrash('careerSkills', item, 'Career Skills');
  };

  const addCareerCourse = (
    item: Omit<CareerCourse, 'id' | 'createdAt'> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const id = item.id || createEntityId('career-course');
    const normalized = normalizeCareerCollections(
      profile.careerSkills,
      [{ ...item, id, createdAt: new Date() }, ...(profile.careerCourses || [])],
      profile.careerCredentials,
    );
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
    return id;
  };

  const updateCareerCourse = (
    id: string,
    updates: Partial<Omit<CareerCourse, 'id' | 'createdAt'>>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const next = (profile.careerCourses || []).map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item,
    );
    const normalized = normalizeCareerCollections(profile.careerSkills, next, profile.careerCredentials);
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
  };

  const deleteCareerCourse = (id: string) => {
    const profile = getCurrentProfile();
    const item = profile?.careerCourses?.find(entry => entry.id === id);
    if (item) moveToTrash('careerCourses', item, 'Career Courses');
  };

  const addCareerCredential = (
    item: Omit<CareerCredential, 'id' | 'createdAt'> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const id = item.id || createEntityId('career-credential');
    const normalized = normalizeCareerCollections(
      profile.careerSkills,
      profile.careerCourses,
      [{ ...item, id, createdAt: new Date() }, ...(profile.careerCredentials || [])],
    );
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
    return id;
  };

  const updateCareerCredential = (
    id: string,
    updates: Partial<Omit<CareerCredential, 'id' | 'createdAt'>>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const next = (profile.careerCredentials || []).map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item,
    );
    const normalized = normalizeCareerCollections(profile.careerSkills, profile.careerCourses, next);
    updateCurrentProfile({
      careerSkills: normalized.skills,
      careerCourses: normalized.courses,
      careerCredentials: normalized.credentials,
    });
  };

  const deleteCareerCredential = (id: string) => {
    const profile = getCurrentProfile();
    const item = profile?.careerCredentials?.find(entry => entry.id === id);
    if (item) moveToTrash('careerCredentials', item, 'Career Credentials');
  };

  const moveToTrash = (
    source: TrashSource,
    item: any,
    sourceLabel: string = source,
    options?: Pick<TrashItem, 'linkedBookId'> & { additionalUpdates?: Partial<Profile> },
  ) => {
    const profile = getCurrentProfile();
    if (!profile || !item?.id) return;

    const deletedAt = new Date();
    const data =
      source === "workItems" && item.type === "project"
        ? [
            item,
            ...((profile as any).workItems || []).filter(
              (workItem: any) => workItem.projectId === item.id,
            ),
          ]
        : item;
    const trashItem = {
      id: `trash-${Date.now()}-${item.id}`,
      source,
      sourceLabel,
      itemId: item.id,
      title: item.title || item.name || "Deleted item",
      deletedAt,
      deleteAfter: trashDeleteAfter(deletedAt),
      data,
      ...(options?.linkedBookId ? { linkedBookId: options.linkedBookId } : {}),
    };

    updateCurrentProfile({
      ...removeFromSource(profile, source, item.id),
      ...(options?.additionalUpdates || {}),
      trashItems: [trashItem, ...((profile as any).trashItems || [])],
    } as Partial<Profile>);
    publishFeedback({
      actionId: `trash:${trashItem.id}:created`,
      kind: 'success',
      title: `${trashItem.title} moved to Trash`,
      undo: {
        label: 'Undo',
        execute: () => restoreTrashItem(trashItem.id),
      },
    });
  };

  const deletePersonalVaultItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.personalVaultItems || []).find(
      (entry) => entry.id === id,
    );
    if (item) moveToTrash("personalVaultItems", item, "Personal Vault");
  };

  const restoreTrashItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const trashItem = ((profile as any).trashItems || []).find(
      (item: any) => item.id === id,
    );
    if (!trashItem) return;

    let restored: Partial<Profile> | null = null;
    try {
      restored = restoreToSource(profile, trashItem.source, trashItem.data);
    } catch {
      // Keep the original Trash item recoverable for a future repair/import.
    }
    if (!restored) {
      publishFeedback({
        actionId: `trash:${id}:restore-conflict`,
        kind: 'error',
        title: `${trashItem.title} could not be restored`,
        description: 'Its saved data may be invalid or its record ID may already be in use. The record remains in Recently Deleted.',
      });
      return;
    }

    let restoredWithRelationships = restored;
    if (trashItem.source === 'inventoryItems' && trashItem.linkedBookId) {
      const inventoryItem = restored.inventoryItems?.find(item => item.id === trashItem.itemId);
      const book = (profile.books || []).find(item => item.id === trashItem.linkedBookId);
      const conflictingLink = inventoryItem && (profile.books || []).some(item =>
        item.id !== trashItem.linkedBookId && item.linkedInventoryItemId === inventoryItem.id,
      );
      if (
        inventoryItem &&
        book &&
        !conflictingLink &&
        (!book.linkedInventoryItemId || book.linkedInventoryItemId === inventoryItem.id)
      ) {
        restoredWithRelationships = {
          ...restored,
          books: (profile.books || []).map(item =>
            item.id === book.id ? { ...item, linkedInventoryItemId: inventoryItem.id } : item,
          ),
        };
      }
    }

    updateCurrentProfile({
      ...restoredWithRelationships,
      trashItems: ((profile as any).trashItems || []).filter(
        (item: any) => item.id !== id,
      ),
    } as Partial<Profile>);
    publishFeedback({
      actionId: `trash:${id}:restored`,
      kind: 'success',
      title: `${trashItem.title} restored`,
    });
  };

  const deleteTrashItemPermanently = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const trashItem = ((profile as any).trashItems || []).find(
      (item: any) => item.id === id,
    );
    if (!trashItem) return;
    queueTrashMediaCleanup(profile.id, trashItem);

    const workItemIds = new Set<string>(
      trashItem.source === 'workItems'
        ? getWorkItemIdsFromTrashData(trashItem.data)
        : [],
    );

    updateCurrentProfile({
      ...(workItemIds.size > 0
        ? {
            dailyChecklistItems: clearWorkLinksFromRoutines(
              profile.dailyChecklistItems || [],
              workItemIds,
            ),
            productivityItems: clearWorkLinksFromTasks(
              profile.productivityItems || [],
              workItemIds,
            ),
          }
        : {}),
      trashItems: ((profile as any).trashItems || []).filter(
        (item: any) => item.id !== id,
      ),
    } as Partial<Profile>);
  };

  const deleteTrashItemsPermanently = (ids: string[]) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const idSet = new Set(ids);
    const items = ((profile as any).trashItems || []).filter(
      (item: any) => idSet.has(item.id),
    );
    if (!items.length) return;
    items.forEach((item: TrashItem) => queueTrashMediaCleanup(profile.id, item));
    const workItemIds = new Set<string>(
      items.flatMap(item =>
        item.source === 'workItems'
          ? getWorkItemIdsFromTrashData(item.data)
          : [],
      ),
    );
    updateCurrentProfile({
      ...(workItemIds.size > 0
        ? {
            dailyChecklistItems: clearWorkLinksFromRoutines(
              profile.dailyChecklistItems || [],
              workItemIds,
            ),
            productivityItems: clearWorkLinksFromTasks(
              profile.productivityItems || [],
              workItemIds,
            ),
          }
        : {}),
      trashItems: ((profile as any).trashItems || []).filter(
        (item: any) => !idSet.has(item.id),
      ),
    } as Partial<Profile>);
  };

  // Profile operations
  const addProfile = (
    profileData: Omit<
      Profile,
      | "id"
      | "createdAt"
      | "wallets"
      | "transactions"
      | "inventoryItems"
      | "wishlistItems"
      | "upcomingMoneyItems"
      | "journalEntries"
      | "games"
      | "gameGuides"
      | "productivityItems"
      | "mediaItems"
      | "books"
      | "musicItems"
      | "workItems"
      | "personalVaultItems"
      | "careerSkills"
      | "careerCourses"
      | "careerCredentials"
      | "personalVaultTaxonomy"
      | "moduleTaxonomies"
      | "trashItems"
      | "skincareProducts"
      | "skincareUsageEvents"
      | "dailyChecklistItems"
      | "importantDates"
      | "supplements"
      | "health"
      | "budgets"
    >,
  ) => {
    assertRealWorkspace();
    const newProfile: Profile = {
      ...profileData,
      id: "profile-" + Date.now().toString(),
      baseCurrency:
        profileData.baseCurrency || profileData.currency || "PHP",
      currency:
        profileData.currency || profileData.baseCurrency || "PHP",
      wallets: [],
      transactions: [],
      inventoryItems: [],
      wishlistItems: [],
      upcomingMoneyItems: [],
      journalEntries: [],
      games: [],
      gameGuides: [],
      productivityItems: [],
      mediaItems: [],
      books: [],
      musicItems: [],
      workItems: [],
      personalVaultItems: [],
      careerSkills: [],
      careerCourses: [],
      careerCredentials: [],
      personalVaultTaxonomy: [],
      moduleTaxonomies: {},
      trashItems: [],
      skincareProducts: [],
      skincareUsageEvents: [],
      dailyChecklistItems: [],
      importantDates: [],
      supplements: [],
      balanceProjectionRows: [],
      budgets: [],
      balanceProjectionIncludeAllWallets: false,
      financialCategories: createDefaultFinancialCategories(),
      balanceCheckIns: [],
      achievementUnlocks: [],
      milestoneUnlocks: [],
      achievementMigrationVersion: 2,
      masteryMilestones: [],
      categoryXpEvents: [],
      masteryBondXpEvents: [],
      masteryBondClaims: [],
      masteryCompanionPreferences: {},
      activeMasteryCompanion: undefined,
      feedbackPreferences: normalizeFeedbackPreferences(undefined),

      health: normalizeHealth(),

      createdAt: new Date(),
    };
    // ProfileModal immediately applies avatar/name updates before React renders.
    // Publish the new profile to the shared ref as well as React state so that
    // follow-up updates cannot replace it with the previous profile collection.
    commitProfiles([...profilesRef.current, newProfile]);
    setCurrentProfileId(newProfile.id);
    publishFeedback({
      actionId: `profile:${newProfile.id}:created`,
      kind: 'success',
      title: 'Profile created',
      description: newProfile.name,
    });
    return newProfile.id;
  };

  const deleteProfile = async (id: string) => {
    assertRealWorkspace();
    if (profiles.length <= 1 || !profiles.some(profile => profile.id === id)) {
      return;
    }

    const fallbackProfile = profiles.find(profile => profile.id !== id);
    persistence.markProfileForCleanup(id);
    setProfiles(current => {
      if (current.length <= 1) return current;
      return current.filter(profile => profile.id !== id);
    });
    setCurrentProfileId(activeId =>
      activeId === id ? fallbackProfile?.id || activeId : activeId,
    );

    // Profile state and managed media are stored separately, so media cleanup
    // runs after the confirmed profile deletion is durably committed by the
    // persistence controller. Cloud snapshots are intentionally left intact as
    // a recoverable backup until the user explicitly manages them from Cloud
    // Backup. The durable marker is written before the state update so a
    // persistence failure can be retried safely; the cleanup worker refuses to
    // touch media while the profile still exists in persisted state.
    queueProfileMediaCleanup(id);
  };

  const clearWorkspaceState = async () => {
    assertRealWorkspace();
    const currentSnapshot = { profiles, currentProfileId };
    const emptySnapshot = await persistence.clearWorkspace(currentSnapshot);
    setProfiles(emptySnapshot.profiles);
    setCurrentProfileId(emptySnapshot.currentProfileId);
  };
  const beginDemoTransition = () =>
    persistence.beginExternalReplace({ profiles: profilesRef.current, currentProfileId });
  const prepareCloudBackup = async () => {
    assertRealWorkspace();
    const resume = await persistence.beginExternalReplace({ profiles: profilesRef.current, currentProfileId });
    resume();
  };
  const beginCloudRestore = async () => {
    assertRealWorkspace();
    const snapshot = { profiles: profilesRef.current, currentProfileId };
    const resume = await persistence.beginExternalReplace(snapshot);
    // After a failed external write, stale React data must only resume when
    // the repository is known to contain the same pre-restore workspace.
    let before: Awaited<ReturnType<typeof loadCloudWorkspace>>;
    try {
      before = await loadCloudWorkspace();
      if (!before) throw new Error('The latest local workspace could not be verified.');
    }
    catch (error) { resume(); throw error; }
    const assertBeforeReplace = () => {
      assertRealWorkspace();
      if (profilesRef.current !== snapshot.profiles || cloudProfileRef.current !== snapshot.currentProfileId) {
        throw new Error('The local workspace changed while restore was preparing. Review the backup again.');
      }
    };
    return {
      beforeReplace: async () => assertBeforeReplace(),
      assertBeforeReplace,
      resumeAfterFailure: async () => {
        const after = await loadCloudWorkspace().catch(() => null);
        if (!before || !after || JSON.stringify(before) !== JSON.stringify(after)) return false;
        resume();
        return true;
      },
    };
  };

  const switchProfile = (id: string) => {
    assertRealWorkspace();
    if (profiles.find((p) => p.id === id)) {
      const profile = profiles.find((p) => p.id === id);
      const baseCurrency = profile?.baseCurrency || profile?.currency || 'PHP';
      setCurrencyContext(baseCurrency, profile?.currency || baseCurrency);
      setCurrentProfileId(id);
    }
  };
  const updateProfile = (id: string, updates: Partial<Profile>) => {
    const nextProfiles = profilesRef.current.map(profile =>
      profile.id === id
        ? {
            ...profile,
            ...updates,
            ...(updates.health !== undefined
              ? { health: normalizeHealth(updates.health) }
              : {}),
            ...(updates.pet !== undefined
              ? { pet: normalizePet(updates.pet) }
              : {}),
            ...(updates.moduleTaxonomies !== undefined
              ? { moduleTaxonomies: normalizeModuleTaxonomies(updates.moduleTaxonomies) }
              : {}),
            ...(updates.workTypes !== undefined
              ? { workTypes: normalizeWorkTypeDefinitions(updates.workTypes) }
              : {}),
          }
        : profile,
    );
    if (id === currentProfileId) {
      const nextProfile = nextProfiles.find(profile => profile.id === id);
      const baseCurrency =
        nextProfile?.baseCurrency || nextProfile?.currency || 'PHP';
      setCurrencyContext(baseCurrency, nextProfile?.currency || baseCurrency);
    }
    commitProfiles(nextProfiles);
  };

  const saveWorkSetupForProfile = (
    profileId: string,
    workTypes: WorkTypeDefinition[],
    categories: ModuleTaxonomyCategory[],
  ): 'applied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === profileId);
    if (!profile || currentProfileId !== profileId) return 'rejected';

    const normalizedCategories = normalizeModuleTaxonomies({
      ...(profile.moduleTaxonomies || {}),
      work: categories,
    });
    const categoryNames = new Map(
      (normalizedCategories.work || []).map(category => [category.id, category.name] as const),
    );
    const withCurrentCategoryLabel = (item: WorkItem): WorkItem => {
      const currentName = item.workCategoryId
        ? categoryNames.get(item.workCategoryId)
        : undefined;
      return currentName ? { ...item, workCategoryLabel: currentName } : item;
    };
    const normalizeTrashData = (data: unknown): unknown => {
      if (Array.isArray(data)) return data.map(item =>
        item && typeof item === 'object'
          ? withCurrentCategoryLabel(item as WorkItem)
          : item,
      );
      return data && typeof data === 'object'
        ? withCurrentCategoryLabel(data as WorkItem)
        : data;
    };

    const nextProfile: Profile = {
      ...profile,
      workTypes: normalizeWorkTypeDefinitions(workTypes),
      moduleTaxonomies: normalizedCategories,
      workItems: (profile.workItems || []).map(withCurrentCategoryLabel),
      trashItems: (profile.trashItems || []).map(item =>
        item.source === 'workItems'
          ? { ...item, data: normalizeTrashData(item.data) }
          : item,
      ),
    };
    commitProfiles(profilesRef.current.map(item =>
      item.id === profileId ? nextProfile : item,
    ));
    return 'applied';
  };
  // Wallet operations
  const addWallet = (wallet: Omit<Wallet, "id" | "createdAt">): string | undefined => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return undefined;
    const id = createEntityId("wallet");
    const newWallet: Wallet = {
      ...wallet,
      balance: toNumber(wallet.balance),
      goalTarget:
        wallet.goalTarget === undefined
          ? undefined
          : Math.max(0, toNumber(wallet.goalTarget)),
      type: wallet.type || "free_spending",
      useForWishlist:
        wallet.useForWishlist !== undefined
          ? wallet.useForWishlist
          : wallet.type === "free_spending" || wallet.type === "cash_on_hand",

      includeInSpendable:
        wallet.includeInSpendable !== undefined
          ? wallet.includeInSpendable
          : wallet.type === "free_spending" || wallet.type === "cash_on_hand",

      isProtected:
        wallet.isProtected !== undefined
          ? wallet.isProtected
          : wallet.type === "savings" || wallet.type === "investment",

      purpose:
        wallet.purpose ||
        (wallet.type === "free_spending"
          ? "Free Spending"
          : wallet.type === "cash_on_hand"
            ? "Cash"
            : wallet.type === "savings"
              ? "Emergency Fund"
              : "Investment"),

      id,
      createdAt: new Date(),
    };
    const nextProfiles = profilesRef.current.map(item =>
      item.id === currentProfileId
        ? { ...item, wallets: [...item.wallets, newWallet] }
        : item,
    );
    commitProfiles(nextProfiles, newWallet.createdAt);
    return id;
  };

  const addTransaction = (
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const id = transaction.id || createEntityId('transaction');
    const normalized = normalizeTransaction({
      ...transaction,
      id,
      createdAt: transaction.createdAt || new Date(),
      updatedAt: transaction.updatedAt || new Date(),
    }, id);
    if (transactionValidationError(normalized, profile.wallets)) return undefined;
    if (
      normalized.sourceKey &&
      (profile.transactions || []).some(item => item.sourceKey === normalized.sourceKey)
    ) {
      return undefined;
    }

    updateCurrentProfile({
      wallets: applyTransactionToWallets(profile.wallets, normalized),
      transactions: [...(profile.transactions || []), normalized],
    });
    return id;
  };

  const recordRecurringOccurrence = (
    rowId: string,
    overrides: RecurringOccurrenceOverrides = {},
  ): RecurringActionResult => {
    const profile = getCurrentProfile();
    const row = profile?.balanceProjectionRows?.find(item => item.id === rowId);
    if (!profile || !row?.recurrence) return { ok: false, error: 'Recurring item not found.' };

    const state = getRecurringOccurrenceState(row);
    if (state === 'paused') return { ok: false, error: 'Resume this recurring item before recording it.' };
    if (state === 'ended') return { ok: false, error: 'This recurring item has ended.' };

    const scheduledDateKey = row.recurrence.nextDueDateKey;
    const sourceKey = `recurring:${row.id}:${scheduledDateKey}`;
    const existing = (profile.transactions || []).find(item => item.sourceKey === sourceKey);
    if (existing) {
      const nextRow = advanceRecurringProjectionRow(row);
      updateCurrentProfile({
        balanceProjectionRows: (profile.balanceProjectionRows || []).map(item =>
          item.id === row.id ? nextRow : item,
        ),
      });
      return { ok: true, transactionId: existing.id, scheduledDateKey };
    }

    const hasOverride = <K extends keyof RecurringOccurrenceOverrides>(key: K) =>
      Object.prototype.hasOwnProperty.call(overrides, key);
    const dateKey = hasOverride('dateKey') ? overrides.dateKey || '' : scheduledDateKey;
    const date = parseLocalDateKey(dateKey);
    if (!date) return { ok: false, error: 'Choose a valid occurrence date.' };

    const walletId = hasOverride('walletId') ? overrides.walletId || '' : row.recurrence.walletId;
    const categoryId = hasOverride('categoryId') ? overrides.categoryId : row.recurrence.categoryId;
    const subcategoryId = hasOverride('subcategoryId') ? overrides.subcategoryId : row.recurrence.subcategoryId;
    const category = profile.financialCategories?.find(item => item.id === categoryId);
    const validCategoryId = category ? category.id : undefined;
    const validSubcategoryId = validCategoryId && subcategoryId &&
      category?.subcategories.some(item => item.id === subcategoryId)
      ? subcategoryId
      : undefined;
    const transactionId = createEntityId('transaction');
    const normalized = normalizeTransaction({
      id: transactionId,
      type: row.type,
      amount: overrides.amount === undefined ? toNumber(row.amount) : overrides.amount,
      walletId,
      categoryId: validCategoryId,
      subcategoryId: validSubcategoryId,
      date,
      payee: hasOverride('payee') ? overrides.payee : row.recurrence.payee,
      notes: hasOverride('notes') ? overrides.notes : row.recurrence.notes,
      source: 'recurring-transaction',
      sourceKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, transactionId);
    const validationError = transactionValidationError(normalized, profile.wallets);
    if (validationError) return { ok: false, error: validationError };

    const nextRow = advanceRecurringProjectionRow(row);
    updateCurrentProfile({
      wallets: applyTransactionToWallets(profile.wallets, normalized),
      transactions: [...(profile.transactions || []), normalized],
      balanceProjectionRows: (profile.balanceProjectionRows || []).map(item =>
        item.id === row.id ? nextRow : item,
      ),
    });
    return { ok: true, transactionId, scheduledDateKey };
  };

  const resolveRecurringOccurrence = (
    rowId: string,
    action: 'skip' | 'already-recorded',
  ): RecurringActionResult => {
    const advancesWithoutTransaction = action === 'skip' || action === 'already-recorded';
    if (!advancesWithoutTransaction) return { ok: false, error: 'Choose how to resolve the occurrence.' };
    const profile = getCurrentProfile();
    const row = profile?.balanceProjectionRows?.find(item => item.id === rowId);
    if (!profile || !row?.recurrence) return { ok: false, error: 'Recurring item not found.' };
    const state = getRecurringOccurrenceState(row);
    if (state === 'paused') return { ok: false, error: 'Resume this recurring item first.' };
    if (state === 'ended') return { ok: false, error: 'This recurring item has ended.' };
    const scheduledDateKey = row.recurrence.nextDueDateKey;
    const nextRow = advanceRecurringProjectionRow(row);
    updateCurrentProfile({
      balanceProjectionRows: (profile.balanceProjectionRows || []).map(item =>
        item.id === row.id ? nextRow : item,
      ),
    });
    return { ok: true, scheduledDateKey };
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>): boolean => {
    const profile = getCurrentProfile();
    const existing = profile?.transactions?.find(item => item.id === id);
    if (!profile || !existing) return false;

    const next = normalizeTransaction({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    }, existing.id);
    if (transactionValidationError(next, profile.wallets)) return false;
    if (
      next.sourceKey &&
      (profile.transactions || []).some(item => item.id !== id && item.sourceKey === next.sourceKey)
    ) {
      return false;
    }

    const restoredWallets = applyTransactionToWallets(profile.wallets, existing, -1);
    updateCurrentProfile({
      wallets: applyTransactionToWallets(restoredWallets, next),
      transactions: (profile.transactions || []).map(item => item.id === id ? next : item),
    });
    return true;
  };

  const updateTransactionReportingStatus = (ids: string[], excluded: boolean): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;
    const idSet = new Set(ids.filter(Boolean));
    const eligible = (profile.transactions || []).filter(transaction =>
      idSet.has(transaction.id) &&
      (transaction.type === 'income' || transaction.type === 'expense') &&
      transaction.excludeFromReports !== excluded,
    );
    if (!eligible.length) return 0;
    const eligibleIds = new Set(eligible.map(transaction => transaction.id));
    updateCurrentProfile({
      transactions: (profile.transactions || []).map(transaction =>
        eligibleIds.has(transaction.id)
          ? { ...transaction, excludeFromReports: excluded, updatedAt: new Date() }
          : transaction,
      ),
    });
    return eligible.length;
  };

  const connectTransactionWallet = (id: string, walletId: string): boolean => {
    const profile = getCurrentProfile();
    if (!profile || !profile.wallets.some(wallet => wallet.id === walletId)) return false;
    const existing = profile.transactions?.find(item => item.id === id);
    if (!existing) return false;
    const connected = connectUnlinkedTransactionWallet(existing, walletId);
    if (!connected) return false;

    updateCurrentProfile({
      transactions: (profile.transactions || []).map(item => item.id === id ? connected : item),
    });
    return true;
  };

  const deleteTransaction = (id: string): boolean => {
    return deleteTransactions([id]) > 0;
  };

  const deleteTransactions = (ids: string[]): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;
    const idSet = new Set(ids.filter(Boolean));
    const selected = (profile.transactions || []).filter(item => idSet.has(item.id));
    if (!selected.length) return 0;

    updateCurrentProfile({
      wallets: applyWalletDeltas(
        profile.wallets,
        aggregateTransactionWalletDeltas(selected),
        -1,
      ),
      transactions: (profile.transactions || []).filter(item => !idSet.has(item.id)),
    });
    return selected.length;
  };

  const clearTransactions = (): number => {
    const profile = getCurrentProfile();
    if (!profile || profile.transactions.length === 0) return 0;
    const nextProfile = clearTransactionHistory(profile);
    updateCurrentProfile({ transactions: nextProfile.transactions });
    return profile.transactions.length;
  };

  const recordWalletAdjustment = (
    walletId: string,
    targetBalance: number,
    details: Partial<Pick<Transaction, 'date' | 'notes' | 'source' | 'sourceKey'>> = {},
  ): string | undefined => {
    const profile = getCurrentProfile();
    const wallet = profile?.wallets.find(item => item.id === walletId);
    if (!profile || !wallet) return undefined;
    const delta = toNumber(targetBalance) - toNumber(wallet.balance);
    if (delta === 0) return undefined;
    return addTransaction(createAdjustmentTransaction(walletId, delta, details));
  };

  const reconcileWalletBalances = (
    balances: Record<string, number>,
    details: {
      date?: Date;
      notes?: string;
      source?: string;
      sourceKeyPrefix?: string;
      expectedWalletBalances?: Record<string, number>;
    } = {},
  ): boolean => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return false;
    const submittedWalletIds = Object.keys(balances);
    if (
      submittedWalletIds.length !== profile.wallets.length ||
      profile.wallets.some(wallet => !Number.isFinite(balances[wallet.id])) ||
      submittedWalletIds.some(walletId => !profile.wallets.some(wallet => wallet.id === walletId))
    ) {
      return false;
    }
    if (details.expectedWalletBalances && !walletBalancesMatchOpening(profile.wallets, details.expectedWalletBalances)) {
      return false;
    }

    let nextWallets = profile.wallets;
    const nextTransactions = [...(profile.transactions || [])];
    for (const wallet of profile.wallets) {
      const target = balances[wallet.id];
      if (!Number.isFinite(target)) continue;
      const delta = toNumber(target) - toNumber(wallet.balance);
      if (delta === 0) continue;
      const adjustment = createAdjustmentTransaction(wallet.id, delta, {
        date: details.date,
        notes: details.notes,
        source: details.source,
        sourceKey: details.sourceKeyPrefix
          ? `${details.sourceKeyPrefix}:${wallet.id}`
          : undefined,
      });
      nextWallets = applyTransactionToWallets(nextWallets, adjustment);
      nextTransactions.push(adjustment);
    }
    if (nextTransactions.length === (profile.transactions || []).length) return true;
    updateCurrentProfile({ wallets: nextWallets, transactions: nextTransactions });
    return true;
  };

  const updateWallet = (id: string, updates: Partial<Wallet>): boolean => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return false;
    const wallet = profile.wallets.find(item => item.id === id);
    if (!wallet) return false;
    const { balance, ...metadataUpdates } = updates;
    const normalizedUpdates: Partial<Wallet> = {
      ...metadataUpdates,
      ...(metadataUpdates.goalTarget === undefined
        ? {}
        : { goalTarget: Math.max(0, toNumber(metadataUpdates.goalTarget)) }),
    };
    const adjustment = balance === undefined
      ? null
      : createAdjustmentTransaction(
          id,
          toNumber(balance) - toNumber(wallet.balance),
          { notes: 'Manual wallet balance adjustment', source: 'wallet-edit' },
        );
    updateCurrentProfile({
      wallets: profile.wallets.map((w) =>
        w.id === id
          ? {
              ...w,
              ...normalizedUpdates,
              ...(adjustment ? { balance: applyTransactionToWallets([w], adjustment)[0].balance } : {}),
            }
          : w,
      ),
      ...(adjustment && adjustment.amount > 0
        ? { transactions: [...(profile.transactions || []), adjustment] }
        : {}),
    });
    return true;
  };

  const deleteWallet = (id: string): boolean => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return false;
    const wallet = profile.wallets.find(item => item.id === id);
    if (!wallet) return false;
    if ((profile.transactions || []).some(item => item.walletId === id || item.destinationWalletId === id)) {
      return false;
    }
    if ((profile.balanceProjectionRows || []).some(item => item.recurrence?.walletId === id)) {
      return false;
    }
    updateCurrentProfile({
      wallets: profile.wallets.filter((w) => w.id !== id),
    });
    if (wallet.avatarAssetId) {
      scheduleMediaCleanup({ profileId: profile.id, assetIds: [wallet.avatarAssetId], reason: 'record-deleted' });
    }
    return true;
  };

  const getTotalWalletBalance = (): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;
    return sumMoney(profile.wallets.map(wallet => toNumber(wallet.balance)));
  };

  // Upcoming Money operations
  const addUpcomingMoneyItem = (
    item: Omit<UpcomingMoneyItem, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const id = item.id || createEntityId("money");
    const newItem = normalizeUpcomingMoneyItem({
      ...item,
      id,
      title: item.title,
      direction: item.direction,
      createdAt: item.createdAt || new Date(),
      updatedAt: item.updatedAt || new Date(),
    });

    updateCurrentProfile({
      upcomingMoneyItems: [...(profile.upcomingMoneyItems || []), newItem],
    });

    return id;
  };

  const updateUpcomingMoneyItem = (
    id: string,
    updates: Partial<UpcomingMoneyItem>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      upcomingMoneyItems: (profile.upcomingMoneyItems || []).map((item) =>
        item.id === id
          ? normalizeUpcomingMoneyItem({
              ...item,
              ...updates,
              id: item.id,
              title: updates.title ?? item.title,
              direction: updates.direction ?? item.direction,
              updatedAt: updates.updatedAt || new Date(),
            })
          : item,
      ),
    });
  };

  const deleteUpcomingMoneyItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const linkedRoutineItems = profile.dailyChecklistItems || [];
    const linkedTaskItems = profile.productivityItems || [];
    const linkedCount = linkedRoutineItems.filter(item => getUpcomingMoneyIdFromLifeHubRecord(item) === id).length +
      linkedTaskItems.filter(item => getUpcomingMoneyIdFromLifeHubRecord(item) === id).length;

    updateCurrentProfile({
      upcomingMoneyItems: (profile.upcomingMoneyItems || []).filter(
        (item) => item.id !== id,
      ),
      dailyChecklistItems: clearUpcomingMoneyLinksFromRoutines(linkedRoutineItems, id),
      productivityItems: clearUpcomingMoneyLinksFromTasks(linkedTaskItems, id),
    });
    if (linkedCount > 0) {
      publishFeedback({
        actionId: `balance:${id}:links-cleared:${Date.now()}`,
        kind: 'success',
        title: 'Upcoming Money item deleted',
        description: `${linkedCount} Life Hub link${linkedCount === 1 ? '' : 's'} cleared. Life Hub history was preserved.`,
      });
    }
  };

  // Inventory operations
  const addInventoryItem = (
    item: Omit<InventoryItem, "id" | "createdAt"> & { id?: string },
  ) => {
    const newItem = normalizeInventoryItem({
      ...item,
      productLink: item.productLink || "",
      id: item.id || createEntityId("inv"),
      createdAt: new Date(),
      currentValueUpdatedAt:
        getInventoryCurrentValueIfKnown(item) !== null
          ? new Date()
          : undefined,
    });

    const nextProfiles = profilesRef.current.map(profile =>
      profile.id === currentProfileId
        ? {
            ...profile,
            inventoryItems: [...(profile.inventoryItems || []), newItem],
          }
        : profile,
    );
    commitProfiles(nextProfiles, newItem.createdAt);
    return newItem;
  };
  const updateInventoryItem = (id: string, updates: Partial<InventoryItem>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentValueWasSubmitted = Object.prototype.hasOwnProperty.call(updates, 'purchasePrice');
    const existingItem = profile.inventoryItems.find(item => item.id === id);
    const currentValueBefore = existingItem ? getInventoryCurrentValueIfKnown(existingItem) : null;
    const currentValueAfter = getInventoryCurrentValueIfKnown({ purchasePrice: updates.purchasePrice });
    const currentValueChanged = currentValueWasSubmitted && (
      currentValueAfter !== currentValueBefore || currentValueAfter === null
    );
    const nextItems = profile.inventoryItems.map((item) =>
      item.id === id
        ? normalizeInventoryItem({
            ...item,
            ...updates,
            productLink:
              updates.productLink !== undefined
                ? updates.productLink
                : item.productLink,
            currentValueUpdatedAt:
              currentValueChanged
                ? currentValueAfter === null ? undefined : new Date()
                : item.currentValueUpdatedAt,
          })
        : item,
    );
    queueRemovedMedia(profile, profile.inventoryItems, nextItems, 'attachment-detached');
    updateCurrentProfile({
      inventoryItems: nextItems,
    });
  };

  const renameInventoryCategoryRecords = (from: string, to: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const fromKey = normalizeInventoryCategoryKey(from);
    updateCurrentProfile({
      inventoryItems: profile.inventoryItems.map(item =>
        normalizeInventoryCategoryKey(item.category) === fromKey
          ? { ...item, category: to as InventoryItem['category'] }
          : item,
      ),
    });
  };

  const renameInventorySubcategoryRecords = (category: string, from: string, to: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const categoryKey = normalizeInventoryCategoryKey(category);
    const fromKey = from.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    updateCurrentProfile({
      inventoryItems: profile.inventoryItems.map(item =>
        normalizeInventoryCategoryKey(item.category) === categoryKey &&
        (item.subCategory || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === fromKey
          ? { ...item, subCategory: to }
          : item,
      ),
    });
  };

  const deleteInventoryItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = profile.inventoryItems.find((entry) => entry.id === id);
    if (!item) return;
    // The Book <-> Inventory link lives only on the Book record. Break it
    // here so the Book survives with no dangling reference to a trashed item.
    const linkedBook = (profile.books || []).find(book => book.linkedInventoryItemId === id);
    moveToTrash("inventoryItems", item, "Inventory", linkedBook
      ? {
          linkedBookId: linkedBook.id,
          additionalUpdates: {
            books: (profile.books || []).map(book =>
              book.id === linkedBook.id ? { ...book, linkedInventoryItemId: undefined } : book,
            ),
          },
        }
      : undefined);
  };

  const getTotalInventoryValue = (): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;
    return profile.inventoryItems.reduce((sum, item) => {
      if (item.status === 'archived') return sum;
      const unitValue = getInventoryCurrentValueIfKnown(item);
      if (unitValue === null) return sum;
      return sum + unitValue * getInventoryQuantity(item);
    }, 0);
  };

  const getTotalAssets = (): number => {
    return getTotalWalletBalance() + getTotalInventoryValue();
  };

  // Wishlist operations - Planning System
  const addWishlistItem = (
    item: Omit<WishlistItem, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const newItem = normalizeWishlistRecord({
      ...item,
      id: item.id || createEntityId("wish"),
      createdAt: new Date(),
    });
    updateCurrentProfile({
      wishlistItems: [...profile.wishlistItems, newItem],
    });
  };

  const updateWishlistItem = (id: string, updates: Partial<WishlistItem>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const nextItems = normalizeWishlistItems(profile.wishlistItems.map((item) =>
      item.id === id ? { ...item, ...updates } : item,
    ));
    queueRemovedMedia(profile, profile.wishlistItems, nextItems, 'attachment-detached');
    updateCurrentProfile({ wishlistItems: nextItems });
  };

  const renameWishlistCategoryRecords = (from: string, to: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const fromKey = from.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    updateCurrentProfile({
      wishlistItems: normalizeWishlistItems(profile.wishlistItems.map(item =>
        (item.category || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === fromKey
          ? { ...item, category: to }
          : item,
      )),
    });
  };

  const deleteWishlistItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = profile.wishlistItems.find((entry) => entry.id === id);
    if (item) moveToTrash("wishlistItems", item, "Wishlist");
  };

  const getTotalSelectedWishlistCost = (): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;

    return profile.wishlistItems
      .filter((item) => item.selected)
      .reduce((sum, item) => {
        return sum + Math.max(0, optionalFiniteCollectionNumber(item.estimatedPrice) ?? 0);
      }, 0);
  };

  const getWishlistWalletBalance = (): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;

    return profile.wallets
      .filter((wallet) => wallet.useForWishlist)
      .reduce((sum, wallet) => sumMoney([sum, toNumber(wallet.balance)]), 0);
  };

  // Remaining wishlist budget uses only wallets enabled for Wishlist.
  const getRemainingBalance = (): number => {
    return getWishlistWalletBalance() - getTotalSelectedWishlistCost();
  };

  // Journal operations
  const addJournalEntry = (
    entry: Omit<JournalEntry, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const newEntry: JournalEntry = {
      ...entry,
      id: entry.id || createEntityId("journal"),
      createdAt: new Date(),
      date: normalizeDateValue(entry.date) || new Date(),
    };
    const journalEvidenceStartedAt = startRuntimeTrace('journal-evidence-scan');
    const evidence = applyJournalEvidenceToProfile(
      { ...profile, journalEntries: [...profile.journalEntries, newEntry] },
      newEntry,
      new Date(),
    );
    endRuntimeTrace('journal-evidence-scan', journalEvidenceStartedAt);
    const nextProfiles = profilesRef.current.map(item =>
      item.id === profile.id ? evidence.profile : item,
    );
    commitProfiles(nextProfiles);
    if (hasMeaningfulJournalEntry(newEntry) || newEntry.title?.trim()) {
      publishFeedback({
        actionId: `journal:${newEntry.id}:saved`,
        kind: 'success',
        title: 'Journal entry saved',
        description: evidence.completedRoutineIds.length
          ? `${evidence.completedRoutineIds.length} Journal routine${evidence.completedRoutineIds.length === 1 ? '' : 's'} completed.`
          : undefined,
      });
    } else {
      publishFeedback({
        actionId: `journal:${newEntry.id}:saved`,
        kind: 'success',
        title: 'Journal entry saved',
      });
    }
  };

  const updateJournalEntry = (id: string, updates: Partial<JournalEntry>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const nextEntries = profile.journalEntries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            ...updates,
            date:
              updates.date === undefined
                ? entry.date
                : normalizeDateValue(updates.date) || entry.date,
          }
        : entry,
    );
    queueRemovedMedia(profile, profile.journalEntries, nextEntries, 'attachment-detached');
    const savedEntry = nextEntries.find(entry => entry.id === id);
    const journalEvidenceStartedAt = startRuntimeTrace('journal-evidence-scan');
    const evidence = savedEntry
      ? applyJournalEvidenceToProfile(
          { ...profile, journalEntries: nextEntries },
          savedEntry,
          new Date(),
        )
      : { profile: { ...profile, journalEntries: nextEntries }, completedRoutineIds: [] };
    endRuntimeTrace('journal-evidence-scan', journalEvidenceStartedAt);
    const nextProfiles = profilesRef.current.map(item =>
      item.id === profile.id ? evidence.profile : item,
    );
    commitProfiles(nextProfiles);
    if (evidence.completedRoutineIds.length) {
      publishFeedback({
        actionId: `journal:${id}:routine-evidence:${Date.now()}`,
        kind: 'success',
        title: 'Journal entry updated',
        description: `${evidence.completedRoutineIds.length} Journal routine${evidence.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
  };

  const deleteJournalEntry = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const nextEntries = profile.journalEntries.filter((entry) => entry.id !== id);
    queueRemovedMedia(profile, profile.journalEntries, nextEntries, 'record-deleted');
    updateCurrentProfile({
      journalEntries: nextEntries,
    });
  };

  const getJournalEntryByDate = (date: Date): JournalEntry | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    // Local, not UTC: in UTC+08:00 a journal entry written before 08:00 local
    // has a previous-day UTC date, so UTC bucketing looked up the wrong day.
    const targetDate = toLocalDateKey(date);
    return profile.journalEntries
      .filter((e) => toLocalDateKey(e.date) === targetDate)
      .sort((a, b) => {
        const timeDifference = new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime();
        return timeDifference || String(b.id).localeCompare(String(a.id));
      })[0];
  };

  // Games operations
  const addGame = (game: Omit<Game, "id" | "createdAt">) => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const newGame: Game = normalizeGameRecord({
      ...game,
      id: createEntityId("game"),
      createdAt: new Date(),
    });
    updateCurrentProfile({
      games: [...profile.games, newGame],
    });
    return newGame;
  };

  const updateGame = (id: string, updates: Partial<Game>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({
      games: profile.games.map((game) =>
        game.id === id ? normalizeGameRecord({ ...game, ...updates }) : game,
      ),
    });
  };

  const deleteGame = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({
      games: profile.games.filter((game) => game.id !== id),
      dailyChecklistItems: clearGameRoutineLinks(profile.dailyChecklistItems || [], id),
      productivityItems: clearGameLinksFromTasks(profile.productivityItems || [], id),
    });
  };

  const addGameGuide = (guide: Omit<GameGuide, "id" | "createdAt">) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const newGuide: GameGuide = normalizeGameGuideRecord({
      ...guide,
      id: createEntityId("game-guide"),
      createdAt: new Date(),
    });

    updateCurrentProfile({
      gameGuides: [...(profile.gameGuides || []), newGuide],
    });
  };

  const updateGameGuide = (id: string, updates: Partial<GameGuide>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      gameGuides: (profile.gameGuides || []).map((guide) =>
        guide.id === id
          ? {
              ...normalizeGameGuideRecord({
                ...guide,
                ...updates,
              }),
            }
          : guide,
      ),
    });
  };

  const deleteGameGuide = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      gameGuides: (profile.gameGuides || []).filter((guide) => guide.id !== id),
    });
  };

  // Productivity operations

  const completeProductivityWithConnections = (
    profile: Profile,
    id: string,
    completedAt: Date,
  ) => {
    const currentItem = (profile.productivityItems || []).find(item => item.id === id);
    if (currentItem?.linkOrigin === 'workhub-mirror') {
      const managed = completeManagedWorkMirrorFromLifeHub(profile, id, completedAt);
      return {
        ...managed,
        profile: managed.profile,
      };
    }
    const result = completeProductivityItemInProfile(profile, id, completedAt);
    return {
      ...result,
      completedTaskIds: result.status === 'applied' ? [id] : [],
      completedRoutineIds: [],
      workTransitioned: false,
    };
  };

  const addProductivityItem = (
    item: Omit<ProductivityItem, "id" | "createdAt">,
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const newItem = normalizeProductivityItem({
      ...item,
      id: createEntityId("productivity"),
      createdAt: new Date(),
    });

    const nextProfiles = profilesRef.current.map(item =>
      item.id === profile.id
        ? { ...item, productivityItems: [...(item.productivityItems || []), newItem] }
        : item,
    );
    commitProfiles(nextProfiles, newItem.createdAt);

    return newItem.id;
  };

  const updateProductivityItem = (
    id: string,
    updates: Partial<ProductivityItem>,
  ) => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return;

    const currentItem = (profile.productivityItems || []).find(
      (item) => item.id === id,
    );
    if (!currentItem) return;

    const nextStatus = updates.status ?? currentItem.status;
    const managedWorkTaskId = currentItem.linkOrigin === 'workhub-mirror'
      ? getWorkItemIdFromLifeHubRecord(currentItem)
      : undefined;
    const managedWorkTask = managedWorkTaskId
      ? (profile.workItems || []).find(item => item.id === managedWorkTaskId && item.type === 'task')
      : undefined;
    const workOwnedFields = managedWorkTask
      ? {
          title: managedWorkTask.title,
          priority: workPriorityToLifeHub(managedWorkTask.priority),
          deadline: managedWorkTask.dueDate || undefined,
        }
      : {};
    const transitionedToCompleted =
      currentItem.type === "task" &&
      currentItem.status !== "completed" &&
      nextStatus === "completed";

    if (transitionedToCompleted) {
      const completionAt = updates.completedAt || currentItem.completedAt || new Date();
      const completionProfile: Profile = {
        ...profile,
        productivityItems: (profile.productivityItems || []).map(item =>
          item.id === id
            ? {
                ...currentItem,
                ...updates,
                ...workOwnedFields,
                // The pure helper owns the final transition and cleanup.
                status: currentItem.status,
              }
            : item,
        ),
      };
      const result = completeProductivityWithConnections(
        completionProfile,
        id,
        completionAt,
      );
      if (result.status !== 'applied') return;

      const nextProfiles = profilesRef.current.map(item =>
        item.id === profile.id ? result.profile : item,
      );
      commitProfiles(nextProfiles, completionAt);

      const currentTitle = currentItem.title || 'Completed task';
      publishFeedback({
        actionId: `task:${id}:completed`,
        kind: 'success',
        title: 'Task completed',
        description: result.workTransitioned ? `${currentTitle} · Work Hub updated.` : currentTitle,
      });
      return;
    }

    const nextItem = normalizeProductivityItem({
      ...currentItem,
      ...updates,
      ...workOwnedFields,
      completedAt:
        nextStatus === "completed"
          ? updates.completedAt || currentItem.completedAt || new Date()
          : updates.status && updates.status !== "completed"
            ? null
            : currentItem.completedAt,
      failedAt:
        nextStatus === "failed" || nextStatus === "dropped"
          ? updates.failedAt || currentItem.failedAt || new Date()
          : updates.status && !["failed", "dropped"].includes(updates.status)
            ? null
            : currentItem.failedAt,
      deferredAt:
        nextStatus === "deferred"
          ? updates.deferredAt || currentItem.deferredAt || new Date()
          : updates.status && updates.status !== "deferred"
            ? null
            : currentItem.deferredAt,
    });

    updateCurrentProfile({
      productivityItems: (profile.productivityItems || []).map((item) =>
        item.id === id ? nextItem : item,
      ),
    });
    return true;
  };

  /**
   * Completes an Item Plan and, when requested, creates its Inventory
   * counterpart in the same profile mutation. The existing Wishlist fields
   * remain the canonical relationship so legacy records stay readable.
   */
  const completeWishlistItemToInventory = (
    id: string,
    updates: Partial<WishlistItem>,
  ): string | undefined => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return undefined;

    const existingPlan = profile.wishlistItems.find(item => item.id === id);
    const plan = normalizeWishlistRecord({
      ...(existingPlan || {}),
      ...updates,
      id,
      createdAt: existingPlan?.createdAt || new Date(),
      isBought: true,
      isArchived: false,
      selected: false,
    });
    if (plan.type && plan.type !== 'item') return undefined;

    const existingInventory = plan.destinationType === 'inventory'
      ? profile.inventoryItems.find(item => item.id === plan.destinationItemId)
      : undefined;
    const purchasedAt = plan.purchaseDate || plan.purchaseCompletedAt || new Date();
    const purchaseValue = optionalFiniteCollectionNumber(plan.actualPrice)
      ?? optionalFiniteCollectionNumber(plan.estimatedPrice)
      ?? 0;
    const nextInventory = existingInventory || normalizeInventoryRecord({
      id: createEntityId('inv'),
      profileId: profile.id,
      name: plan.name,
      quantity: 1,
      unit: 'pc',
      category: mapBalanceCategoryToInventoryCategory(plan.category),
      subCategory: plan.category || '',
      purchasePrice: purchaseValue,
      currentPrice: purchaseValue,
      purchaseDate: purchasedAt,
      image: plan.image || '',
      photoAssetIds: plan.photoAssetIds || [],
      notes: plan.notes || '',
      productLink: plan.productLink || '',
      acquisitionType: 'bought',
      storageLocation: '',
      createdAt: new Date(),
      currentValueUpdatedAt: new Date(),
    });
    const linkedPlan = normalizeWishlistRecord({
      ...plan,
      destinationType: 'inventory',
      destinationItemId: nextInventory.id,
      movedToInventory: true,
    });
    const nextWishlistItems = existingPlan
      ? profile.wishlistItems.map(item => item.id === id ? linkedPlan : item)
      : [...profile.wishlistItems, linkedPlan];
    const nextInventoryItems = existingInventory
      ? profile.inventoryItems
      : [...profile.inventoryItems, nextInventory];
    const nextProfile = {
      ...profile,
      wishlistItems: normalizeWishlistItems(nextWishlistItems),
      inventoryItems: normalizeInventoryItems(nextInventoryItems),
    };
    const nextProfiles = profilesRef.current.map(item => item.id === profile.id ? nextProfile : item);
    commitProfiles(nextProfiles, nextInventory.createdAt);

    const beforeMedia = collectMediaReferenceIds(profile.wishlistItems);
    const afterMedia = collectMediaReferenceIds(nextWishlistItems);
    const detachedAssetIds = [...beforeMedia].filter(assetId => !afterMedia.has(assetId));
    if (detachedAssetIds.length > 0) {
      scheduleMediaCleanup({
        profileId: profile.id,
        assetIds: detachedAssetIds,
        reason: 'attachment-detached',
      });
    }
    return nextInventory.id;
  };

  const completeProductivityItemForProfile = (
    profileId: string,
    id: string,
    completedAt = new Date(),
  ): 'applied' | 'alreadyApplied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === profileId);
    if (!profile) return 'rejected';
    const currentItem = (profile.productivityItems || []).find(item => item.id === id);
    if (currentItem?.status === 'completed') return 'alreadyApplied';
    const result = completeProductivityWithConnections(profile, id, completedAt);
    if (result.status !== 'applied') return result.status;

    const nextProfiles = profilesRef.current.map(item =>
      item.id === profileId ? result.profile : item,
    );
    commitProfiles(nextProfiles, completedAt);

    if (profileId === currentProfileId) {
      const currentTitle = currentItem?.title || 'Completed task';
      publishFeedback({
        actionId: `task:${id}:completed`,
        kind: 'success',
        title: 'Task completed',
        description: result.workTransitioned ? `${currentTitle} · Work Hub updated.` : currentTitle,
      });
    }
    return 'applied';
  };

  const completeProductivityItem = (id: string, completedAt = new Date()) => {
    completeProductivityItemForProfile(currentProfileId, id, completedAt);
  };

  const updateWorkItemsForProfile = (
    profileId: string,
    items: WorkItem[],
    mirrorIntent?: WorkLifeHubMirrorIntent,
  ): 'applied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === profileId);
    if (!profile) return 'rejected';

    const normalizedNext = items.map(normalizeWorkItem);
    const previousById = new Map(
      (profile.workItems || []).map(item => [item.id, item]),
    );
    const transitionedTasks = normalizedNext.filter(item => {
      const previous = previousById.get(item.id);
      return Boolean(
        previous &&
        previous.type === 'task' &&
        previous.status !== 'done' &&
        previous.status !== 'archived' &&
        item.type === 'task' &&
        item.status === 'done',
      );
    });

    const completedAt = new Date();
    let nextProfile = reconcileWorkLifeHubMirror(profile, normalizedNext, mirrorIntent, new Date());
    let linkedLifeHubCount = 0;

    for (const item of transitionedTasks) {
      const linked = completeLinkedLifeHubItemsForWorkTask(
        nextProfile,
        item.id,
        completedAt,
      );
      nextProfile = linked.profile;
      linkedLifeHubCount +=
        linked.completedTaskIds.length + linked.completedRoutineIds.length;
    }

    const nextProfiles = profilesRef.current.map(item =>
      item.id === profileId ? nextProfile : item,
    );
    commitProfiles(nextProfiles, completedAt);

    if (profileId === currentProfileId && transitionedTasks.length > 0) {
      const first = transitionedTasks[0];
      const workTitle = first.title || 'Completed work task';
      const lifeHubDescription = linkedLifeHubCount > 0
        ? `Life Hub updated: ${linkedLifeHubCount} item${linkedLifeHubCount === 1 ? '' : 's'} completed.`
        : undefined;
      publishFeedback({
        actionId: `work-task:${first.id}:completed`,
        kind: 'success',
        title: transitionedTasks.length === 1
          ? 'Work task completed'
          : `${transitionedTasks.length} Work tasks completed`,
        description: lifeHubDescription || workTitle,
      });
    }
    return 'applied';
  };

  const completeWorkItemForProfile = (
    profileId: string,
    id: string,
  ): 'applied' | 'alreadyApplied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === profileId);
    if (!profile) return 'rejected';
    const currentItem = (profile.workItems || []).find(item => item.id === id);
    if (!currentItem || currentItem.type !== 'task') return 'rejected';
    if (currentItem.status === 'done') return 'alreadyApplied';
    if (currentItem.status === 'archived') return 'rejected';
    return updateWorkItemsForProfile(
      profileId,
      (profile.workItems || []).map(item =>
        item.id === id ? { ...item, status: 'done' } : item,
      ),
    ) === 'applied'
      ? 'applied'
      : 'rejected';
  };

  const deferProductivityItem = (id: string, nextDeadline?: Date | null) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.productivityItems || []).find(
      (entry) => entry.id === id,
    );
    if (!item) return;
    updateProductivityItem(id, {
      status: "deferred",
      previousDeadline: item.deadline,
      deadline: nextDeadline || undefined,
      deferredAt: new Date(),
      completedAt: null,
      failedAt: null,
      deferCount: Number(item.deferCount || 0) + 1,
    });
  };

  const dropProductivityItem = (id: string) => {
    updateProductivityItem(id, {
      status: "dropped",
      failedAt: new Date(),
      completedAt: null,
      deferredAt: null,
    });
  };

  const reopenProductivityItem = (id: string) => {
    updateProductivityItem(id, {
      status: "pending",
      completedAt: null,
      failedAt: null,
      deferredAt: null,
    });
  };

  const convertIdeaToTask = (
    id: string,
    deadline?: Date | null,
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const idea = (profile.productivityItems || []).find(
      (item) => item.id === id && item.type === "idea",
    );
    if (!idea) return undefined;

    const taskId = createEntityId("productivity");
    const task = normalizeProductivityItem({
      ...idea,
      id: taskId,
      type: "task",
      status: "pending",
      deadline: deadline || idea.deadline,
      convertedFromIdeaId: idea.id,
      convertedToTaskId: undefined,
      completedAt: null,
      failedAt: null,
      deferredAt: null,
      createdAt: new Date(),
    });

    updateCurrentProfile({
      productivityItems: [
        ...(profile.productivityItems || []).map((item) =>
          item.id === id
            ? {
                ...item,
                convertedToTaskId: taskId,
                status: "completed" as const,
                completedAt: new Date(),
              }
            : item,
        ),
        task,
      ],
    });

    return taskId;
  };

  const deleteProductivityItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.productivityItems || []).find(
      (item) => item.id === id,
    );
    if (item) {
      moveToTrash("productivityItems", item, "Life Hub Task");
      return;
    }

    updateCurrentProfile({
      productivityItems: (profile.productivityItems || []).filter(
        (item) => item.id !== id,
      ),
    });
  };
  // Media operations

  const addMediaItem = (
    item: Omit<MediaItem, "id" | "createdAt"> & { id?: string },
  ): MediaItem | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const newItem = normalizeMediaItem({
      ...item,
      id: item.id || createEntityId("media"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    updateCurrentProfile({
      mediaItems: [...(profile.mediaItems || []), newItem],
    });

    return newItem;
  };

  const updateMediaItem = (id: string, updates: Partial<MediaItem>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const previous = (profile.mediaItems || []).find(item => item.id === id);
    const nextItems = (profile.mediaItems || []).map((item) =>
      item.id === id
        ? normalizeMediaItem({
            ...item,
            ...updates,
            id,
            updatedAt: new Date(),
          })
        : item,
    );
    const next = nextItems.find(item => item.id === id);
    if (previous && next) {
      queueRemovedMedia(profile, previous, next, 'attachment-detached');
    }

    updateCurrentProfile({
      mediaItems: nextItems,
    });
  };

  const deleteMediaItem = (id: string) => {
    const profile = getCurrentProfile();
    const item = profile?.mediaItems?.find(entry => entry.id === id);
    if (item) moveToTrash('mediaItems', item, 'Entertainment');
  };

  // Books are profile-local records. Their optional profile field is
  // normalized at hydration/import boundaries so older profiles remain valid.
  const addBook = (
    book: Omit<BookItem, "id" | "createdAt">,
  ): BookItem | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const newBook = normalizeBook({
      ...book,
      id: createEntityId('book'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    updateCurrentProfile({
      books: [...(profile.books || []), newBook],
    });
    return newBook;
  };

  const updateBook = (id: string, updates: Partial<BookItem>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({
      books: (profile.books || []).map(book => book.id === id
        ? normalizeBook({ ...book, ...updates, id, updatedAt: new Date() }, id)
        : book),
    });
  };

  const deleteBook = (id: string) => {
    const profile = getCurrentProfile();
    const item = profile?.books?.find(entry => entry.id === id);
    if (item) moveToTrash('books', item, 'Books');
  };

  // Music operations

  const addMusicItem = (item: Omit<MusicItem, "id" | "createdAt">) => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const newItem: MusicItem = normalizeMusicRecord({
      ...item,
      id: createEntityId("music"),
      createdAt: new Date(),
    });

    updateCurrentProfile({
      musicItems: [...(profile.musicItems || []), newItem],
    });

    return newItem;
  };

  const updateMusicItem = (id: string, updates: Partial<MusicItem>) => {
    setProfiles(current =>
      current.map(profile =>
        profile.id === currentProfileId
          ? {
            ...profile,
            musicItems: normalizeMusicItems(
              (profile.musicItems || []).map(item =>
                item.id === id
                  ? normalizeMusicRecord({ ...item, ...updates })
                  : item,
              ),
            ),
          }
          : profile,
      ),
    );
  };

  const recordMusicPlay = (id: string, playedAt = new Date()) => {
    setProfiles(current =>
      current.map(profile =>
        profile.id === currentProfileId
          ? (() => {
            const musicHistoryStartedAt = startRuntimeTrace('music-play-history-update');
            try {
              return {
                ...profile,
                musicItems: (profile.musicItems || []).map(item =>
                  item.id === id
                    ? normalizeMusicRecord({
                      ...item,
                      playHistory: [...(item.playHistory || []), { playedAt }],
                      lastPlayedAt: playedAt,
                      playCount: Number(item.playCount || 0) + 1,
                    })
                    : item,
                ),
              };
            } finally {
              endRuntimeTrace('music-play-history-update', musicHistoryStartedAt);
            }
          })()
          : profile,
      ),
    );
  };

  const deleteMusicItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const item = (profile.musicItems || []).find(entry => entry.id === id);
    if (!item) return;

    const deletedAt = new Date();
    const trashItem = {
      id: `trash-${Date.now()}-${item.id}`,
      source: 'musicItems' as const,
      sourceLabel: 'Music',
      itemId: item.id,
      title: item.title || 'Deleted music',
      deletedAt,
      deleteAfter: trashDeleteAfter(deletedAt),
      data: item,
    };

    setProfiles(current =>
      current.map(currentProfile =>
        currentProfile.id === currentProfileId
          ? {
            ...currentProfile,
            musicItems: (currentProfile.musicItems || []).filter(
              entry => entry.id !== id,
            ),
            trashItems: [trashItem, ...(currentProfile.trashItems || [])],
          }
          : currentProfile,
      ),
    );
    publishFeedback({
      actionId: `trash:${trashItem.id}:created`,
      kind: 'success',
      title: `${trashItem.title} moved to Trash`,
      undo: {
        label: 'Undo',
        execute: () => restoreTrashItem(trashItem.id),
      },
    });
  };

  const updatePet = (updates: Partial<PetCompanionData>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      pet: normalizePet({
        ...normalizePet((profile as any).pet),
        ...updates,
      }),
    });
  };

  // Life Hub operations
  const addDailyChecklistItem = (
    item: Omit<DailyChecklistItem, "id" | "createdAt">,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const newItem = normalizeRoutineItem({
      ...item,
      id: createEntityId("checklist"),
      createdAt: new Date(),
      completedAt: item.completedAt || null,
      completionHistory: item.completionHistory || [],
    });

    updateCurrentProfile({
      dailyChecklistItems: [...(profile.dailyChecklistItems || []), newItem],
    });
  };

  const updateDailyChecklistItem = (
    id: string,
    updates: Partial<DailyChecklistItem>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      dailyChecklistItems: (profile.dailyChecklistItems || []).map((item) =>
        item.id === id
          ? normalizeRoutineItem(recordRoutineScheduleRevision(item, { ...item, ...updates }))
          : item,
      ),
    });
  };

  const changeRoutineProgress = (id: string, date: Date, change: { kind: 'set'; value: number } | { kind: 'adjust'; delta: number }) => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return;
    const result = changeRoutineProgressInProfile(profile, id, date, change, new Date());
    if (result.status !== 'applied') return;
    const nextProfiles = profilesRef.current.map(item => item.id === profile.id ? result.profile : item);
    commitProfiles(nextProfiles, new Date());
  };

  const setRoutineProgress = (id: string, date: Date, value: number) => {
    changeRoutineProgress(id, date, { kind: 'set', value });
  };

  const adjustRoutineProgress = (id: string, date: Date, delta: number) => {
    changeRoutineProgress(id, date, { kind: 'adjust', delta });
  };

  const deleteDailyChecklistItem = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.dailyChecklistItems || []).find(
      (item) => item.id === id,
    );
    if (item) {
      moveToTrash("dailyChecklistItems", item, "Life Hub Routine");
      return;
    }

    updateCurrentProfile({
      dailyChecklistItems: (profile.dailyChecklistItems || []).filter(
        (item) => item.id !== id,
      ),
    });
  };

  const toggleRoutineOccurrence = (id: string, date: Date) => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return;
    const currentItem = (profile.dailyChecklistItems || []).find(
      (item) => item.id === id,
    );
    if (!currentItem) return;

    const completedAt = new Date();
    const result = completeRoutineOccurrenceInProfile(
      profile,
      id,
      date,
      completedAt,
    );

    if (result.status === 'applied') {
      const periodKey = result.periodKey || getRoutineOccurrenceKey(currentItem, date);

      const nextProfiles = profilesRef.current.map(item =>
        item.id === profile.id ? result.profile : item,
      );
      commitProfiles(nextProfiles, completedAt);

      publishFeedback({
        actionId: `routine:${id}:${periodKey}:completed`,
        kind: 'success',
        title: 'Routine completed',
        feedbackGroup: 'routine',
        feedbackMobileTitle: currentItem.title ? `${currentItem.title} completed` : undefined,
        description: currentItem.title
          ? `${currentItem.title} · Undo reverses completion; your records remain intact.`
          : 'Undo reverses completion; your records remain intact.',
        undo: {
          label: 'Undo',
          execute: () => toggleRoutineOccurrence(id, date),
        },
      });
      return;
    }
    if (result.status !== 'alreadyApplied') return;

    // Undo is the only path that needs to rebuild the prior history. Keeping
    // this work out of completion avoids scanning a long routine history twice.
    const periodKey = result.periodKey || getRoutineOccurrenceKey(currentItem, date);
    const dateKey = toLocalDateKey(date);
    const currentHistory = getRoutineHistory(currentItem);
    const legacyOffset = Math.max(
      0,
      Number(currentItem.completionCount || 0) -
        currentHistory.filter((entry) => entry.status === "done").length,
    );
    const nextHistory = currentHistory.filter((entry) => {
      if (entry.periodKey) return entry.periodKey !== periodKey;
      return entry.date !== dateKey;
    });
    const nextItem = normalizeRoutineItem({
      ...currentItem,
      completionHistory: nextHistory,
      completionCount:
        legacyOffset +
        nextHistory.filter((entry) => entry.status === "done").length,
      completedAt: null,
    });

    updateCurrentProfile({
      dailyChecklistItems: (profile.dailyChecklistItems || []).map((item) =>
        item.id === id ? nextItem : item,
      ),
    });
  };

  /**
   * Complete-only mutation used by native widget actions. It deliberately
   * targets a profile ID instead of currentProfileId and never toggles an
   * existing completion, so a retry cannot undo a canonical completion.
   */
  const completeRoutineOccurrenceForProfile = (
    profileId: string,
    id: string,
    date: Date,
  ): 'applied' | 'alreadyApplied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === profileId);
    if (!profile) return 'rejected';
    const result = completeRoutineOccurrenceInProfile(profile, id, date);
    if (result.status !== 'applied') return result.status;

    const nextProfiles = profilesRef.current.map(item =>
      item.id === profileId ? result.profile : item,
    );
    // Advance the ref immediately so two queued widget actions for the same
    // pinned profile compose in order before React renders again.
    commitProfiles(nextProfiles, new Date());
    return 'applied';
  };

  const recoverRoutineOccurrenceForProfile = (profileId: string, id: string, date: Date) => {
    const profile = profilesRef.current.find((item) => item.id === profileId);
    if (!profile) return;
    const currentItem = (profile.dailyChecklistItems || []).find(
      (item) => item.id === id,
    );
    if (!currentItem || getRoutineOccurrence(currentItem, date)?.status !== "skipped") {
      return;
    }

    const nextItem = normalizeRoutineItem(
      recoverSkippedRoutineOccurrence(currentItem, date),
    );
    updateProfile(profile.id, {
      dailyChecklistItems: (profile.dailyChecklistItems || []).map((item) =>
        item.id === id ? nextItem : item,
      ),
    });
    publishFeedback({
      actionId: `routine:${id}:${getRoutineOccurrenceKey(currentItem, date)}:recovered:${Date.now()}`,
      kind: "success",
      title: "Routine recovered",
      description: currentItem.title
        ? `${currentItem.title} is ready to complete again.`
        : "This routine is ready to complete again.",
    });
  };

  const recoverRoutineOccurrence = (id: string, date: Date) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    recoverRoutineOccurrenceForProfile(profile.id, id, date);
  };

  const skipRoutineOccurrence = (id: string, date: Date, note?: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentItem = (profile.dailyChecklistItems || []).find(
      (item) => item.id === id,
    );
    if (!currentItem) return;

    const periodKey = getRoutineOccurrenceKey(currentItem, date);
    if (getRoutineOccurrence(currentItem, date)?.status === "skipped") return;
    const dateKey = toLocalDateKey(date);
    const currentHistory = getRoutineHistory(currentItem);
    const legacyOffset = Math.max(
      0,
      Number(currentItem.completionCount || 0) -
        currentHistory.filter((entry) => entry.status === "done").length,
    );
    const history = currentHistory.filter((entry) => {
      if (entry.periodKey) return entry.periodKey !== periodKey;
      return entry.date !== dateKey;
    });
    const nextHistory = [
      ...history,
      {
        date: dateKey,
        periodKey,
        status: "skipped" as const,
        completedAt: new Date(),
        note: note?.trim() || undefined,
      },
    ];

    updateProfile(profile.id, {
      dailyChecklistItems: (profile.dailyChecklistItems || []).map((item) =>
        item.id === id
          ? normalizeRoutineItem({
              ...item,
              completionHistory: nextHistory,
              completionCount:
                legacyOffset +
                nextHistory.filter((entry) => entry.status === "done").length,
            })
        : item,
      ),
    });

    publishFeedback({
      actionId: `routine:${id}:${periodKey}:skipped:${Date.now()}`,
      kind: "success",
      title: "Routine skipped",
      feedbackGroup: 'routine',
      feedbackMobileTitle: currentItem.title ? `${currentItem.title} skipped` : undefined,
      description: currentItem.title
        ? `${currentItem.title} was skipped for this occurrence. Use Undo skip now or Recover on the routine card later.`
        : "This routine was skipped for this occurrence. Use Undo skip now or Recover on the routine card later.",
      undo: {
        label: "Undo skip",
        execute: () => recoverRoutineOccurrenceForProfile(profile.id, id, date),
      },
    });
  };

  const completeSkincareRoutineOccurrence = (
    routineId: string,
    date: Date,
    productIds?: string[],
  ): 'applied' | 'alreadyApplied' | 'rejected' => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return 'rejected';
    const result = completeSkincareRoutineOccurrenceInProfile(profile, routineId, date, productIds);
    if (result.status !== 'applied') return result.status;
    const nextProfiles = profilesRef.current.map(item => item.id === profile.id ? result.profile : item);
    commitProfiles(nextProfiles);
    const routine = profile.dailyChecklistItems?.find(item => item.id === routineId);
    const periodKey = result.periodKey || (routine ? getRoutineOccurrenceKey(routine, date) : toLocalDateKey(date));
    publishFeedback({
      actionId: `routine:${routineId}:${periodKey}:completed`,
      kind: 'success',
      title: 'Routine completed',
      feedbackGroup: 'routine',
      feedbackMobileTitle: routine?.title ? `${routine.title} completed` : undefined,
      description: routine?.title
        ? `${routine.title} - Undo reverses completion; your records remain intact.`
        : 'Undo reverses completion; your records remain intact.',
      undo: {
        label: 'Undo',
        execute: () => toggleRoutineOccurrence(routineId, date),
      },
    });
    return 'applied';
  };

  const completeSupplementRoutineOccurrence = (
    routineId: string,
    date: Date,
    supplementIds?: string[],
  ): 'applied' | 'alreadyApplied' | 'rejected' => {
    const profile = getCurrentProfile();
    if (!profile) return 'rejected';
    const result = completeSupplementRoutineOccurrenceInProfile(profile, routineId, date, supplementIds);
    if (result.status !== 'applied') return result.status;
    const nextProfiles = profilesRef.current.map(item => item.id === profile.id ? result.profile : item);
    commitProfiles(nextProfiles);
    const routine = profile.dailyChecklistItems?.find(item => item.id === routineId);
    const periodKey = result.periodKey || (routine ? getRoutineOccurrenceKey(routine, date) : toLocalDateKey(date));
    publishFeedback({
      actionId: `routine:${routineId}:${periodKey}:completed`,
      kind: 'success',
      title: 'Routine completed',
      feedbackGroup: 'routine',
      feedbackMobileTitle: routine?.title ? `${routine.title} completed` : undefined,
      description: routine?.title
        ? `${routine.title} - Undo reverses completion; your records remain intact.`
        : 'Undo reverses completion; your records remain intact.',
      undo: {
        label: 'Undo',
        execute: () => toggleRoutineOccurrence(routineId, date),
      },
    });
    return 'applied';
  };

  const toggleDailyChecklistItem = (id: string) => {
    toggleRoutineOccurrence(id, new Date());
  };

  const addImportantDate = (
    item: Omit<ImportantDateItem, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const newItem = normalizeImportantDateItem({
      ...item,
      id: item.id || createEntityId("date"),
      createdAt: new Date(),
      status: item.status || "upcoming",
    });

    updateCurrentProfile({
      importantDates: [...(profile.importantDates || []), newItem],
    });
  };

  const updateImportantDate = (
    id: string,
    updates: Partial<ImportantDateItem>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      importantDates: (profile.importantDates || []).map((item) =>
        item.id === id
          ? normalizeImportantDateItem({ ...item, ...updates })
          : item,
      ),
    });
  };

  const deleteImportantDate = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.importantDates || []).find((item) => item.id === id);
    if (item) {
      moveToTrash("importantDates", item, "Life Hub Date");
      return;
    }

    updateCurrentProfile({
      importantDates: (profile.importantDates || []).filter(
        (item) => item.id !== id,
      ),
    });
  };

  const resolveImportantDate = (
    id: string,
    status: ImportantDateStatus = "completed",
    occurrenceDate?: Date,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const item = (profile.importantDates || []).find(
      (entry) => entry.id === id,
    );
    if (!item) return;

    if (status === "upcoming") {
      updateImportantDate(id, { status: "upcoming", resolvedAt: null });
      return;
    }

    const resolvedAt = new Date();
    const resolvedOccurrence = occurrenceDate
      ? new Date(occurrenceDate)
      : new Date(item.date);
    const history = [
      ...(item.resolutionHistory || []),
      {
        occurrenceDate: resolvedOccurrence,
        resolvedAt,
        status,
      },
    ];

    if (status === "completed" && item.repeat !== "none") {
      const nextDate = new Date(resolvedOccurrence);
      if (item.repeat === "monthly") {
        const originalDay = nextDate.getDate();
        nextDate.setDate(1);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const lastDay = new Date(
          nextDate.getFullYear(),
          nextDate.getMonth() + 1,
          0,
        ).getDate();
        nextDate.setDate(Math.min(originalDay, lastDay));
      }
      if (item.repeat === "yearly") {
        const originalMonth = nextDate.getMonth();
        const originalDay = nextDate.getDate();
        nextDate.setDate(1);
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        nextDate.setMonth(originalMonth);
        const lastDay = new Date(
          nextDate.getFullYear(),
          originalMonth + 1,
          0,
        ).getDate();
        nextDate.setDate(Math.min(originalDay, lastDay));
      }
      updateImportantDate(id, {
        date: nextDate,
        status: "upcoming",
        resolvedAt,
        resolutionHistory: history,
      });
      return;
    }

    updateImportantDate(id, {
      status,
      resolvedAt,
      resolutionHistory: history,
    });
  };

  // Skincare operations
  const normalizeSkincareDate = (value?: Date | string | null) =>
    normalizeCollectionDate(value) || undefined;

  const addSkincareProduct = (
    product: Omit<SkincareProduct, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const newProduct = normalizeSkincareRecord({
      ...product,
      id: product.id || createEntityId('skincare'),
      createdAt: new Date(),
    });

    updateCurrentProfile({
      skincareProducts: [...profile.skincareProducts, newProduct],
    });
  };

  const updateSkincareProduct = (
    id: string,
    updates: Partial<SkincareProduct>,
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const nextProducts = normalizeSkincareProducts(profile.skincareProducts.map((product) => {
      if (product.id !== id) return product;
      return normalizeSkincareRecord({
        ...product,
        ...updates,
      });
    }));
    queueRemovedMedia(profile, profile.skincareProducts, nextProducts, 'attachment-detached');

    updateCurrentProfile({
      skincareProducts: nextProducts,
    });
  };

  const renameSkincareCategoryRecords = (from: string, to: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const fromKey = from.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    updateCurrentProfile({
      skincareProducts: profile.skincareProducts.map(product =>
        product.category.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === fromKey
          ? { ...product, category: to as SkincareProduct['category'] }
          : product,
      ),
    });
  };

  const deleteSkincareProduct = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const linkedRoutineItems = profile.dailyChecklistItems || [];
    const linkedTaskItems = profile.productivityItems || [];
    const linkedCount = linkedRoutineItems.filter(item => getSkincareProductIdsFromLifeHubRecord(item).includes(id)).length +
      linkedTaskItems.filter(item => getSkincareProductIdsFromLifeHubRecord(item).includes(id)).length;
    const deletedProduct = profile.skincareProducts.find(product => product.id === id);
    const usageEvents = (profile.skincareUsageEvents || []).map(event =>
      event.productId === id && !event.productNameSnapshot && deletedProduct?.name
        ? { ...event, productNameSnapshot: deletedProduct.name }
        : event,
    );
    if (deletedProduct) {
      moveToTrash('skincareProducts', deletedProduct, 'Skincare', {
        additionalUpdates: {
          skincareUsageEvents: usageEvents,
          dailyChecklistItems: clearSkincareLinksFromRoutines(linkedRoutineItems, id),
          productivityItems: clearSkincareLinksFromTasks(linkedTaskItems, id),
        },
      });
    }
    if (linkedCount > 0) {
      publishFeedback({
        actionId: `skincare:${id}:links-cleared:${Date.now()}`,
        kind: 'success',
        title: 'Skincare product deleted',
        description: `${linkedCount} Life Hub link${linkedCount === 1 ? '' : 's'} cleared. Life Hub history was preserved.`,
      });
    }
  };

  const logSkincareUsage = (productId: string, usedAt = new Date()): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile || Number.isNaN(usedAt.getTime()) || !profile.skincareProducts.some(product => product.id === productId)) return undefined;
    const id = createEntityId('skincare-use');
    updateCurrentProfile({
      skincareUsageEvents: [...(profile.skincareUsageEvents || []), {
        id,
        productId,
        usedAt: new Date(usedAt),
        source: 'manual',
        productNameSnapshot: profile.skincareProducts.find(product => product.id === productId)?.name,
        createdAt: new Date(),
      }],
    });
    return id;
  };

  const updateSkincareUsageEvent = (id: string, usedAt: Date) => {
    const profile = getCurrentProfile();
    if (!profile || Number.isNaN(usedAt.getTime())) return;
    updateCurrentProfile({ skincareUsageEvents: (profile.skincareUsageEvents || []).map(event => event.id === id ? { ...event, usedAt: new Date(usedAt) } : event) });
  };

  const deleteSkincareUsageEvent = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({ skincareUsageEvents: (profile.skincareUsageEvents || []).filter(event => event.id !== id) });
  };

  const markSkincareProductEmptied = (
    id: string,
    details: Date | SkincareFinishDetails = new Date(),
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const normalizedDetails: SkincareFinishDetails =
      details instanceof Date ? { emptiedAt: details } : details;

    const emptiedAt =
      normalizeSkincareDate(normalizedDetails.emptiedAt) || new Date();

    updateCurrentProfile({
      skincareProducts: profile.skincareProducts.map((product) =>
        product.id === id
          ? {
              ...product,
              status: "emptied",
              emptiedAt,
              emptiedNotes: normalizedDetails.emptiedNotes?.trim() || undefined,
              wouldRepurchase: normalizedDetails.wouldRepurchase,
            }
          : product,
      ),
    });
  };

  /** Undo an accidental finish. Repurchases should use repurchaseSkincareProduct. */
  const restoreSkincareProduct = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    updateCurrentProfile({
      skincareProducts: profile.skincareProducts.map((product) =>
        product.id === id
          ? {
              ...product,
              status: "active",
              emptiedAt: null,
              emptiedNotes: undefined,
              wouldRepurchase: undefined,
            }
          : product,
      ),
    });
  };

  const repurchaseSkincareProduct = (
    id: string,
    purchase: SkincareRepurchaseInput,
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const source = profile.skincareProducts.find(
      (product) => product.id === id,
    );
    if (!source) return undefined;

    // Seed the new cycle's typical-duration estimate from the source
    // product's completed usage history (itself plus any earlier cycles in
    // its repurchase chain), unless the caller supplied an explicit override.
    const historicalDuration = purchase.estimatedDuration
      ?? getSkincareTypicalDurationDays(source, profile.skincareProducts) ?? undefined;

    const replacement = normalizeSkincareRecord({
      ...source,
      id: createEntityId('skincare'),
      purchasePrice: purchase.purchasePrice,
      currentPrice:
        purchase.currentPrice === undefined
          ? source.currentPrice
          : purchase.currentPrice === null
            ? undefined
          : purchase.currentPrice,
      purchaseDate: purchase.purchaseDate,
      startDate: purchase.startDate,
      estimatedDuration: historicalDuration,
      frequency: purchase.frequency || source.frequency || "Daily",
      schedule: purchase.schedule || source.schedule || "both",
      status: "active",
      emptiedAt: null,
      emptiedNotes: undefined,
      wouldRepurchase: undefined,
      repurchaseOfProductId: source.id,
      createdAt: new Date(),
    });

    updateCurrentProfile({
      skincareProducts: [...profile.skincareProducts, replacement],
    });

    return replacement.id;
  };

  // Supplements operations
  const addSupplement = (
    supplement: Omit<Supplement, "id" | "createdAt"> & { id?: string },
  ) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const newSupplement = normalizeSupplementRecord({
      ...supplement,
      id: supplement.id || createEntityId('supplement'),
      createdAt: new Date(),
    });
    updateCurrentProfile({
      supplements: [...profile.supplements, newSupplement],
    });
  };

  const updateSupplement = (id: string, updates: Partial<Supplement>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const nextSupplements = normalizeSupplements(profile.supplements.map((supplement) =>
      supplement.id === id ? { ...supplement, ...updates } : supplement,
    ));
    queueRemovedMedia(profile, profile.supplements, nextSupplements, 'attachment-detached');
    updateCurrentProfile({ supplements: nextSupplements });
  };

  const deleteSupplement = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const linkedRoutineItems = profile.dailyChecklistItems || [];
    const linkedTaskItems = profile.productivityItems || [];
    const linkedCount = linkedRoutineItems.filter(item => getSupplementIdsFromLifeHubRecord(item).includes(id)).length +
      linkedTaskItems.filter(item => getSupplementIdsFromLifeHubRecord(item).includes(id)).length;
    const nextSupplements = normalizeSupplements(profile.supplements.filter(
      (supplement) => supplement.id !== id,
    ));
    queueRemovedMedia(profile, profile.supplements, nextSupplements, 'record-deleted');
    updateCurrentProfile({
      supplements: nextSupplements,
      dailyChecklistItems: clearSupplementLinksFromRoutines(linkedRoutineItems, id),
      productivityItems: clearSupplementLinksFromTasks(linkedTaskItems, id),
    });
    if (linkedCount > 0) {
      publishFeedback({
        actionId: `supplement:${id}:links-cleared:${Date.now()}`,
        kind: 'success',
        title: 'Supplement deleted',
        description: `${linkedCount} Life Hub link${linkedCount === 1 ? '' : 's'} cleared. Life Hub history was preserved.`,
      });
    }
  };
  // Food Log operations
  function omitMealTypeSource<T extends object>(value: T): Omit<T, 'mealTypeSource'> {
    const result = { ...value } as Record<string, unknown>;
    delete result.mealTypeSource;
    return result as unknown as Omit<T, 'mealTypeSource'>;
  }

  function omitMealType<T extends object>(value: T): Omit<T, 'mealType'> {
    const result = { ...value } as Record<string, unknown>;
    delete result.mealType;
    return result as unknown as Omit<T, 'mealType'>;
  }

  const addFoodEntries = (
    entries: Array<Omit<FoodEntry, "id" | "createdAt">>,
  ): string[] => {
    if (!entries.length) return [];

    const profile = profilesRef.current.find(item => item.id === currentProfileId);
    if (!profile) return [];

    const newEntries: FoodEntry[] = entries.map((entry) => {
      const entryWithoutSource = omitMealTypeSource(entry);
      const entryWithoutMealType = omitMealType(entryWithoutSource);
      const mealType = readFoodEntryMealType(entry.mealType);
      return {
        ...entryWithoutMealType,
        id: createEntityId("food"),
        createdAt: new Date(),
        date: parseLocalDateValue(entry.date) || new Date(),
        ...(mealType ? { mealType, mealTypeSource: 'explicit' as const } : {}),
        calories: normalizeHealthNonNegative(entry.calories),
        protein: normalizeHealthNonNegative(entry.protein),
        carbs: normalizeHealthNonNegative(entry.carbs),
        fat: normalizeHealthNonNegative(entry.fat),
        sodium: normalizeHealthNonNegative(entry.sodium),
        fiber: normalizeHealthNonNegative(entry.fiber),
        ...(entry.sugar === undefined || entry.sugar === null
          ? {}
          : { sugar: normalizeHealthNonNegative(entry.sugar) }),
      };
    });

    const currentHealth = normalizeHealth(profile.health);
    const mutation = applyHealthMutation(
      profile,
      {
        ...currentHealth,
        foodEntries: [...currentHealth.foodEntries, ...newEntries],
      },
      newEntries.map(entry => ({ kind: 'food' as const, entry })),
    );

    publishFeedback({
      actionId: `food:${newEntries.map(entry => entry.id).join('|')}:saved`,
      kind: 'success',
      title: 'Wellness record saved',
      description: mutation.completedRoutineIds.length > 0
        ? `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`
        : undefined,
    });

    return newEntries.map((entry) => entry.id);
  };

  const addFoodEntry = (entry: Omit<FoodEntry, "id" | "createdAt">) => {
    addFoodEntries([entry]);
  };

  const updateFoodEntry = (id: string, updates: Partial<FoodEntry>) => {
    const profile = profilesRef.current.find(item => item.id === currentProfileId);

    if (!profile) return;

    const currentHealth = normalizeHealth(profile.health);
    const nextEntries = currentHealth.foodEntries.map((entry) => {
      if (entry.id !== id) return entry;

      const updatesWithoutSource = omitMealTypeSource(updates);
      const requestedMealType = updatesWithoutSource.mealType;
      const updatesWithoutMealType = omitMealType(updatesWithoutSource);
      const nextRaw = {
        ...entry,
        ...updatesWithoutMealType,
        date: updates.date ? parseLocalDateValue(updates.date) || entry.date : entry.date,
      };
      const mealTypeWasUpdated = Object.prototype.hasOwnProperty.call(updates, 'mealType');
      const nextMealType = readFoodEntryMealType(
        mealTypeWasUpdated ? requestedMealType : entry.mealType,
      ) || readFoodEntryMealType(entry.mealType);
      const nextWithoutMealType = omitMealType(nextRaw);

      if (nextMealType) {
        return {
          ...nextWithoutMealType,
          mealType: nextMealType,
          ...(mealTypeWasUpdated || entry.mealTypeSource === 'explicit'
            ? { mealTypeSource: 'explicit' as const }
            : {}),
        };
      }

      return omitMealTypeSource(nextWithoutMealType);
    });
    const savedEntry = nextEntries.find(entry => entry.id === id);
    if (!savedEntry) return;

    applyHealthMutation(
      profile,
      { ...currentHealth, foodEntries: nextEntries },
      [{ kind: 'food', entry: savedEntry }],
    );
  };

  const deleteFoodEntries = (ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setProfiles((previous) =>
      previous.map((profile) =>
        profile.id !== currentProfileId
          ? profile
          : {
              ...profile,
              health: {
                ...normalizeHealth(profile.health),
                foodEntries: (profile.health?.foodEntries || []).filter(
                  (entry) => !idSet.has(entry.id),
                ),
              },
            },
      ),
    );
  };

  const deleteFoodEntry = (id: string) => {
    deleteFoodEntries([id]);
  };

  const addActivityEntry = (
    entry: Omit<ActivityEntry, "id" | "createdAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],
      activityEntries: [],
      noXTrackers: [],
    };

    const newEntry: ActivityEntry = {
      ...entry,
      id: entry.id || createEntityId("activity"),
      createdAt: new Date(),
      date: parseLocalDateValue(entry.date) || new Date(),
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        activityEntries: [...(currentHealth.activityEntries || []), newEntry],
      },
    });
    return newEntry.id;
  };

  const deleteActivityEntry = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],
      activityEntries: [],
      noXTrackers: [],
    };

    const nextEntries = (currentHealth.activityEntries || []).filter(
      (entry) => entry.id !== id,
    );
    queueRemovedMedia(profile, currentHealth.activityEntries || [], nextEntries, 'record-deleted');

    updateCurrentProfile({
      health: {
        ...currentHealth,
        activityEntries: nextEntries,
      },
    });
  };

  const addFoodTemplate = (
    template: Omit<FoodTemplate, "id" | "createdAt">,
  ) => {
    const newTemplate: FoodTemplate = {
      ...template,
      ...(template.sugarPerGram === undefined
        ? {}
        : { sugarPerGram: normalizeHealthNonNegative(template.sugarPerGram) }),
      id: createEntityId("food-template"),
      createdAt: new Date(),
    };

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== currentProfileId) {
          return profile;
        }

        const currentHealth = profile.health || {
          weightEntries: [],
          nutritionEntries: [],
          foodEntries: [],
          foodTemplates: [],

          activityEntries: [],

          noXTrackers: [],
        };

        return {
          ...profile,
          health: {
            ...currentHealth,
            foodTemplates: [
              ...(currentHealth.foodTemplates || []),
              newTemplate,
            ],
          },
        };
      }),
    );
  };

  const updateFoodTemplate = (id: string, updates: Partial<FoodTemplate>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        foodTemplates: (currentHealth.foodTemplates || []).map((template) =>
          template.id === id ? { ...template, ...updates } : template,
        ),
      },
    });
  };

  const deleteFoodTemplate = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        foodTemplates: (currentHealth.foodTemplates || []).filter(
          (template) => template.id !== id,
        ),
      },
    });
  };
  const addWeightEntry = (entry: Omit<WeightEntry, "id" | "createdAt">) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    const newEntry: WeightEntry = {
      ...entry,
      id: createEntityId("weight"),
      createdAt: new Date(),
      date: parseLocalDateValue(entry.date) || new Date(),
    };

    const mutation = applyHealthMutation(
      profile,
      { ...normalizeHealth(currentHealth), weightEntries: [...(currentHealth.weightEntries || []), newEntry] },
      [{ kind: 'weight', entry: newEntry }],
    );
    if (mutation.completedRoutineIds.length > 0) {
      publishFeedback({
        actionId: `health-evidence:weight:${newEntry.id}`,
        kind: 'success',
        title: 'Weight logged',
        description: `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
  };

  const addWaterEntry = (entry: Omit<WaterEntry, 'id' | 'createdAt'>): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile || !Number.isFinite(entry.amountMl) || entry.amountMl <= 0) return undefined;
    const currentHealth = normalizeHealth(profile.health);
    const date = parseLocalDateValue(entry.date) || new Date();
    const dateKey = toLocalDateKey(date);
    const waterEntries = currentHealth.waterEntries || [];
    const previousTotalMl = waterEntries
      .filter(item => toLocalDateKey(item.date) === dateKey)
      .reduce((sum, item) => sum + item.amountMl, 0);
    const nextEntry: WaterEntry = {
      id: createEntityId('water'),
      date,
      amountMl: Math.max(1, Math.round(entry.amountMl)),
      createdAt: new Date(),
    };
    const mutation = applyHealthMutation(
      profile,
      { ...currentHealth, waterEntries: [...waterEntries, nextEntry] },
      [{ kind: 'water', date, previousTotalMl }],
    );
    if (mutation.completedRoutineIds.length > 0) {
      publishFeedback({
        actionId: `health-evidence:water:${nextEntry.id}`,
        kind: 'success',
        title: 'Hydration target reached',
        description: `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
    return nextEntry.id;
  };

  const deleteWaterEntry = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    updateCurrentProfile({
      health: { ...currentHealth, waterEntries: (currentHealth.waterEntries || []).filter(entry => entry.id !== id) },
    });
  };

  const addBodyMeasurementEntry = (entry: Omit<BodyMeasurementEntry, 'id' | 'createdAt'>): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const currentHealth = normalizeHealth(profile.health);
    const date = parseLocalDateValue(entry.date) || new Date();
    const dateKey = toLocalDateKey(date);
    const bodyMeasurementEntries = currentHealth.bodyMeasurementEntries || [];
    const existing = bodyMeasurementEntries.find(item => toLocalDateKey(item.date) === dateKey);
    const id = existing?.id || createEntityId('body-measurement');
    const nextEntry: BodyMeasurementEntry = {
      ...(existing || {}),
      ...entry,
      id,
      date,
      createdAt: existing?.createdAt || new Date(),
    };
    updateCurrentProfile({
      health: {
        ...currentHealth,
        bodyMeasurementEntries: existing
          ? bodyMeasurementEntries.map(item => item.id === id ? nextEntry : item)
          : [...bodyMeasurementEntries, nextEntry],
      },
    });
    return id;
  };

  const updateBodyMeasurementEntry = (id: string, updates: Partial<BodyMeasurementEntry>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    updateCurrentProfile({
      health: {
        ...currentHealth,
        bodyMeasurementEntries: (currentHealth.bodyMeasurementEntries || []).map(item => item.id === id
          ? { ...item, ...updates, date: updates.date ? parseLocalDateValue(updates.date) || item.date : item.date }
          : item),
      },
    });
  };

  const deleteBodyMeasurementEntry = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    updateCurrentProfile({
      health: { ...currentHealth, bodyMeasurementEntries: (currentHealth.bodyMeasurementEntries || []).filter(item => item.id !== id) },
    });
  };

  const updateWeightEntry = (id: string, updates: Partial<WeightEntry>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        weightEntries: (currentHealth.weightEntries || []).map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...updates,
                date: updates.date ? parseLocalDateValue(updates.date) || entry.date : entry.date,
              }
            : entry,
        ),
      },
    });
  };

  const deleteWeightEntry = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        weightEntries: (currentHealth.weightEntries || []).filter(
          (entry) => entry.id !== id,
        ),
      },
    });
  };

  const addWorkoutPlan = (
    plan: Omit<WorkoutPlan, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const now = new Date();
    const id = plan.id || createEntityId("workout-plan");
    const newPlan: WorkoutPlan = {
      ...plan,
      id,
      name: plan.name.trim() || "Untitled workout",
      exercises: (plan.exercises || []).map((exercise) => ({
        ...exercise,
        id: exercise.id || createEntityId("exercise"),
        name: exercise.name.trim() || "Exercise",
      })),
      createdAt: now,
      updatedAt: now,
    };

    updateCurrentProfile({
      health: {
        ...normalizeHealth(profile.health),
        workoutPlans: [...(profile.health?.workoutPlans || []), newPlan],
      },
    });
    return id;
  };

  const updateWorkoutPlan = (id: string, updates: Partial<WorkoutPlan>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({
      health: {
        ...normalizeHealth(profile.health),
        workoutPlans: (profile.health?.workoutPlans || []).map((plan) =>
          plan.id === id
            ? {
                ...plan,
                ...updates,
                exercises: updates.exercises
                  ? updates.exercises.map((exercise) => ({
                      ...exercise,
                      id: exercise.id || createEntityId("exercise"),
                    }))
                  : plan.exercises,
                updatedAt: new Date(),
              }
            : plan,
        ),
      },
    });
  };

  const deleteWorkoutPlan = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const targets = new Set([healthLinkedTargetKey({ type: 'workout-plan', entityId: id })]);
    updateCurrentProfile({
      health: {
        ...normalizeHealth(profile.health),
        workoutPlans: (profile.health?.workoutPlans || []).filter(
          (plan) => plan.id !== id,
        ),
      },
      dailyChecklistItems: clearHealthLinksFromRoutines(profile.dailyChecklistItems || [], targets),
      productivityItems: clearHealthLinksFromTasks(profile.productivityItems || [], targets),
    });
  };

  const addWorkoutExercise = (
    exercise: Omit<WorkoutExerciseDefinition, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const now = new Date();
    const id = exercise.id || createEntityId('workout-exercise');
    const nextExercise: WorkoutExerciseDefinition = {
      ...exercise,
      id,
      source: 'custom',
      name: exercise.name.trim() || 'Custom exercise',
      createdAt: now,
      updatedAt: now,
    };
    updateCurrentProfile({
      health: {
        ...normalizeHealth(profile.health),
        workoutExercises: [...(profile.health?.workoutExercises || []), nextExercise],
      },
    });
    return id;
  };

  const updateWorkoutExercise = (id: string, updates: Partial<WorkoutExerciseDefinition>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    // `source` is preserved unless the caller explicitly overrides it. The custom-exercise
    // editor already sends `source: 'custom'` on every save, so that path is unaffected; a
    // personal-media/notes override on a builtin/OpenGym exercise must not flip its source or
    // catalog identity just because it went through the same update path.
    const nextExercises = (currentHealth.workoutExercises || []).map(exercise =>
      exercise.id === id ? { ...exercise, ...updates, source: updates.source ?? exercise.source, updatedAt: new Date() } : exercise,
    );
    queueRemovedMedia(profile, currentHealth.workoutExercises || [], nextExercises, 'attachment-detached');
    updateCurrentProfile({
      health: {
        ...currentHealth,
        workoutExercises: nextExercises,
      },
    });
  };

  const deleteWorkoutExercise = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    const nextExercises = (currentHealth.workoutExercises || []).filter(exercise => exercise.id !== id);
    queueRemovedMedia(profile, currentHealth.workoutExercises || [], nextExercises, 'record-deleted');
    updateCurrentProfile({
      health: {
        ...currentHealth,
        workoutExercises: nextExercises,
        workoutRoutines: (currentHealth.workoutRoutines || []).map(routine => ({
          ...routine,
          items: routine.items.map(item => item.exerciseId === id
            ? { ...item, unavailableReference: true }
            : item),
        })),
      },
    });
  };

  const addWorkoutRoutine = (
    routine: Omit<WorkoutRoutine, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile || !routine.items?.length) return undefined;
    const currentHealth = normalizeHealth(profile.health);
    const now = new Date();
    const id = routine.id || createEntityId('workout-routine');
    const nextRoutine: WorkoutRoutine = {
      ...routine,
      id,
      source: 'custom',
      name: routine.name.trim() || 'Custom routine',
      createdAt: now,
      updatedAt: now,
    };
    updateCurrentProfile({
      health: {
        ...currentHealth,
        workoutRoutines: [...(currentHealth.workoutRoutines || []), nextRoutine],
      },
    });
    return id;
  };

  const updateWorkoutRoutine = (id: string, updates: Partial<WorkoutRoutine>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    const previousRoutines = currentHealth.workoutRoutines || [];
    const nextRoutines = previousRoutines.map(routine =>
      routine.id === id ? { ...routine, ...updates, source: 'custom' as const, updatedAt: new Date() } : routine,
    );
    queueRemovedMedia(profile, previousRoutines, nextRoutines, 'attachment-detached');
    updateCurrentProfile({
      health: {
        ...currentHealth,
        workoutRoutines: nextRoutines,
      },
    });
  };

  const deleteWorkoutRoutine = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    const previousRoutines = currentHealth.workoutRoutines || [];
    const nextRoutines = previousRoutines.filter(routine => routine.id !== id);
    queueRemovedMedia(profile, previousRoutines, nextRoutines, 'record-deleted');
    const targets = new Set([healthLinkedTargetKey({ type: 'workout-routine', entityId: id })]);
    const clearedRoutines = clearHealthLinksAndEvidenceFromRoutines(profile.dailyChecklistItems || [], targets);
    updateCurrentProfile({
      health: {
        ...currentHealth,
        workoutRoutines: nextRoutines,
      },
      dailyChecklistItems: clearedRoutines,
      productivityItems: clearHealthLinksFromTasks(profile.productivityItems || [], targets),
    });
  };

  const addFastingSession = (
    session: Omit<FastingSession, "id" | "createdAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;

    const startedAt = parseLocalDateValue(session.startedAt);
    const endedAt = session.endedAt == null ? null : parseLocalDateValue(session.endedAt);
    if (!startedAt || (session.endedAt != null && !endedAt) || !isValidFastingSession({ startedAt, endedAt })) return undefined;
    if (session.targetMinutes != null && !isValidFastingTarget(session.targetMinutes)) return undefined;

    const currentHealth = normalizeHealth(profile.health);
    const currentFastingSessions = currentHealth.fastingSessions || [];
    if (endedAt === null && hasConflictingActiveFastingSession(currentFastingSessions)) return undefined;

    const now = new Date();
    const id = session.id || createEntityId('fasting-session');
    const nextSession: FastingSession = {
      ...session,
      id,
      startedAt,
      endedAt,
      targetMinutes: session.targetMinutes == null ? undefined : Number(session.targetMinutes),
      notes: session.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        fastingSessions: [...currentFastingSessions, nextSession],
      },
    });
    return id;
  };

  const updateFastingSession = (id: string, updates: Partial<FastingSession>) => {
    const profile = getCurrentProfile();
    if (!profile) return false;
    const currentHealth = normalizeHealth(profile.health);
    const currentFastingSessions = currentHealth.fastingSessions || [];
    const current = currentFastingSessions.find(item => item.id === id);
    if (!current) return false;

    const startedAt = updates.startedAt === undefined ? current.startedAt : parseLocalDateValue(updates.startedAt);
    const hasEndedAt = Object.prototype.hasOwnProperty.call(updates, 'endedAt');
    const endedAt = hasEndedAt
      ? updates.endedAt == null ? null : parseLocalDateValue(updates.endedAt)
      : current.endedAt;
    const targetMinutes = Object.prototype.hasOwnProperty.call(updates, 'targetMinutes')
      ? updates.targetMinutes == null ? undefined : Number(updates.targetMinutes)
      : current.targetMinutes;
    if (!startedAt || (endedAt !== null && !endedAt) || !isValidFastingSession({ startedAt, endedAt })) return false;
    if (targetMinutes != null && !isValidFastingTarget(targetMinutes)) return false;
    if (endedAt === null && hasConflictingActiveFastingSession(currentFastingSessions, id)) return false;

    const nextSession: FastingSession = {
      ...current,
      startedAt,
      endedAt,
      targetMinutes,
      notes: updates.notes === undefined ? current.notes : updates.notes.trim() || undefined,
      updatedAt: new Date(),
    };
    const transitionedToCompleted = current.endedAt == null && nextSession.endedAt != null;
    const mutation = applyHealthMutation(
      profile,
      {
        ...currentHealth,
        fastingSessions: currentFastingSessions.map(item => item.id === id ? nextSession : item),
      },
      transitionedToCompleted ? [{ kind: 'fasting', session: nextSession }] : [],
    );
    if (transitionedToCompleted && mutation.completedRoutineIds.length > 0) {
      publishFeedback({
        actionId: `health-evidence:fasting:${id}`,
        kind: 'success',
        title: 'Fast completed',
        description: `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
    return true;
  };

  const deleteFastingSession = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    updateCurrentProfile({
      health: {
        ...currentHealth,
        fastingSessions: (currentHealth.fastingSessions || []).filter(item => item.id !== id),
      },
    });
  };

  const addWorkoutSession = (
    session: Omit<WorkoutSession, "id" | "createdAt"> & { id?: string },
  ): string | undefined => {
    const profile = getCurrentProfile();
    if (!profile) return undefined;
    const id = session.id || createEntityId('workout-session');
    const nextSession: WorkoutSession = { ...session, id, createdAt: new Date() };
    const currentHealth = normalizeHealth(profile.health);
    const currentSessions = currentHealth.workoutSessions || [];
    const mutation = applyHealthMutation(
      profile,
      {
        ...currentHealth,
        workoutSessions: [...currentSessions, nextSession],
      },
      nextSession.status === 'completed'
        ? [{ kind: 'workout-session' as const, session: nextSession }]
        : [],
    );
    if (mutation.completedRoutineIds.length > 0) {
      publishFeedback({
        actionId: `health-evidence:workout-session:${id}`,
        kind: 'success',
        title: 'Workout completed',
        description: `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
    return id;
  };

  const updateWorkoutSession = (id: string, updates: Partial<WorkoutSession>) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const currentHealth = normalizeHealth(profile.health);
    const currentSessions = currentHealth.workoutSessions || [];
    const currentSession = currentSessions.find(session => session.id === id);
    if (!currentSession) return;
    const nextSession = { ...currentSession, ...updates };
    const transitionedToCompleted = currentSession.status !== 'completed' && nextSession.status === 'completed';
    const mutation = applyHealthMutation(
      profile,
      {
        ...currentHealth,
        workoutSessions: currentSessions.map(session =>
          session.id === id ? nextSession : session,
        ),
      },
      transitionedToCompleted
        ? [{ kind: 'workout-session' as const, session: nextSession }]
        : [],
    );
    if (transitionedToCompleted && mutation.completedRoutineIds.length > 0) {
      publishFeedback({
        actionId: `health-evidence:workout-session:${id}`,
        kind: 'success',
        title: 'Workout completed',
        description: `${mutation.completedRoutineIds.length} Life Hub routine${mutation.completedRoutineIds.length === 1 ? '' : 's'} completed.`,
      });
    }
  };

  const deleteWorkoutSession = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;
    updateCurrentProfile({
      health: {
        ...normalizeHealth(profile.health),
        workoutSessions: (profile.health?.workoutSessions || []).filter(session => session.id !== id),
      },
    });
  };

  const addNoXTracker = (tracker: Omit<NoXTracker, "id" | "createdAt">) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    const newTracker: NoXTracker = {
      ...tracker,
      id: createEntityId("nox"),
      createdAt: new Date(),
      startDate: parseLocalDateValue(tracker.startDate) || new Date(),
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        noXTrackers: [...(currentHealth.noXTrackers || []), newTracker],
      },
    });
  };

  const updateNoXTracker = (id: string, updates: Partial<NoXTracker>) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        noXTrackers: (currentHealth.noXTrackers || []).map((tracker) =>
          tracker.id === id
            ? {
                ...tracker,
                ...updates,
                startDate: updates.startDate
                  ? parseLocalDateValue(updates.startDate) || tracker.startDate
                  : tracker.startDate,
              }
            : tracker,
        ),
      },
    });
  };

  const deleteNoXTracker = (id: string) => {
    const profile = getCurrentProfile();
    if (!profile) return;

    const currentHealth = profile.health || {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],

      activityEntries: [],

      noXTrackers: [],
    };

    updateCurrentProfile({
      health: {
        ...currentHealth,
        noXTrackers: (currentHealth.noXTrackers || []).filter(
          (tracker) => tracker.id !== id,
        ),
      },
    });
  };

  // Data management
  const exportData = (): string => {
    const profile = getCurrentProfile();

    if (!profile) return "{}";

    return JSON.stringify(profile, null, 2);
  };

  const importData = (jsonData: string, mergeMode: boolean) => {
    try {
      const imported = JSON.parse(jsonData);

      const profile = getCurrentProfile();

      if (!profile) return;

      if (mergeMode) {
        updateCurrentProfile({
          wallets: [...profile.wallets, ...(imported.wallets || [])],

          transactions: [
            ...(profile.transactions || []),
            ...normalizeTransactions(imported.transactions),
          ],

          inventoryItems: [
            ...profile.inventoryItems,
            ...(imported.inventoryItems || []),
          ],

          wishlistItems: [
            ...profile.wishlistItems,
            ...normalizeWishlistItems(imported.wishlistItems),
          ],

          journalEntries: [
            ...profile.journalEntries,
            ...(imported.journalEntries || []).map(normalizeJournalEntry),
          ],

          games: normalizeGames([
            ...profile.games,
            ...(imported.games || []),
          ]),

          gameGuides: normalizeGameGuides([
            ...(profile.gameGuides || []),
            ...(imported.gameGuides || []),
          ]),

          productivityItems: [
            ...(profile.productivityItems || []),
            ...(imported.productivityItems || []),
          ],

          mediaItems: [
            ...(profile.mediaItems || []),
            ...(imported.mediaItems || []).map(normalizeMediaItem),
          ],

          books: [
            ...(profile.books || []),
            ...normalizeBooks(imported.books),
          ],

          musicItems: normalizeMusicItems([
            ...(profile.musicItems || []),
            ...(imported.musicItems || []),
          ]),

          personalVaultItems: normalizePersonalVaultItems([
            ...(profile.personalVaultItems || []),
            ...(imported.personalVaultItems || []),
          ]),

          ...(() => {
            const normalized = normalizeCareerCollections(
              [...(profile.careerSkills || []), ...(imported.careerSkills || [])],
              [...(profile.careerCourses || []), ...(imported.careerCourses || [])],
              [...(profile.careerCredentials || []), ...(imported.careerCredentials || [])],
            );
            return {
              careerSkills: normalized.skills,
              careerCourses: normalized.courses,
              careerCredentials: normalized.credentials,
            };
          })(),

          personalVaultTaxonomy: normalizePersonalVaultTaxonomy([
            ...(profile.personalVaultTaxonomy || []),
            ...(imported.personalVaultTaxonomy || []),
          ]),

          skincareProducts: [
            ...profile.skincareProducts,
            ...normalizeSkincareProducts(imported.skincareProducts),
          ],
          skincareUsageEvents: normalizeSkincareUsageEvents([
            ...(profile.skincareUsageEvents || []),
            ...(imported.skincareUsageEvents || []),
          ]),

          dailyChecklistItems: [
            ...(profile.dailyChecklistItems || []),
            ...(imported.dailyChecklistItems || []),
          ],

          importantDates: [
            ...(profile.importantDates || []),
            ...(imported.importantDates || []).map(normalizeImportantDateItem),
          ],

          balanceCheckIns: [
            ...(profile.balanceCheckIns || []),
            ...(imported.balanceCheckIns || []),
          ],

          supplements: [
            ...profile.supplements,
            ...normalizeSupplements(imported.supplements),
          ],

          workItems: [
            ...(profile.workItems || []),
            ...(imported.workItems || []).map(normalizeWorkItem),
          ],

          health: {
            ...(profile.health || {}),

            ...(imported.health || {}),

            weightEntries: [
              ...(profile.health?.weightEntries || []),
              ...(imported.health?.weightEntries || []),
            ],

            waterEntries: [
              ...(profile.health?.waterEntries || []),
              ...(imported.health?.waterEntries || []),
            ],

            bodyMeasurementEntries: [
              ...(profile.health?.bodyMeasurementEntries || []),
              ...(imported.health?.bodyMeasurementEntries || []),
            ],

            nutritionEntries: [
              ...(profile.health?.nutritionEntries || []),
              ...(imported.health?.nutritionEntries || []),
            ],

            foodEntries: [
              ...(profile.health?.foodEntries || []),
              ...(imported.health?.foodEntries || []),
            ],

            foodLogCompletedDates: Array.from(
              new Set([
                ...(profile.health?.foodLogCompletedDates || []),
                ...(imported.health?.foodLogCompletedDates || []),
              ]),
            ).sort(),

            favoriteWorkoutExerciseIds: Array.from(new Set([
              ...(profile.health?.favoriteWorkoutExerciseIds || []),
              ...(imported.health?.favoriteWorkoutExerciseIds || []),
            ].filter(id => typeof id === 'string' && id.trim().length > 0).map(id => id.trim()))),

            activityEntries: [
              ...(profile.health?.activityEntries || []),
              ...(imported.health?.activityEntries || []),
            ],
            fastingSessions: [
              ...(profile.health?.fastingSessions || []),
              ...(imported.health?.fastingSessions || []),
            ],
            workoutPlans: [
              ...(profile.health?.workoutPlans || []),
              ...(imported.health?.workoutPlans || []),
            ],
            workoutExercises: [
              ...(profile.health?.workoutExercises || []),
              ...(imported.health?.workoutExercises || []),
            ],
            workoutRoutines: [
              ...(profile.health?.workoutRoutines || []),
              ...(imported.health?.workoutRoutines || []),
            ],
            workoutSessions: [
              ...(profile.health?.workoutSessions || []),
              ...(imported.health?.workoutSessions || []),
            ],
            noXTrackers: [
              ...(profile.health?.noXTrackers || []),
              ...(imported.health?.noXTrackers || []),
            ],

            foodTemplates: [
              ...(profile.health?.foodTemplates || []),
              ...(imported.health?.foodTemplates || []),
            ],
          },
        });
      } else {
        updateCurrentProfile({
          ...imported,

          personalVaultItems: normalizePersonalVaultItems(
            imported.personalVaultItems,
          ),
          ...(() => {
            const normalized = normalizeCareerCollections(
              imported.careerSkills,
              imported.careerCourses,
              imported.careerCredentials,
            );
            return {
              careerSkills: normalized.skills,
              careerCourses: normalized.courses,
              careerCredentials: normalized.credentials,
            };
          })(),
          personalVaultTaxonomy: normalizePersonalVaultTaxonomy(
            imported.personalVaultTaxonomy,
          ),
          inventoryItems: normalizeInventoryItems(imported.inventoryItems),
          wishlistItems: normalizeWishlistItems(imported.wishlistItems),
          skincareProducts: normalizeSkincareProducts(imported.skincareProducts),
          skincareUsageEvents: normalizeSkincareUsageEvents(imported.skincareUsageEvents),
          supplements: normalizeSupplements(imported.supplements),
          games: normalizeGames(imported.games),
          gameGuides: normalizeGameGuides(imported.gameGuides),
          mediaItems: (imported.mediaItems || []).map(normalizeMediaItem),
          books: normalizeBooks(imported.books),
          musicItems: normalizeMusicItems(imported.musicItems),
          dailyChecklistItems: imported.dailyChecklistItems || [],

          importantDates: (imported.importantDates || []).map(normalizeImportantDateItem),
          journalEntries: (imported.journalEntries || []).map(normalizeJournalEntry),
          workItems: (imported.workItems || []).map(normalizeWorkItem),
          health: {
            heightCm: imported.health?.heightCm,

            targetCalories: imported.health?.targetCalories ?? 2100,

            targetProtein: imported.health?.targetProtein ?? 120,

            targetWaterMl: imported.health?.targetWaterMl ?? 3000,

            vapeTracker: imported.health?.vapeTracker || {
              quitDate: null,
              dailySpendBefore: 0,
            },

            weightEntries: imported.health?.weightEntries || [],

            waterEntries: imported.health?.waterEntries || [],

            bodyMeasurementEntries: imported.health?.bodyMeasurementEntries || [],

            nutritionEntries: imported.health?.nutritionEntries || [],

            foodEntries: imported.health?.foodEntries || [],

            foodLogCompletedDates: imported.health?.foodLogCompletedDates || [],

            activityEntries: imported.health?.activityEntries || [],

            fastingSessions: imported.health?.fastingSessions || [],

            workoutPlans: imported.health?.workoutPlans || [],

            workoutExercises: imported.health?.workoutExercises || [],

            workoutRoutines: imported.health?.workoutRoutines || [],

            workoutSessions: imported.health?.workoutSessions || [],

            foodTemplates: imported.health?.foodTemplates || [],
            favoriteWorkoutExerciseIds: imported.health?.favoriteWorkoutExerciseIds || [],

            noXTrackers: imported.health?.noXTrackers || [],
          },
        });
      }
    } catch (e) {
      console.error("Failed to import data:", e);
    }
  };
  if (!isHydrated) {
    return null;
  }

  // Helper function for Skincare stats (used by SkincareTracker). This is
  // the single source of truth for current/actual duration, typical
  // duration, and estimated remaining days - reused by the repurchase flow
  // below instead of recomputed separately.
  const getSkincareProductStats = (productId: string) => {
    const profile = getCurrentProfile();
    const now = new Date();
    const emptyStats = {
      daysUsed: null,
      costPerDay: null,
      actualUsagePerDay: null,
      usageUnit: null,
      isFinished: false,
      todayUses: 0,
      totalUses: 0,
      lastUsedAt: undefined,
      typicalDurationDays: null,
      estimatedRemainingDays: null,
    };

    if (!profile) return emptyStats;
    const product = profile.skincareProducts.find((p) => p.id === productId);
    if (!product) return emptyStats;
    const usageSummary = getSkincareUsageSummary(profile.skincareUsageEvents || [], productId, now);
    const isFinished = product.status === "emptied";
    const daysUsed = getSkincareCycleDaysUsed(product, now);
    const typicalDurationDays = getSkincareTypicalDurationDays(product, profile.skincareProducts, now);
    const boughtPrice = product.purchasePrice ?? null;
    const knownPurchasePrice = boughtPrice !== null && Number.isFinite(boughtPrice) && boughtPrice >= 0
      ? boughtPrice
      : null;

    if (daysUsed === null) {
      const estimatedCostPerDay = !isFinished && knownPurchasePrice !== null && typicalDurationDays !== null && typicalDurationDays > 0
        ? knownPurchasePrice / typicalDurationDays
        : null;
      return { ...emptyStats, isFinished, typicalDurationDays, costPerDay: estimatedCostPerDay, ...usageSummary };
    }

    const sizeMatch = String(product.size || "").match(
      /^\s*(\d+(?:\.\d+)?)\s*(.+?)\s*$/,
    );
    const sizeValue = sizeMatch ? Number(sizeMatch[1]) : 0;
    const usageUnit = sizeMatch?.[2] || null;
    const actualUsagePerDay =
      isFinished && sizeValue > 0 ? sizeValue / daysUsed : null;
    const estimatedRemainingDays = !isFinished && typicalDurationDays !== null
      ? Math.max(0, typicalDurationDays - daysUsed)
      : null;
    // Finished cycles use their actual completed duration; active cycles use
    // the typical/estimated duration so cost/day doesn't spike near day one.
    const costPerDayDuration = isFinished ? daysUsed : typicalDurationDays;
    const costPerDay = knownPurchasePrice !== null && costPerDayDuration !== null && costPerDayDuration > 0
      ? knownPurchasePrice / costPerDayDuration
      : null;

    return {
      daysUsed,
      costPerDay,
      actualUsagePerDay,
      usageUnit,
      isFinished,
      typicalDurationDays,
      estimatedRemainingDays,
      ...usageSummary,
    };
  };

  // Helper function for Supplement stats (used by SupplementsTracker)
  const getSupplementStats = (supplementId: string) => {
    const profile = getCurrentProfile();

    const emptyStats = {
      daysUsed: 0,
      daysRemaining: 0,
      depletionDate: new Date(),
    };

    if (!profile) return emptyStats;

    const supplement = profile.supplements.find((s) => s.id === supplementId);

    if (!supplement) return emptyStats;

    if (!supplement.startDate) {
      return emptyStats;
    }

    const startDate = new Date(supplement.startDate);

    if (isNaN(startDate.getTime())) {
      return emptyStats;
    }

    const today = new Date();

    const daysUsed = Math.max(
      0,
      Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const estimatedDuration = supplement.estimatedDuration || 0;

    const daysRemaining = Math.max(0, estimatedDuration - daysUsed);

    const depletionDate = new Date(today);

    depletionDate.setDate(depletionDate.getDate() + daysRemaining);

    return {
      daysUsed,
      daysRemaining,
      depletionDate,
    };
  };

  const getWalletBalanceByType = (type: Wallet["type"]): number => {
    const profile = getCurrentProfile();
    if (!profile) return 0;

    return profile.wallets
      .filter((wallet) => wallet.type === type)
      .reduce((sum, wallet) => sumMoney([sum, toNumber(wallet.balance)]), 0);
  };

  const getCashOnHandBalance = (): number =>
    getWalletBalanceByType("cash_on_hand");

  const getFreeSpendingBalance = (): number =>
    getWalletBalanceByType("free_spending");

  const getSavingsBalance = (): number => getWalletBalanceByType("savings");

  const getInvestmentBalance = (): number =>
    getWalletBalanceByType("investment");

  const getAvailableBudget = (): number => getFreeSpendingBalance();

  const hasFocusActivity = Boolean(
    currentProfile?.productivityItems?.some(item => item.status === 'in-progress') ||
    currentProfile?.workItems?.some(item => item.type === 'task' && item.status === 'active') ||
    currentProfile?.dailyChecklistItems?.some(item =>
      item.active && isRoutineDueForDate(item, new Date()) && !isRoutineDoneForDate(item, new Date()),
    ),
  );

  const value: AppContextType = {
    profiles,
    currentProfileId,
    isHydrated,
    isFreshInstall,
    getCashOnHandBalance,
    getFreeSpendingBalance,
    getSavingsBalance,
    getInvestmentBalance,
    getAvailableBudget,
    addProfile,
    deleteProfile,
    clearWorkspaceState,
    beginDemoTransition,
    prepareCloudBackup,
    beginCloudRestore,
    switchProfile,
    updateProfile,
    saveWorkSetupForProfile,
    getCurrentProfile,
    pet: currentPet,
    mochiReaction:
      mochiReactionState === 'happy'
        ? 'happy'
        : hasFocusActivity ? 'focus' : 'idle',
    updatePet,
    wallets: currentProfile?.wallets || [],
    transactions: currentProfile?.transactions || [],
    addWallet,
    updateWallet,
    deleteWallet,
    getTotalWalletBalance,
    addTransaction,
    recordRecurringOccurrence,
    resolveRecurringOccurrence,
    updateTransaction,
    updateTransactionReportingStatus,
    connectTransactionWallet,
    deleteTransaction,
    deleteTransactions,
    clearTransactions,
    recordWalletAdjustment,
    reconcileWalletBalances,
    upcomingMoneyItems: currentProfile?.upcomingMoneyItems || [],
    addUpcomingMoneyItem,
    updateUpcomingMoneyItem,
    deleteUpcomingMoneyItem,
    inventoryItems: currentProfile?.inventoryItems || [],
    addInventoryItem,
    updateInventoryItem,
    renameInventoryCategoryRecords,
    renameInventorySubcategoryRecords,
    deleteInventoryItem,
    getTotalInventoryValue,
    getTotalAssets,
    wishlistItems: currentProfile?.wishlistItems || [],
    addWishlistItem,
    updateWishlistItem,
    renameWishlistCategoryRecords,
    deleteWishlistItem,
    completeWishlistItemToInventory,
    getTotalSelectedWishlistCost,
    getRemainingBalance,
    journalEntries: currentProfile?.journalEntries || [],
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    getJournalEntryByDate,
    games: currentProfile?.games || [],
    addGame,
    updateGame,
    deleteGame,
    gameGuides: currentProfile?.gameGuides || [],
    addGameGuide,
    updateGameGuide,
    deleteGameGuide,
    productivityItems: currentProfile?.productivityItems || [],

    addProductivityItem,
    updateProductivityItem,
    completeProductivityItem,
    completeProductivityItemForProfile,
    deferProductivityItem,
    dropProductivityItem,
    reopenProductivityItem,
    convertIdeaToTask,
    deleteProductivityItem,

    mediaItems: currentProfile?.mediaItems || [],

    addMediaItem,
    updateMediaItem,
    deleteMediaItem,
    books: currentProfile?.books || [],
    addBook,
    updateBook,
    deleteBook,
    musicItems: currentProfile?.musicItems || [],

    addMusicItem,
    updateMusicItem,
    recordMusicPlay,
    deleteMusicItem,
    workItems: (currentProfile as any)?.workItems || [],
    updateWorkItemsForProfile,
    completeWorkItemForProfile,
    personalVaultItems: (currentProfile as any)?.personalVaultItems || [],
    addPersonalVaultItem,
    updatePersonalVaultItem,
    deletePersonalVaultItem,
    careerSkills: currentProfile?.careerSkills || [],
    addCareerSkill,
    updateCareerSkill,
    deleteCareerSkill,
    careerCourses: currentProfile?.careerCourses || [],
    addCareerCourse,
    updateCareerCourse,
    deleteCareerCourse,
    careerCredentials: currentProfile?.careerCredentials || [],
    addCareerCredential,
    updateCareerCredential,
    deleteCareerCredential,
    trashItems: (currentProfile as any)?.trashItems || [],
    moveToTrash,
    restoreTrashItem,
    deleteTrashItemPermanently,
    deleteTrashItemsPermanently,
    skincareProducts: currentProfile?.skincareProducts || [],
    skincareUsageEvents: currentProfile?.skincareUsageEvents || [],

    dailyChecklistItems: currentProfile?.dailyChecklistItems || [],

    addDailyChecklistItem,
    updateDailyChecklistItem,
    deleteDailyChecklistItem,
    toggleDailyChecklistItem,
    toggleRoutineOccurrence,
    setRoutineProgress,
    adjustRoutineProgress,
    completeRoutineOccurrenceForProfile,
    skipRoutineOccurrence,
    recoverRoutineOccurrence,

    importantDates: currentProfile?.importantDates || [],

    addImportantDate,
    updateImportantDate,
    deleteImportantDate,
    resolveImportantDate,

    addSkincareProduct,

    updateSkincareProduct,
    renameSkincareCategoryRecords,

    deleteSkincareProduct,

    markSkincareProductEmptied,

    restoreSkincareProduct,

    repurchaseSkincareProduct,

    getSkincareProductStats,
    logSkincareUsage,
    updateSkincareUsageEvent,
    deleteSkincareUsageEvent,
    completeSkincareRoutineOccurrence,
    completeSupplementRoutineOccurrence,
    supplements: currentProfile?.supplements || [],
    addSupplement,
    updateSupplement,
    deleteSupplement,
    getSupplementStats,

    health: currentHealth,

    updateHealthProfile,
    addFoodEntry,
    addFoodEntries,
    updateFoodEntry,
    deleteFoodEntry,
    deleteFoodEntries,

    addActivityEntry,
    deleteActivityEntry,

    fastingSessions: currentHealth.fastingSessions || [],
    addFastingSession,
    updateFastingSession,
    deleteFastingSession,

    workoutPlans: currentProfile?.health?.workoutPlans || [],
    addWorkoutPlan,
    updateWorkoutPlan,
    deleteWorkoutPlan,

    workoutExercises: currentProfile?.health?.workoutExercises || [],
    workoutRoutines: currentProfile?.health?.workoutRoutines || [],
    workoutSessions: currentProfile?.health?.workoutSessions || [],
    addWorkoutExercise,
    updateWorkoutExercise,
    deleteWorkoutExercise,
    addWorkoutRoutine,
    updateWorkoutRoutine,
    deleteWorkoutRoutine,
    addWorkoutSession,
    updateWorkoutSession,
    deleteWorkoutSession,

    foodTemplates: currentProfile?.health?.foodTemplates || [],

    addFoodTemplate,
    updateFoodTemplate,
    deleteFoodTemplate,

    addWeightEntry,
    updateWeightEntry,
    deleteWeightEntry,
    addWaterEntry,
    deleteWaterEntry,
    addBodyMeasurementEntry,
    updateBodyMeasurementEntry,
    deleteBodyMeasurementEntry,

    addNoXTracker,
    updateNoXTracker,
    deleteNoXTracker,

    exportData,
    importData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
