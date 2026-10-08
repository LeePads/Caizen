// Wallet Types - Simplified for Asset System
export type WalletType =
  | "cash_on_hand"
  | "free_spending"
  | "savings"
  | "investment";
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  color: string;
  type: WalletType;
  /** Optional profile-scoped managed media reference for wallet identity. */
  avatarAssetId?: string;

  useForWishlist?: boolean;
  includeInSpendable?: boolean;
  isProtected?: boolean;
  purpose?: string;
  goalTarget?: number;
  goalDeadline?: string;

  createdAt: Date;
}

export type TransactionType = "income" | "expense" | "transfer" | "adjustment";
export type AdjustmentDirection = "increase" | "decrease";

/**
 * The Caizen record modules a Transaction may optionally link to. Kept
 * intentionally small - only modules with a stable record ID and an
 * existing cross-section navigation path are included.
 */
export type LinkedRecordModule = "inventory" | "skincare" | "supplements" | "books" | "games";

/**
 * A single optional link from a Transaction to one existing Caizen record.
 * The relationship lives only here - target records (Inventory, Skincare,
 * Supplements, Books, Games) are never given a reverse field; a "does this
 * record have a transaction" lookup is derived by scanning transactions for
 * a matching linkedRecord instead.
 */
export interface TransactionLinkedRecord {
  module: LinkedRecordModule;
  recordId: string;
}

/**
 * A profile-local money movement. Amounts are stored as positive values;
 * direction is expressed by the transaction type (or adjustmentDirection).
 * Transfer principal is excluded from reports while its optional fee remains
 * reportable as an expense.
 */
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  walletId: string;
  destinationWalletId?: string;
  fee?: number;
  adjustmentDirection?: AdjustmentDirection;
  categoryId?: string;
  subcategoryId?: string;
  date: Date;
  notes?: string;
  /** What the money was for, e.g. "Car". Distinct from `payee` (who was paid, e.g. "Toyota dealership"). */
  title?: string;
  payee?: string;
  excludeFromReports?: boolean;
  source?: string;
  sourceKey?: string;
  /** Optional link to exactly one existing Inventory/Skincare/Supplement/Book/Game record. */
  linkedRecord?: TransactionLinkedRecord;
  createdAt: Date;
  updatedAt?: Date;
}

export type CurrencyCode =
  | "PHP"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "AUD"
  | "CAD"
  | "SGD"
  | "CHF"
  | "CNY"
  | "INR"
  | "KRW"
  | "MXN"
  | "NZD"
  | "HKD"
  | "SEK"
  | "NOK"
  | "DKK"
  | "THB"
  | "ZAR"
  | "BRL"
  | "PLN";

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

export interface BalanceProjectionRecurrence {
  frequency: RecurrenceFrequency;
  startDateKey: string;
  endDateKey?: string;
  nextDueDateKey: string;
  walletId: string;
  categoryId?: string;
  subcategoryId?: string;
  payee?: string;
  notes?: string;
}

export interface BalanceProjectionRow {
  id: string;
  label: string;
  amount: string;
  allocated: string;
  type: "income" | "expense";
  dueDay?: number;
  active?: boolean;
  cycleKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
  recurrence?: BalanceProjectionRecurrence;
}

export type RecurringOccurrenceOverrides = {
  amount?: number;
  dateKey?: string;
  walletId?: string;
  categoryId?: string;
  subcategoryId?: string;
  payee?: string;
  notes?: string;
};

export type RecurringActionResult = {
  ok: boolean;
  transactionId?: string;
  scheduledDateKey?: string;
  error?: string;
};

/**
 * A profile-local monthly expense allocation. Spending is always derived from
 * transactions; only the allocation itself is persisted.
 */
export interface Budget {
  id: string;
  month: string;
  categoryId: string;
  subcategoryId?: string;
  allocated: number;
  /** When true, this allocation continues into future months until turned off. */
  recurring?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UpcomingMoneyDirection = "outgoing" | "incoming";

export type UpcomingMoneyCategory =
  | "gift"
  | "purchase"
  | "repayment"
  | "reimbursement"
  | "refund"
  | "freelance"
  | "deposit"
  | "repair"
  | "travel"
  | "education"
  | "medical"
  | "other";

export type UpcomingMoneyStatus =
  | "planned"
  | "partially-paid"
  | "paid"
  | "received"
  | "overdue"
  | "cancelled";

export interface UpcomingMoneyItem {
  id: string;
  title: string;
  direction: UpcomingMoneyDirection;
  amount: number;
  dueDate?: Date;
  person?: string;
  category: UpcomingMoneyCategory;
  walletId?: string;
  status: UpcomingMoneyStatus;
  /** Cumulative amount already paid or received. */
  recordedAmount: number;
  /** Outgoing items only: subtract the remaining amount from conservative safe-to-spend. */
  reserveFunds?: boolean;
  /** Explicit user-created local reminder intent. Due dates never imply this. */
  reminderEnabled?: boolean;
  /** Local calendar date (YYYY-MM-DD) chosen for the explicit reminder. */
  reminderDate?: string;
  /** Local wall-clock time (HH:mm) chosen for the explicit reminder. */
  reminderTime?: string;
  linkedWishlistItemId?: string;
  linkedInventoryItemId?: string;
  notes?: string;
  archived?: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BalanceWalletSnapshot {
  walletId: string;
  name: string;
  balance: number;
}

export interface BalanceCheckIn {
  id: string;
  weekKey: string;
  completedAt: Date;
  walletBalances: BalanceWalletSnapshot[];
  totalWalletBalance: number;
  spendableBalance: number;
  protectedBalance: number;
  remainingCommitments: number;
  safeToSpend: number;
  reflection?: string;
  /** Legacy weekly-review field. Optional because the simplified balance refresh no longer asks for it. */
  nextAction?: string;
}

export type FinancialKind = "good" | "leak" | "neutral";

export interface FinancialSubcategory {
  id: string;
  name: string;
  /** Stable key for the local finance icon catalog. */
  icon?: string;
  total: string;
  kind?: FinancialKind;
}

export interface FinancialCategory {
  id: string;
  type: "income" | "expense";
  name: string;
  /** Stable key for the local finance icon catalog. */
  icon?: string;
  total: string;
  kind: FinancialKind;
  notes?: string;
  subcategories: FinancialSubcategory[];
}

// Inventory Types - Asset System
export type InventoryCategory =
  | "personal-tech"
  | "personal_tech"
  | "utilities"
  | "wearables"
  | "home";

export type InventoryStatus =
  | "using"
  | "stored"
  | "maintenance"
  | "replace"
  | "retired"
  | "archived";

export interface InventoryItem {
  id: string;
  profileId?: string;
  name: string;
  quantity: number;
  unit: string;
  category: InventoryCategory;
  purchaseDate: Date;
  /** Legacy field: user-facing Current Value (estimated value for one unit now). */
  purchasePrice?: number;
  /** Legacy field: user-facing Purchase Cost (amount paid for one unit). */
  currentPrice?: number;
  /** Estimated amount required to buy an equivalent replacement today. */
  replacementCost?: number;
  /** Last time the estimated Current Value was reviewed. */
  currentValueUpdatedAt?: Date;
  image?: string;
  photoAssetIds?: string[];
  receiptAssetIds?: string[];
  notes?: string;
  status?: InventoryStatus;
  productLink?: string;
  createdAt: Date;
  subCategory?: string;
  acquisitionType?: "bought" | "included" | "gift" | "free" | "unknown";
  storageLocation?: string;
}

// Skincare & Personal Care Tracker Types
export type SkincareArea = "Face" | "Body" | "Hair" | "Oral" | "Other";

/**
 * Backward-compatible category union. New records should use the title-cased
 * area values above; lower-case values remain accepted for legacy imports.
 */
export type SkincareCategory =
  | SkincareArea
  | "cleanser"
  | "moisturizer"
  | "serum"
  | "sunscreen"
  | "mask"
  | "toner"
  | "other";

export type SkincareProductType =
  | "cleanser"
  | "moisturizer"
  | "serum"
  | "sunscreen"
  | "toner"
  | "mask"
  | "treatment"
  | "shampoo"
  | "conditioner"
  | "body-wash"
  | "deodorant"
  | "oral-care"
  | "other";

export type SkincareFrequency = "Daily" | "Weekly" | "Custom";

export type SkincareSchedule = "morning" | "night" | "both";

export type SkincareRepurchaseDecision = "yes" | "no" | "maybe";

export interface SkincareFinishDetails {
  emptiedAt?: Date;
  emptiedNotes?: string;
  wouldRepurchase?: SkincareRepurchaseDecision;
}

export interface SkincareRepurchaseInput {
  purchasePrice?: number;
  currentPrice?: number | null;
  purchaseDate: Date;
  startDate?: Date;
  frequency?: SkincareFrequency;
  schedule?: SkincareSchedule;
  /** Starting typical-duration estimate for the new cycle. Falls back to the source product's usage history when omitted. */
  estimatedDuration?: number;
}

export interface SkincareProduct {
  id: string;
  name: string;
  category: SkincareCategory;
  productType?: SkincareProductType;
  /** Missing means not entered; zero is an explicitly free product. */
  purchasePrice?: number;
  currentPrice?: number;
  purchaseDate?: Date;
  startDate?: Date;
  /** Legacy estimate retained for compatibility with existing records. */
  estimatedDuration?: number;
  frequency: SkincareFrequency;
  schedule: SkincareSchedule;
  effects?: string;
  size?: string;
  photo?: string;
  photoAssetIds?: string[];
  productLink?: string;
  image?: string;
  status?: "active" | "emptied";
  emptiedAt?: Date | null;
  emptiedNotes?: string;
  wouldRepurchase?: SkincareRepurchaseDecision;
  /** Finished product that this replacement was copied from. */
  repurchaseOfProductId?: string;
  createdAt: Date;
}

// Supplements Tracker Types
export type SupplementType =
  | "vitamin"
  | "mineral"
  | "herb"
  | "protein"
  | "probiotic"
  | "other";

export type SupplementSchedule = "morning" | "night" | "with-meals" | "custom";

export interface Supplement {
  id: string;
  name: string;
  /**
   * Free-form Supplement Type, backed by the profile's flat "supplement-types"
   * taxonomy (see lib/module-taxonomy.ts). SupplementType lists the built-in
   * defaults, but the stored value is not restricted to that union so a
   * user-added type (or a historical value no longer in the active taxonomy)
   * is preserved rather than silently coerced.
   */
  type?: SupplementType | string;
  purchasePrice: number;
  currentPrice?: number;
  startDate: Date | null;
  expiryDate?: Date | null;
  dosage: string;
  /** Structured dosage fields retained alongside the legacy display string. */
  dosageAmount?: number;
  dosageUnit?: string;
  dailyIntake?: number;
  quantityRemaining: number;
  estimatedDuration?: number;
  schedule?: SupplementSchedule;
  effects?: string;
  productLink?: string;
  image?: string | null;
  /** Managed replacement for legacy inline supplement images. */
  photoAssetIds?: string[];
  createdAt: Date;

  // Local reminder notification (Android).
  reminderEnabled?: boolean;
  reminderTime?: string;
  reminderDays?: number[];
}

// Health Tracker Types
export interface VapeTracker {
  quitDate?: Date | null;
  dailySpendBefore?: number;
}

export interface WeightEntry {
  id: string;
  date: Date;
  weightKg: number;
  notes?: string;
  createdAt: Date;
}

export interface WaterEntry {
  id: string;
  date: Date;
  amountMl: number;
  createdAt: Date;
}

export interface BodyMeasurementEntry {
  id: string;
  date: Date;
  waistCm?: number;
  bodyFatPercent?: number;
  chestCm?: number;
  hipsCm?: number;
  upperArmCm?: number;
  thighCm?: number;
  createdAt: Date;
}

export interface NutritionEntry {
  id: string;
  date: Date;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  foodName?: string;
  notes?: string;
  createdAt: Date;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodTemplate {
  id: string;
  name: string;
  referenceWeightGrams: number;
  caloriesPerGram: number;
  proteinPerGram: number;
  carbsPerGram: number;
  fatPerGram: number;
  sodiumPerGram: number;
  fiberPerGram?: number;
  sugarPerGram?: number;
  /** Nutrition fields intentionally left blank when this saved food was created. */
  nutritionMissing?: NutritionField[];
  measurementOptions?: FoodMeasurementOption[];
  createdAt: Date;
}

export type FoodMeasurementUnit =
  | "g"
  | "quantity"
  | "tablespoon"
  | "teaspoon"
  | "ml"
  | "serving"
  | "can";

export interface FoodMeasurementOption {
  unit: FoodMeasurementUnit;
  label: string;
  grams?: number;
}

export interface FoodNutritionSnapshot {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  fiber: number;
  sugar?: number;
  /** Optional compatibility metadata; omitted means legacy values are trusted. */
  nutritionMissing?: NutritionField[];
}

export type NutritionField =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "sodium"
  | "fiber"
  | "sugar";

export interface MealTemplateFoodSnapshot {
  name: string;
  baseWeightGrams: number;
  nutrientsPerBaseWeight: FoodNutritionSnapshot;
  measurementOptions: FoodMeasurementOption[];
}

export interface MealTemplateRow {
  id?: string;
  foodId?: string;
  food?: MealTemplateFoodSnapshot;
  amount: number;
  unit: FoodMeasurementUnit;
  manualNutrition?: FoodNutritionSnapshot;
  manualNutritionBaseAmount?: number;
}

export interface MealTemplate {
  id: string;
  name: string;
  mealType: MealType;
  rows: MealTemplateRow[];
  createdAt: Date;
}

export interface FoodEntry {
  id: string;
  date: Date;
  /** Optional for legacy rows that were saved before meal type was required. */
  mealType?: MealType;
  /** Present only when the meal classification was explicitly selected/saved. */
  mealTypeSource?: "explicit";
  name: string;
  amount?: number;
  unit?: FoodMeasurementUnit;
  serving?: string;
  sourceFoodTemplateId?: string;
  sourceMealTemplateId?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  fiber?: number;
  sugar?: number;
  /** Fields marked here were left blank; numeric zero remains for old-record compatibility. */
  nutritionMissing?: NutritionField[];
  notes?: string;
  createdAt: Date;
}

export type ActivityIntensity = "light" | "moderate" | "vigorous";

export type WorkoutTargetMode = "timed" | "reps" | "hold" | "manual";
export type WorkoutDifficulty = "easy" | "moderate" | "hard";
export type WorkoutExerciseKind = "exercise" | "stretch";
export type WorkoutSideMode = "none" | "left-right";
/** Discovery metadata only. This never changes the runner or evidence semantics. */
export type WorkoutExerciseCategory = "strength" | "cardio" | "stretching" | "mobility";
export type WorkoutSource = "builtin" | "custom";
export type WorkoutSessionStatus = "completed" | "partial";
export type WorkoutSessionExerciseStatus = "pending" | "completed" | "skipped";
/** Device/session-local presentation choice for remote exercise animation. Never synced/persisted to a profile. */
export type WorkoutAnimationPreference = "full" | "compact" | "off";
export type WorkoutLoadMode = "none" | "external" | "bodyweight-plus" | "assistance";

export interface FastingSession {
  id: string;
  startedAt: Date;
  endedAt?: Date | null;
  targetMinutes?: number;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export type SkincareUsageSource = "manual" | "routine";

export interface SkincareUsageEvent {
  id: string;
  productId: string;
  usedAt: Date;
  source: SkincareUsageSource;
  routineId?: string;
  routineCompletionId?: string;
  productNameSnapshot?: string;
  createdAt: Date;
}

/** Reusable movement definition for the guided Workout workspace. */
export interface WorkoutExerciseDefinition {
  id: string;
  name: string;
  kind: WorkoutExerciseKind;
  category: string;
  exerciseCategory?: WorkoutExerciseCategory;
  equipment: string;
  difficulty: WorkoutDifficulty;
  targetMode: WorkoutTargetMode;
  /** Optional cue for movements that should be completed on each side. */
  sideMode?: WorkoutSideMode;
  /** Meaning of recorded load values. Missing legacy values are inferred from equipment when clear. */
  loadMode?: WorkoutLoadMode;
  defaultDurationSeconds?: number;
  defaultReps?: number;
  defaultSets?: number;
  defaultRestSeconds?: number;
  purpose?: string;
  instructions?: string;
  instructionSteps?: string[];
  formCues?: string[];
  notes?: string;
  source: WorkoutSource;
  /** Which catalog this record originated from. Absent for user-authored custom exercises. */
  catalogSource?: 'caizen' | 'opengym';
  /** Upstream identifier within catalogSource, e.g. the openGym dataset's numeric id. */
  catalogSourceId?: string;
  /** Primary target muscle, when the source catalog provides one. */
  primaryMuscle?: string;
  /** Additional muscles involved, when the source catalog provides them. */
  secondaryMuscles?: string[];
  /** Stable upstream media identifier (e.g. openGym's media_id) used only to resolve remote animation media at runtime. Never a URL, never downloaded media. */
  catalogMediaId?: string;
  referencePhotoAssetId?: string;
  referenceVideoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
  archived?: boolean;
}

export interface WorkoutRoutineItem {
  id: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  targetMode?: WorkoutTargetMode;
  durationSeconds?: number;
  reps?: number;
  /** Optional planned load. Absent for bodyweight/unweighted exercises. */
  targetWeight?: number;
  sets?: number;
  restSeconds?: number;
  /** Count of leading sets (per round) treated as warm-up rather than working sets. */
  warmupSets?: number;
  /** Adjacent items sharing this id execute as a superset (set-by-set, one shared rest). */
  supersetGroupId?: string;
  notes?: string;
  unavailableReference?: boolean;
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  description?: string;
  source: WorkoutSource;
  /** Optional profile-managed cover image for custom routines. */
  referencePhotoAssetId?: string;
  /** Optional tutorial URL for the routine cover/reference area. */
  referenceVideoUrl?: string;
  items: WorkoutRoutineItem[];
  rounds?: number;
  defaultRestSeconds?: number;
  estimatedDurationMinutes?: number;
  notes?: string;
  archived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkoutSessionExerciseSnapshot {
  slotId: string;
  exerciseId?: string;
  exerciseName: string;
  kind: WorkoutExerciseKind;
  targetMode: WorkoutTargetMode;
  targetDurationSeconds?: number;
  targetReps?: number;
  /** Planned load, when the routine item specified one. */
  targetWeight?: number;
  /** Load interpretation captured with the set; absent on legacy snapshots. */
  loadMode?: WorkoutLoadMode;
  setIndex: number;
  roundIndex: number;
  status: WorkoutSessionExerciseStatus;
  completedAt?: Date;
  /** A warm-up set: recordable, but excluded from working-set history, PR detection, and volume totals. */
  warmup?: boolean;
  /** What actually happened, only ever set when the user recorded it. Absent means not recorded, not zero. */
  actualReps?: number;
  actualWeight?: number;
  actualDurationSeconds?: number;
  /** Per-side actuals for unilateral (left-right) exercises. Ordinary exercises never populate these. */
  actualRepsLeft?: number;
  actualRepsRight?: number;
  actualWeightLeft?: number;
  actualWeightRight?: number;
  /** Optional, off by default effort ratings. Never required. */
  rir?: number;
  rpe?: number;
}

export interface WorkoutSession {
  id: string;
  routineId?: string;
  routineName: string;
  sourceRoutineId?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMinutes?: number;
  status: WorkoutSessionStatus;
  exercises: WorkoutSessionExerciseSnapshot[];
  completedExerciseCount: number;
  totalExerciseCount: number;
  roundsCompleted: number;
  difficulty?: WorkoutDifficulty;
  notes?: string;
  scheduleDate?: string;
  createdAt: Date;
}

export interface WorkoutPlanExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  durationMinutes?: number;
  distanceKm?: number;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  description?: string;
  exercises: WorkoutPlanExercise[];
  estimatedDurationMinutes?: number;
  estimatedCalories?: number;
  defaultIntensity?: ActivityIntensity;
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityEntry {
  id: string;
  date: Date;
  activity: string;
  durationMinutes?: number;
  intensity?: ActivityIntensity;
  caloriesBurned: number;
  workoutPlanId?: string;
  linkedRoutineId?: string;
  notes?: string;
  imageUrl?: string;
  photoAssetIds?: string[];
  createdAt: Date;
}

export type SleepQuality = "poor" | "fair" | "good" | "great";

/** Optional morning check-in: how the user felt after waking up. */
export type MorningMood = "poor" | "okay" | "good" | "great";

export interface SleepEntry {
  id: string;
  date: Date;
  hours: number;
  /** Canonical exact duration. Legacy records may omit this field. */
  sleepDurationMinutes?: number;
  quality?: SleepQuality;
  bedTime?: string;
  wakeTime?: string;
  /** Personal score the user enters themselves (e.g. from a wearable app they chose not to connect). Never calculated by Caizen. */
  sleepScore?: number;
  timesAwakened?: number;
  /** Optional morning check-in used as one input to the Caizen Sleep Score. */
  morningMood?: MorningMood;
  notes?: string;
  createdAt: Date;
}

/** Explicit Health mutation payload used by the bounded 6B evidence path. */
export type HealthEvidenceEvent =
  | {
      kind: "sleep";
      entry: Pick<SleepEntry, "date" | "sleepDurationMinutes" | "hours">;
    }
  | {
      kind: "food";
      entry: Pick<FoodEntry, "date" | "mealType" | "mealTypeSource">;
    }
  | {
      kind: "workout-session";
      session: Pick<WorkoutSession, "status" | "completedAt" | "routineId" | "sourceRoutineId" | "exercises">;
    }
  | {
      kind: "weight";
      entry: Pick<WeightEntry, "date">;
    }
  | {
      kind: "fasting";
      session: Pick<FastingSession, "endedAt">;
    }
  | {
      kind: "water";
      date: Date;
      previousTotalMl: number;
    };

export interface StreakPausePeriod {
  id: string;
  pausedAt: Date | string;
  resumedAt?: Date | string | null;
  reason?: string;
}

export interface NoXTracker {
  id: string;
  name: string;
  startDate: Date;
  notes?: string;
  pausedAt?: Date | string | null;
  resumeDate?: Date | string | null;
  pauseReason?: string;
  accumulatedPausedDays?: number;
  pauseHistory?: StreakPausePeriod[];
  resetHistory?: Array<{
    resetAt: Date | string;
    previousStartDate: Date | string;
    previousDays: number;
    reason?: string;
  }>;
  /** Missing legacy values preserve the historical calendar behavior. */
  showMilestonesInCalendar?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface HealthProfile {
  heightCm?: number;
  targetCalories?: number;
  maintenanceCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFat?: number;
  targetFiber?: number;
  sugarLimit?: number;
  targetWaterMl?: number;
  sodiumLimitMg?: number;
  vapeTracker?: VapeTracker;
  weightEntries: WeightEntry[];
  nutritionEntries: NutritionEntry[];
  foodEntries: FoodEntry[];
  foodLogCompletedDates?: string[];
  foodLogExcludedDates?: string[];
  foodTemplates: FoodTemplate[];
  mealTemplates?: MealTemplate[];
  favoriteFoodTemplateIds?: string[];
  favoriteMealTemplateIds?: string[];
  /** Profile-scoped exercise IDs; catalog definitions remain shared and read-only. */
  favoriteWorkoutExerciseIds?: string[];
  activityEntries: ActivityEntry[];
  fastingSessions?: FastingSession[];
  workoutPlans?: WorkoutPlan[];
  /** New guided-workout definitions; legacy plans remain in workoutPlans. */
  workoutExercises?: WorkoutExerciseDefinition[];
  workoutRoutines?: WorkoutRoutine[];
  workoutSessions?: WorkoutSession[];
  sleepEntries?: SleepEntry[];
  /** Optional sleep target in exact minutes. */
  sleepTargetMinutes?: number;
  /** Optional weekly exercise target in minutes. */
  targetExerciseMinutesPerWeek?: number;
  targetWeightKg?: number;
  noXTrackers: NoXTracker[];
  waterEntries?: WaterEntry[];
  bodyMeasurementEntries?: BodyMeasurementEntry[];
}

// Games Tracker Types
export type GameStatus =
  | "playing"
  | "active"
  | "backlog"
  | "dropped"
  | "completed"
  | "paused"
  | "upcoming"
  | "wishlist";

export type GamePlatform = "pc" | "mobile" | "console";

export type GameGenre =
  | "action"
  | "adventure"
  | "building/simulation"
  | "chill"
  | "fps"
  | "gacha"
  | "puzzle"
  | "racing"
  | "rpg"
  | "strategy"
  | "other";

export type GameGuideCategory =
  | "build"
  | "team_lineup"
  | "farming"
  | "boss_raid"
  | "progression"
  | "tips"
  | "checklist"
  | "other"
  | "builds"
  | "lineups"
  | "strategy"
  | "settings"
  | "walkthrough"
  | "general";

export type GameGuideResourceType = "uploaded-image" | "image-url" | "link";

export interface GameGuideResource {
  id: string;
  type: GameGuideResourceType;
  label?: string;
  value: string;
}

export interface GameGuideItem {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  resources: GameGuideResource[];
}
export interface GameGuideSection {
  id: string;
  title: string;
  items: GameGuideItem[];
}

export interface GameGuide {
  id: string;
  title: string;
  description?: string;
  image?: string;
  gameId?: string;
  category: GameGuideCategory;
  favorite?: boolean;
  hidden?: boolean;
  sections: GameGuideSection[];
  createdAt: Date;
}

export interface Game {
  id: string;
  title: string;
  platform: GamePlatform;
  genre: GameGenre;
  hoursPlayed: number;
  status: GameStatus;
  image?: string;
  website?: string;
  notes?: string;

  /** Optional provider identity used for safe catalog duplicate detection. */
  rawgId?: string;
  /** Provider release date kept as a local date for offline cards and filters. */
  releaseDate?: Date;
  /** Provider platform labels; the personal platform remains authoritative. */
  providerPlatforms?: string[];

  favorite?: boolean;
  hidden?: boolean;

  accountLevel?: number;
  totalPower?: number;
  accountRank?: string;
  charactersUnlocked?: number;
  playingSince?: Date;
  cardMetric?: string;

  createdAt: Date;
}

export type LifeHubLinkedContext =
  | { section: 'games'; type: 'game'; entityId: string }
  | { section: 'entertainment'; type: 'media-item' | 'book'; entityId: string }
  | { section: 'supplements'; type: 'supplement'; entityId: string; entityIds?: string[] }
  | { section: 'skincare'; type: 'product'; entityId: string; entityIds?: string[] }
  | { section: 'work'; type: 'work-item'; entityId: string }
  | { section: 'health'; type: 'workout-plan' | 'workout-routine'; entityId: string }
  | { section: 'balance'; type: 'upcoming-money'; entityId: string }
  | { section: 'journal'; type: 'journal-entry' };

// Productivity Tracker Types
export type ProductivityType = "task" | "goal" | "idea" | "reminder";

export type ProductivityPriority =
  | "critical"
  | "important"
  | "normal"
  | "optional";

export type ProductivityStatus =
  | "pending"
  | "in-progress"
  | "deferred"
  | "completed"
  | "failed"
  | "dropped";

export interface ProductivityItem {
  id: string;
  title: string;
  description?: string;
  type: ProductivityType;
  priority: ProductivityPriority;
  status: ProductivityStatus;
  progress?: number;
  deadline?: Date;
  previousDeadline?: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  deferredAt?: Date | null;
  deferCount?: number;
  estimatedMinutes?: number;
  convertedFromIdeaId?: string;
  convertedToTaskId?: string;
  /** One optional managed visual reference for an Idea or converted item. */
  photoAssetIds?: string[];
  /** HTTPS visual-reference URL used when no managed upload is attached. */
  visualReferenceUrl?: string;
  /** Explicit Calendar projection preference for Reminders. */
  showInCalendar?: boolean;
  /** Transiently archived Idea lifecycle state. */
  archivedAt?: Date | null;
  tags?: string[];
  notes?: string;
  link?: string;
  createdAt: Date;

  // Local reminder notification (Android). `reminderTime` (HH:mm, local)
  // combines with the `deadline` date; `reminderLeadMinutes` moves the
  // notification earlier than that combined moment.
  reminderEnabled?: boolean;
  reminderTime?: string;
  reminderLeadMinutes?: number;

  // Display-only: hides a completed/dropped/failed item from the Life Hub
  // History list. Never affects status, XP/mastery evidence, or any other
  // computed stat — those all read the item's `status`, not this flag.
  hiddenFromHistory?: boolean;
  linkedContext?: LifeHubLinkedContext;
  /** Marks the single Life Hub task whose Work-owned fields mirror a Work task. */
  linkOrigin?: "workhub-mirror";
}

export type WorkLifeHubMirrorIntent = {
  workTaskId: string;
  enabled: boolean;
};

// Media Catalog Types
export type MediaType = "anime" | "manga" | "movie" | "series";

export type MediaStatus =
  | "reading"
  | "watching"
  | "completed"
  | "planned"
  | "paused"
  | "dropped";

export type MediaUnitLabel = "episodes" | "chapters" | "volumes";

export type MediaCatalogProvider = "anilist" | "tmdb" | "manual";

export type MediaSourceStatus =
  | "upcoming"
  | "airing"
  | "returning"
  | "finished"
  | "cancelled"
  | "hiatus"
  | "unknown";

export type MediaRelationType =
  | "prequel"
  | "sequel"
  | "side_story"
  | "spin_off"
  | "adaptation"
  | "other";

export interface MediaRelation {
  provider: Exclude<MediaCatalogProvider, "manual">;
  externalId: string;
  relation: MediaRelationType;
  title: string;
  type?: MediaType;
  image?: string;
  catalogUrl?: string;
}

export interface MediaSeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate?: string;
  poster?: string;
}

export interface MediaReleaseEvent {
  id: string;
  source: Exclude<MediaCatalogProvider, 'manual'>;
  seasonNumber?: number;
  unitNumber?: number;
  /** ISO timestamp for timestamp precision, or YYYY-MM-DD for date precision. */
  date: string;
  precision: 'timestamp' | 'date';
}

export interface MediaWatchProvider {
  name: string;
  logo?: string;
  type: "subscription" | "free" | "ads" | "rent" | "buy";
  link?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  status: MediaStatus;

  // Backward-compatible personal progress fields.
  episodes?: number;
  totalUnits?: number;
  unitLabel?: MediaUnitLabel;
  progress?: number;
  currentSeason?: number;
  currentEpisode?: number;

  year?: string;
  season?: "Winter" | "Spring" | "Summer" | "Fall" | "Unknown";
  animeSeason?: number;
  rating?: number;
  image?: string;
  /** Managed replacement for legacy inline entertainment posters. */
  imageAssetId?: string;
  backdrop?: string;
  genre?: string;
  genres?: string[];
  synopsis?: string;
  notes?: string;
  website?: string;
  links?: {
    id: string;
    label: string;
    url: string;
  }[];
  favorite?: boolean;

  // External catalog metadata. Personal fields above are never overwritten
  // unless the user changes them explicitly.
  catalogProvider?: MediaCatalogProvider;
  catalogId?: string;
  catalogUrl?: string;
  canonicalTitle?: string;
  originalTitle?: string;
  alternateTitles?: string[];
  sourceStatus?: MediaSourceStatus;
  totalSeasons?: number;
  availableUnits?: number;
  acknowledgedAvailableUnits?: number;
  newUnitsAvailable?: number;
  hasNewSeason?: boolean;
  nextEpisodeNumber?: number;
  nextEpisodeAt?: Date | null;
  /** Calendar date for providers such as TMDB that do not expose a time. */
  nextEpisodeDate?: string | null;
  /** Provider-confirmed movie release date, kept date-only. */
  releaseDate?: string | null;
  /** Bounded provider-derived release history; optional for legacy records. */
  releaseHistory?: MediaReleaseEvent[];
  relations?: MediaRelation[];
  seasonDetails?: MediaSeasonSummary[];
  watchProviders?: MediaWatchProvider[];
  countryOfOrigin?: string;
  runtimeMinutes?: number;
  lastSyncedAt?: Date | null;
  metadataUpdatedAt?: Date | null;

  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

// Books stay separate from media and inventory. This keeps reading progress
// page-based and lets ownership remain an independent personal field.
export type BookStatus =
  | "reading"
  | "want-to-read"
  | "completed"
  | "paused"
  | "dropped";

export type BookFormat = "physical" | "ebook" | "audiobook" | "other";
export type BookSource = "openlibrary" | "manual";

export interface BookItem {
  id: string;
  title: string;
  authors: string[];
  cover?: string;
  externalId?: string;
  isbn?: string;
  isbn13?: string;
  publicationYear?: number;
  subjects?: string[];
  totalPages?: number;
  source: BookSource;
  status: BookStatus;
  owned: boolean;
  format: BookFormat;
  currentPage: number;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  rating?: number;
  notes?: string;
  /** ID of the linked Inventory item representing the physical copy, when this book was added to Inventory. */
  linkedInventoryItemId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// Music Types
export type MusicProvider = "youtube" | "spotify" | "link";

export type MusicMood =
  | "focus"
  | "chill"
  | "hype"
  | "sad"
  | "romance"
  | "sleep"
  | "workout"
  | "any";

export interface MusicPlayEvent {
  playedAt: Date;
}

export interface MusicItem {
  id: string;
  type?: "song" | "playlist";
  title: string;
  artist?: string;
  playlist?: string;
  playlists?: string[];
  playlistCover?: string;
  lastPlayedAt?: Date | null;
  playCount?: number;
  playHistory?: MusicPlayEvent[];
  provider: MusicProvider;
  url: string;
  image?: string;
  genre?: string;
  pinned?: boolean;
  mood?: MusicMood;
  favorite?: boolean;
  notes?: string;
  lyrics?: string;
  lyricsUrl?: string;
  createdAt: Date;
}

// Wishlist Types
export type PriorityLevel = "low" | "medium" | "high";

export type PlanType =
  | "item"
  | "subscription"
  | "health"
  | "service"
  | "travel"
  | "experience"
  | "other";

export type WishlistDestination =
  | "inventory"
  | "skincare"
  | "supplements"
  | "software"
  | "subscription"
  | "none";

export interface WishlistItem {
  id: string;
  profileId?: string;
  name: string;
  /** Optional for legacy Wishlist records; missing values derive to Item. */
  type?: PlanType;
  /** Optional date for future intent; does not create a calendar record. */
  targetDate?: Date | string;
  estimatedPrice?: number;
  actualPrice?: number;
  purchaseDate?: Date | string;
  category: string;
  walletId?: string;
  /** Upcoming Money record created when this wish becomes an actual plan. */
  plannedPaymentId?: string;
  selected: boolean;
  isBought?: boolean;
  isArchived?: boolean;
  /** Backward-compatible flag used by older Inventory routing. */
  movedToInventory?: boolean;
  /** Module chosen when the purchase was completed. */
  destinationType?: WishlistDestination;
  /** ID of the record created in the destination module. */
  destinationItemId?: string;
  /** Amount deducted from a wallet when the purchase was completed. */
  walletDeductedAmount?: number;
  purchaseCompletedAt?: Date | string;
  priority: PriorityLevel;
  image?: string | null;
  photoAssetIds?: string[];
  notes?: string;
  productLink?: string;
  createdAt: Date;
}
// Journal Types
export type MoodType = "rough" | "okay" | "good";

export interface JournalEntry {
  id: string;
  profileId?: string;
  date: Date;
  title?: string;
  content: string;
  mood?: MoodType;
  image?: string;
  photoAssetIds?: string[];
  attachmentAssetIds?: string[];
  createdAt: Date;
}

// Life Hub Types
export type ChecklistFrequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "every_x_days"
  | "specific_weekday";

export type RoutineOccurrenceStatus = "done" | "skipped";

export type RoutineGoalUnit =
  | 'times'
  | 'episodes'
  | 'chapters'
  | 'pages'
  | 'minutes'
  | 'hours'
  | 'km'
  | 'glasses'
  | 'items'
  | 'custom';

export interface RoutineGoal {
  target: number;
  unit: RoutineGoalUnit;
  customUnit?: string;
}

export interface RoutineProgressEntry {
  periodKey: string;
  date: string;
  value: number;
  target: number;
  unit: RoutineGoalUnit;
  customUnit?: string;
  updatedAt: Date;
}

export interface RoutineScheduleRevision {
  /** Local calendar date on which this schedule became active. */
  effectiveFrom: string;
  frequency: ChecklistFrequency;
  weekdays?: number[];
  weekday?: string;
  intervalDays?: number;
  anchorDate?: Date;
  dayOfMonth?: number;
}

export interface RoutineCompletionEntry {
  date: string;
  periodKey?: string;
  status: RoutineOccurrenceStatus;
  completedAt?: Date;
  note?: string;
  /** Link active when this occurrence was completed; legacy rows remain unset. */
  linkedContext?: LifeHubLinkedContext;
  linkedTitleSnapshot?: string;
}

/** Optional Health evidence configuration owned by a Life Hub Routine. */
export type HealthRoutineEvidence =
  | { mode: "sleep-tracked" }
  | {
      mode: "meal-tracked";
      meal: "breakfast" | "lunch" | "dinner";
    }
  | { mode: "meals-complete" }
  | {
      mode: "workout-completed";
      scope: "any" | "linked-workout-routine";
    }
  | {
      mode: "stretch-completed";
      scope: "any" | "linked-workout-routine";
    }
  | { mode: "weight-logged" }
  | { mode: "fast-completed" }
  | { mode: "water-target-reached" };

export interface DailyChecklistItem {
  id: string;
  title: string;
  frequency: ChecklistFrequency;
  category?: string;
  active?: boolean;
  weekdays?: number[];
  /** Legacy single-weekday schedule retained for existing records. */
  weekday?: string;
  intervalDays?: number;
  anchorDate?: Date;
  dayOfMonth?: number;
  targetCount?: number;
  goal?: RoutineGoal;
  /** Measured values are kept apart from done/skipped occurrence history. */
  progressHistory?: RoutineProgressEntry[];
  /** Starts tracking future schedule edits without inferring older cadence. */
  scheduleTrackingStartedAt?: string;
  scheduleRevisions?: RoutineScheduleRevision[];
  linkedSection?: string;
  linkedView?: string;
  linkedGameId?: string;
  linkedEntityType?: "workout-plan" | "workout-routine";
  linkedEntityId?: string;
  linkedContext?: LifeHubLinkedContext;
  healthRoutineEvidence?: HealthRoutineEvidence;
  scheduledTime?: string;
  completedAt?: Date | null;
  completionCount?: number;
  completionHistory?: RoutineCompletionEntry[];
  /** Optional local date from which the current progress counter is measured. */
  progressBaselineDate?: Date;
  createdAt: Date;

  // Local reminder notification (Android). `reminderDays` is a set of
  // weekday indices (0 = Sunday .. 6 = Saturday). It may differ from the
  // schedule when the user wants a reminder on only one of several due days.
  reminderEnabled?: boolean;
  reminderTime?: string;
  reminderDays?: number[];
}

export type WorkStatusType =
  | "work_home"
  | "office"
  | "holiday"
  | "leave"
  | "travel";

export type WorkEventType =
  | "deadline"
  | "meeting"
  | "work_event"
  | "sprint"
  | "reminder";

export type ImportantDateType =
  | "bill"
  | "subscription"
  | "renewal"
  | "birthday"
  | "warranty"
  | "restock"
  | "deadline"
  | "appointment"
  | "sale"
  | "personal"
  | "personal_travel"
  | "other"
  | WorkStatusType
  | WorkEventType;

export type ImportantDateRepeat = "none" | "monthly" | "yearly";

export type ImportantDateStatus = "upcoming" | "completed" | "dismissed";

export interface ImportantDateResolution {
  occurrenceDate: Date;
  resolvedAt: Date;
  status: Exclude<ImportantDateStatus, "upcoming">;
}

export interface ImportantDateItem {
  id: string;
  title: string;
  type: ImportantDateType;
  date: Date;
  endDate?: Date | null;
  repeat: ImportantDateRepeat;
  status?: ImportantDateStatus;
  resolvedAt?: Date | null;
  resolutionHistory?: ImportantDateResolution[];
  amount?: number;
  trackAsOverdue?: boolean;

  projectId?: string;

  notes?: string;
  link?: string;
  createdAt: Date;

  priority?: "none" | "low" | "medium" | "high" | "urgent";
  // Existing advance-warning selector used for on-screen badges; reused as
  // the lead time for the local reminder notification below.
  reminder?:
    | "same_day"
    | "1_day_before"
    | "3_days_before"
    | "1_week_before"
    | "custom";
  customReminderDays?: number;

  // Local reminder notification (Android). `reminderTime` (HH:mm, local)
  // combines with `date`; the lead time comes from `reminder`/`customReminderDays`.
  reminderEnabled?: boolean;
  reminderTime?: string;
}

export type WorkItemType =
  | "project"
  | "task"
  | "note"
  | "report"
  | "file"
  | "note_file"
  | "presentation"
  | "ticket"
  | "test_data"
  | "template";

export type WorkItemStatus =
  | "planned"
  | "draft"
  | "active"
  | "waiting"
  | "submitted"
  | "done"
  | "archived";

export type WorkSeverity = "low" | "medium" | "high" | "critical";

export interface WorkItem {
  id: string;
  type: WorkItemType;
  title: string;
  projectId?: string;
  /** Managed media references are supported only for projects and tasks. */
  attachmentAssetIds?: string[];
  status: WorkItemStatus;
  dueDate?: Date | null;
  date?: Date | null;
  link?: string;
  image?: string;
  notes?: string;
  content?: string;
  noteType?:
    | "bug"
    | "test"
    | "meeting"
    | "daily"
    | "report_draft"
    | "scratchpad"
    | "other";
  fileType?:
    | "file"
    | "report"
    | "presentation"
    | "note_file"
    | "ticket"
    | "test_data"
    | "template";
  pinned?: boolean;
  module?: string;
  description?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  severity?: WorkSeverity;
  environment?: string;
  browserDevice?: string;
  screenshotLink?: string;
  ticketLink?: string;
  extraNotes?: string;
  priority?: "low" | "medium" | "high";
  workTypeId?: string;
  workCategoryId?: string;
  workCategoryLabel?: string;
  customFieldValues?: Record<string, WorkCustomFieldValue>;
  createdAt: Date;
}

export type WorkRecordKind = 'note' | 'resource';
export type WorkCustomFieldType = 'short-text' | 'long-text' | 'number' | 'select' | 'multi-select' | 'date' | 'url' | 'checkbox';
export type WorkCustomFieldValue = string | number | boolean | string[];

export interface WorkCustomFieldOption {
  id: string;
  label: string;
  archived?: boolean;
}

export interface WorkCustomFieldDefinition {
  id: string;
  label: string;
  type: WorkCustomFieldType;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  width?: 'half' | 'full';
  archived?: boolean;
  options?: WorkCustomFieldOption[];
}

export interface WorkTypeDefinition {
  id: string;
  name: string;
  description?: string;
  kind: WorkRecordKind;
  icon?: string;
  archived?: boolean;
  builtIn?: boolean;
  fields: WorkCustomFieldDefinition[];
}

export type PersonalVaultType =
  | "document"
  | "career"
  | "creative"
  | "install"
  | "links";

export interface PersonalVaultItem {
  id: string;
  type: PersonalVaultType;
  subType?: string;
  title: string;
  link?: string;
  officialWebsite?: string;
  image?: string;
  usernameHint?: string;
  referenceHint?: string;
  issuer?: string;
  platform?: string;
  installStatus?: "needed" | "installed" | "optional";
  date?: Date | null;
  expiryDate?: Date | null;
  notes?: string;
  favorite?: boolean;
  /** Explicit per-record opt-in for title-only Life Hub/Calendar/Upcoming projection. */
  showTitleInPlanning?: boolean;
  createdAt: Date;
}

export type CareerSkillLevel = "Learning" | "Familiar" | "Proficient" | "Advanced";

export type CareerCourseStatus = "Planned" | "In progress" | "Completed";

export type CareerCredentialExpiryStatus =
  | "Valid"
  | "Expiring soon"
  | "Expired"
  | "No expiry";

export interface CareerSkill {
  id: string;
  name: string;
  area?: string;
  level: CareerSkillLevel;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CareerCourse {
  id: string;
  title: string;
  image?: string;
  attachmentAssetId?: string;
  provider?: string;
  status: CareerCourseStatus;
  startDate?: Date | null;
  completionDate?: Date | null;
  url?: string;
  notes?: string;
  relatedSkillIds: string[];
  createdAt: Date;
  updatedAt?: Date;
}

export interface CareerCredential {
  id: string;
  title: string;
  image?: string;
  issuer?: string;
  relatedSkillIds: string[];
  relatedCourseIds: string[];
  issuedDate?: Date | null;
  expiryDate?: Date | null;
  noExpiry?: boolean;
  credentialId?: string;
  url?: string;
  notes?: string;
  proofAssetId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Shared taxonomy shape. Personal Vault persists these records per profile;
 * other modules may continue using the hook's legacy storage until migrated.
 */
export interface ModuleTaxonomyCategory {
  id: string;
  name: string;
  archived?: boolean;
  subcategories: string[];
  archivedSubcategories?: string[];
  customSubcategories?: string[];
}

export type TrashSource =
  | "productivityItems"
  | "importantDates"
  | "dailyChecklistItems"
  | "musicItems"
  | "workItems"
  | "personalVaultItems"
  | "mediaItems"
  | "careerSkills"
  | "careerCourses"
  | "careerCredentials"
  | "inventoryItems"
  | "skincareProducts"
  | "wishlistItems"
  | "books";

export interface TrashItem {
  id: string;
  source: TrashSource;
  sourceLabel: string;
  itemId: string;
  title: string;
  deletedAt: Date;
  deleteAfter: Date;
  data: any;
  /** Inventory-only reference used to safely restore its linked Book when possible. */
  linkedBookId?: string;
}

export type PetId = "mochi";

export type PetCostume =
  | "default"
  | "dracula"
  | "wizard";

export type MochiReaction = "idle" | "happy" | "focus";

/** How the companion speaks. Distinct from MochiReaction, which is how it
 * currently behaves visually — the two are independent (e.g. a "grumpy"
 * personality can still show a "happy" reaction). */
export type PetPersonality = "cutesy" | "funny" | "serious" | "grumpy" | "calm";

export type AchievementPath =
  | "productivity"
  | "wellness"
  | "finance"
  | "collection"
  | "reflection"
  | "discipline";

export type AchievementRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Epic"
  | "Legendary"
  | "Mythic";

export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: Date;
  seenAt?: Date;
  /** Legacy compatibility metadata; new progression never writes this field. */
  migratedFrom?: string[];
}

/**
 * A genuinely new milestone earned by the simplified milestone system.
 * Legacy achievements are projected at read time and are deliberately not
 * represented by this persisted collection.
 */
export interface MilestoneUnlock {
  milestoneId: string;
  achievedAt: Date;
  seenAt?: Date;
}

export interface MasteryMilestone {
  category: AchievementPath;
  rank: "Apprentice" | "Adept" | "Expert" | "Master" | "Mythic";
  reachedAt: Date;
  seenAt?: Date;
}

/**
 * Non-decreasing historical rank floors retained when mastery requirements are
 * rebalanced. This is intentionally separate from current evidence-based
 * rank so a rule change cannot downgrade an existing profile.
 */
export type MasteryRankFloor = Partial<
  Record<AchievementPath, MasteryMilestone["rank"]>
>;

export type CategoryXpSourceType =
  | "activity"
  | "achievement"
  | "task"
  | "routine"
  | "journal"
  | "wellness"
  | "food"
  | "work-task"
  | "finance"
  | "migration";

export interface CategoryXpEvent {
  id: string;
  category: AchievementPath;
  sourceType: CategoryXpSourceType;
  sourceId: string;
  requestedXp: number;
  xp: number;
  occurredAt: Date;
}

export type MasterySkinId = "base" | "evolved" | "resonance";

export interface MasteryBondXpEvent {
  id: string;
  recipient: AchievementPath;
  sourceType:
    | "daily-check-in"
    | "journal"
    | "wellness"
    | "food"
    | "task"
    | "routine"
    | "work-task"
    | "finance";
  sourceId: string;
  claimId: string;
  requestedXp: number;
  xp: number;
  occurredAt: Date;
}

export interface MasteryBondClaim {
  claimId: string;
  eventId?: string;
  processedAt: Date;
}

export interface MasteryCompanionPreference {
  selectedSkin?: MasterySkinId;
}

export type MasteryCompanionPreferences = Partial<
  Record<AchievementPath, MasteryCompanionPreference>
>;

export interface PetReward {
  id: string;
  sourceId: string;
  sourceType:
    | "task"
    | "routine"
    | "work-task"
    | "achievement"
    | "finance"
    | "check-in"
    | "journal"
    | "wellness"
    | "food";
  label: string;
  xp: number;
  gold: number;
  earnedAt: Date;
}

export interface PetShopUnlock {
  petId?: PetId;
  costume?: PetCostume;
}

export interface PetCompanionData {
  name: string;
  activePetId: PetId;
  ownedPetIds: PetId[];
  costume: PetCostume;
  ownedCostumes: PetCostume[];
  purchasedShopItemIds: string[];
  level: number;
  xp: number;
  gold: number;
  createdAt: Date;
  showFloatingPet?: boolean;
  rewardedItemIds?: string[];
  recentRewards: PetReward[];
  /** How the companion speaks in Mochi's observations/briefing. Optional
   * for backward compatibility with pets saved before this existed —
   * normalizePet() backfills a default, and readers should fall back to
   * the same default when reading raw/unnormalized data. */
  personality?: PetPersonality;
}
// Profile Types
export interface Profile {
  id: string;
  name: string;
  avatar?: string;
  avatarAssetId?: string;
  /** Currency in which stored money values were originally entered. */
  baseCurrency?: CurrencyCode;
  /** Currency currently used to display converted money values. */
  currency?: CurrencyCode;

  wallets: Wallet[];
  transactions: Transaction[];
  inventoryItems: InventoryItem[];
  wishlistItems: WishlistItem[];
  upcomingMoneyItems: UpcomingMoneyItem[];
  journalEntries: JournalEntry[];
  games: Game[];
  gameGuides: GameGuide[];
  productivityItems: ProductivityItem[];
  mediaItems: MediaItem[];
  /** Optional for backward-compatible profiles created before Books existed. */
  books?: BookItem[];
  musicItems: MusicItem[];
  workItems: WorkItem[];
  personalVaultItems: PersonalVaultItem[];
  careerSkills?: CareerSkill[];
  careerCourses?: CareerCourse[];
  careerCredentials?: CareerCredential[];
  personalVaultTaxonomy?: ModuleTaxonomyCategory[];
  /** Profile-scoped custom taxonomy for collection modules. */
  moduleTaxonomies?: Record<string, ModuleTaxonomyCategory[]>;
  /** Optional profile-scoped Work Type definitions and built-in overrides. */
  workTypes?: WorkTypeDefinition[];
  trashItems: TrashItem[];
  skincareProducts: SkincareProduct[];
  skincareUsageEvents?: SkincareUsageEvent[];
  dailyChecklistItems: DailyChecklistItem[];
  importantDates: ImportantDateItem[];
  // Supplements stay separate in storage.
  // They will only be shown inside Health in the UI.
  supplements: Supplement[];
  health: HealthProfile;
  balanceProjectionRows?: BalanceProjectionRow[];

  budgets?: Budget[];

  /**
   * Scope keys (`getBudgetScopeKey(month, categoryId, subcategoryId)`) for
   * recurring budget occurrences the user explicitly deleted. Materialization
   * consults this so a deleted month's occurrence isn't recreated, while
   * later months keep recurring normally.
   */
  skippedRecurringBudgetScopes?: string[];

  balanceProjectionIncludeAllWallets?: boolean;

  financialCategories?: FinancialCategory[];

  balanceCheckIns?: BalanceCheckIn[];

  achievementUnlocks?: AchievementUnlock[];
  milestoneUnlocks?: MilestoneUnlock[];
  achievementMigrationVersion?: number;
  masteryMilestones?: MasteryMilestone[];
  masteryRankFloors?: MasteryRankFloor;
  categoryXpEvents?: CategoryXpEvent[];
  masteryBondXpEvents?: MasteryBondXpEvent[];
  masteryBondClaims?: MasteryBondClaim[];
  masteryCompanionPreferences?: MasteryCompanionPreferences;
  activeMasteryCompanion?: AchievementPath;
  feedbackPreferences?: {
    showToasts?: boolean;
    showRewardDetails?: boolean;
  };

  pet?: PetCompanionData;
  createdAt: Date;
}

export type MediaOwnerType =
  | "inventory"
  | "journal"
  | "health"
  | "finance"
  | "wishlist"
  | "work"
  | "document"
  | "career"
  | "profile"
  | "other";

export type MediaAssetRole =
  | "primary"
  | "gallery"
  | "receipt"
  | "attachment"
  | "thumbnail";

export type MediaSyncStatus =
  | "local-only"
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

export type MediaAsset = {
  id: string;
  profileId: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  role: MediaAssetRole;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  localPath?: string;
  remotePath?: string;
  thumbnailPath?: string;
  checksum?: string;
  /** Explicit privacy preference; this asset must not be uploaded to Cloud Backup. */
  cloudExcluded?: boolean;
  syncStatus: MediaSyncStatus;
  createdAt: string;
  updatedAt: string;
};

export type CaizenMediaRole = MediaAssetRole;

export type CaizenCloudBackup = {
  id: string;
  userId: string;
  profileId: Profile["id"];
  schemaVersion: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CaizenMediaAsset = {
  id: string;
  userId: string;
  profileId: Profile["id"];
  recordType: string;
  recordId: string;
  role: CaizenMediaRole;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CaizenBackupResult = {
  status: "success" | "partial" | "skipped";
  backupId: CaizenCloudBackup["id"];
  profileId: Profile["id"];
  schemaVersion: number;
  updatedAt: string;
  uploadedFileCount: number;
  skippedFileCount: number;
  deletedFileCount: number;
  failedMedia: CaizenMediaTransferFailure[];
  thumbnailBackfillPendingCount?: number;
};

export type CaizenRestoreResult = {
  status: "success" | "partial";
  backupId: CaizenCloudBackup["id"];
  profileId: Profile["id"];
  schemaVersion: number;
  restoredAt: string;
  downloadedFileCount: number;
  failedMedia: CaizenMediaTransferFailure[];
};

export type CaizenMediaTransferFailure = {
  mediaAssetId: string | null;
  originalName: string | null;
  operation: "read" | "upload" | "metadata" | "delete" | "download" | "restore" | "legacy";
  message: string;
};

// App Context
export type CloudRestoreHandoff = {
  beforeReplace: () => Promise<void>;
  assertBeforeReplace: () => void;
  resumeAfterFailure: () => Promise<boolean>;
};

export interface AppContextType {
  profiles: Profile[];
  currentProfileId: string;
  isHydrated: boolean;
  /** True only when this provider created the initial local profile from an empty store. */
  isFreshInstall: boolean;

  getCashOnHandBalance: () => number;
  getFreeSpendingBalance: () => number;
  getSavingsBalance: () => number;
  getInvestmentBalance: () => number;
  getAvailableBudget: () => number;

  addProfile: (
    profile: Omit<
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
  ) => string;

  deleteProfile: (id: string) => Promise<void>;
  clearWorkspaceState: () => Promise<void>;
  beginDemoTransition: () => Promise<() => void>;
  prepareCloudBackup: () => Promise<void>;
  beginCloudRestore: () => Promise<CloudRestoreHandoff>;
  switchProfile: (id: string) => void;

  updateProfile: (id: string, updates: Partial<Profile>) => void;
  saveWorkSetupForProfile: (
    profileId: string,
    workTypes: WorkTypeDefinition[],
    categories: ModuleTaxonomyCategory[],
  ) => 'applied' | 'rejected';

  getCurrentProfile: () => Profile | undefined;

  // Pet Companion
  pet: PetCompanionData;
  mochiReaction: MochiReaction;
  updatePet: (updates: Partial<PetCompanionData>) => void;

  // Wallets
  wallets: Wallet[];
  transactions: Transaction[];
  addWallet: (wallet: Omit<Wallet, "id" | "createdAt">) => string | undefined;
  updateWallet: (id: string, wallet: Partial<Wallet>) => boolean;
  deleteWallet: (id: string) => boolean;
  getTotalWalletBalance: () => number;

  addTransaction: (
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ) => string | undefined;
  recordRecurringOccurrence: (
    rowId: string,
    overrides?: RecurringOccurrenceOverrides,
  ) => RecurringActionResult;
  resolveRecurringOccurrence: (
    rowId: string,
    action: 'skip' | 'already-recorded',
  ) => RecurringActionResult;
  updateTransaction: (id: string, updates: Partial<Transaction>) => boolean;
  updateTransactionReportingStatus: (ids: string[], excluded: boolean) => number;
  connectTransactionWallet: (id: string, walletId: string) => boolean;
  deleteTransaction: (id: string) => boolean;
  deleteTransactions: (ids: string[]) => number;
  clearTransactions: () => number;
  recordWalletAdjustment: (
    walletId: string,
    targetBalance: number,
    details?: Pick<Transaction, "date" | "notes" | "source" | "sourceKey">,
  ) => string | undefined;
  reconcileWalletBalances: (
    balances: Record<string, number>,
    details?: {
      date?: Date;
      notes?: string;
      source?: string;
      sourceKeyPrefix?: string;
      expectedWalletBalances?: Record<string, number>;
    },
  ) => boolean;

  // Upcoming Money
  upcomingMoneyItems: UpcomingMoneyItem[];
  addUpcomingMoneyItem: (
    item: Omit<UpcomingMoneyItem, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ) => string | undefined;
  updateUpcomingMoneyItem: (
    id: string,
    updates: Partial<UpcomingMoneyItem>,
  ) => void;
  deleteUpcomingMoneyItem: (id: string) => void;

  // Inventory
  inventoryItems: InventoryItem[];
  addInventoryItem: (
    item: Omit<InventoryItem, "id" | "createdAt"> & { id?: string },
  ) => InventoryItem | undefined;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void;
  renameInventoryCategoryRecords: (from: string, to: string) => void;
  renameInventorySubcategoryRecords: (category: string, from: string, to: string) => void;
  deleteInventoryItem: (id: string) => void;
  getTotalInventoryValue: () => number;
  getTotalAssets: () => number;

  // Wishlist
  wishlistItems: WishlistItem[];
  addWishlistItem: (
    item: Omit<WishlistItem, "id" | "createdAt"> & { id?: string },
  ) => void;
  updateWishlistItem: (id: string, item: Partial<WishlistItem>) => void;
  renameWishlistCategoryRecords: (from: string, to: string) => void;
  completeWishlistItemToInventory: (
    id: string,
    updates: Partial<WishlistItem>,
  ) => string | undefined;
  deleteWishlistItem: (id: string) => void;
  getTotalSelectedWishlistCost: () => number;
  getRemainingBalance: () => number;

  // Journal
  journalEntries: JournalEntry[];
  addJournalEntry: (
    entry: Omit<JournalEntry, "id" | "createdAt"> & { id?: string },
  ) => void;
  updateJournalEntry: (id: string, entry: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  getJournalEntryByDate: (date: Date) => JournalEntry | undefined;

  // Games
  games: Game[];
  addGame: (game: Omit<Game, "id" | "createdAt">) => Game | undefined;
  updateGame: (id: string, game: Partial<Game>) => void;
  deleteGame: (id: string) => void;

  // Game Guides
  gameGuides: GameGuide[];
  addGameGuide: (guide: Omit<GameGuide, "id" | "createdAt">) => void;
  updateGameGuide: (id: string, guide: Partial<GameGuide>) => void;
  deleteGameGuide: (id: string) => void;

  // Productivity
  productivityItems: ProductivityItem[];
  addProductivityItem: (
    item: Omit<ProductivityItem, "id" | "createdAt">,
  ) => string | undefined;
  updateProductivityItem: (id: string, item: Partial<ProductivityItem>) => void;
  completeProductivityItem: (id: string, completedAt?: Date) => void;
  completeProductivityItemForProfile: (
    profileId: string,
    id: string,
    completedAt?: Date,
  ) => 'applied' | 'alreadyApplied' | 'rejected';
  deferProductivityItem: (id: string, nextDeadline?: Date | null) => void;
  dropProductivityItem: (id: string) => void;
  reopenProductivityItem: (id: string) => void;
  convertIdeaToTask: (id: string, deadline?: Date | null) => string | undefined;
  deleteProductivityItem: (id: string) => void;

  // Media
  mediaItems: MediaItem[];
  addMediaItem: (
    item: Omit<MediaItem, "id" | "createdAt">,
  ) => MediaItem | undefined;
  updateMediaItem: (id: string, item: Partial<MediaItem>) => void;
  deleteMediaItem: (id: string) => void;

  // Books
  books: BookItem[];
  addBook: (
    book: Omit<BookItem, "id" | "createdAt">,
  ) => BookItem | undefined;
  updateBook: (id: string, book: Partial<BookItem>) => void;
  deleteBook: (id: string) => void;

  // Music
  musicItems: MusicItem[];
  addMusicItem: (
    item: Omit<MusicItem, "id" | "createdAt">,
  ) => MusicItem | undefined;
  updateMusicItem: (id: string, item: Partial<MusicItem>) => void;
  recordMusicPlay: (id: string, playedAt?: Date) => void;
  deleteMusicItem: (id: string) => void;

  // Work Hub
  workItems: WorkItem[];
  updateWorkItemsForProfile: (
    profileId: string,
    items: WorkItem[],
    mirrorIntent?: WorkLifeHubMirrorIntent,
  ) => 'applied' | 'rejected';
  completeWorkItemForProfile: (
    profileId: string,
    id: string,
  ) => 'applied' | 'alreadyApplied' | 'rejected';

  // Personal Vault
  personalVaultItems: PersonalVaultItem[];
  addPersonalVaultItem: (
    item: Omit<PersonalVaultItem, "id" | "createdAt"> & { id?: string },
  ) => void;
  updatePersonalVaultItem: (
    id: string,
    item: Partial<Omit<PersonalVaultItem, "id" | "createdAt">>,
  ) => void;
  deletePersonalVaultItem: (id: string) => void;

  // Career
  careerSkills: CareerSkill[];
  addCareerSkill: (
    item: Omit<CareerSkill, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;
  updateCareerSkill: (
    id: string,
    item: Partial<Omit<CareerSkill, "id" | "createdAt">>,
  ) => void;
  deleteCareerSkill: (id: string) => void;
  careerCourses: CareerCourse[];
  addCareerCourse: (
    item: Omit<CareerCourse, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;
  updateCareerCourse: (
    id: string,
    item: Partial<Omit<CareerCourse, "id" | "createdAt">>,
  ) => void;
  deleteCareerCourse: (id: string) => void;
  careerCredentials: CareerCredential[];
  addCareerCredential: (
    item: Omit<CareerCredential, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;
  updateCareerCredential: (
    id: string,
    item: Partial<Omit<CareerCredential, "id" | "createdAt">>,
  ) => void;
  deleteCareerCredential: (id: string) => void;

  // Trash
  trashItems: TrashItem[];
  moveToTrash: (
    source: TrashSource,
    item: any,
    sourceLabel?: string,
    options?: Pick<TrashItem, 'linkedBookId'> & { additionalUpdates?: Partial<Profile> },
  ) => void;
  restoreTrashItem: (id: string) => void;
  deleteTrashItemPermanently: (id: string) => void;
  deleteTrashItemsPermanently: (ids: string[]) => void;

  // Skincare
  skincareProducts: SkincareProduct[];
  skincareUsageEvents: SkincareUsageEvent[];
  addSkincareProduct: (
    product: Omit<SkincareProduct, "id" | "createdAt"> & { id?: string },
  ) => void;
  updateSkincareProduct: (
    id: string,
    product: Partial<SkincareProduct>,
  ) => void;
  renameSkincareCategoryRecords: (from: string, to: string) => void;
  deleteSkincareProduct: (id: string) => void;

  markSkincareProductEmptied: (
    id: string,
    details?: Date | SkincareFinishDetails,
  ) => void;

  restoreSkincareProduct: (id: string) => void;

  repurchaseSkincareProduct: (
    id: string,
    purchase: SkincareRepurchaseInput,
  ) => string | undefined;

  getSkincareProductStats: (productId: string) => {
    daysUsed: number | null;
    costPerDay: number | null;
    actualUsagePerDay: number | null;
    usageUnit: string | null;
    isFinished: boolean;
    todayUses: number;
    totalUses: number;
    lastUsedAt?: Date;
    /** Average completed-cycle duration from this product's repurchase history (or its legacy estimatedDuration when no history exists). */
    typicalDurationDays: number | null;
    /** Active cycles only: typicalDurationDays minus days already used, floored at 0. */
    estimatedRemainingDays: number | null;
  };
  logSkincareUsage: (productId: string, usedAt?: Date) => string | undefined;
  updateSkincareUsageEvent: (id: string, usedAt: Date) => void;
  deleteSkincareUsageEvent: (id: string) => void;
  completeSkincareRoutineOccurrence: (
    routineId: string,
    date: Date,
    productIds?: string[],
  ) => 'applied' | 'alreadyApplied' | 'rejected';
  completeSupplementRoutineOccurrence: (
    routineId: string,
    date: Date,
    supplementIds?: string[],
  ) => 'applied' | 'alreadyApplied' | 'rejected';

  // Life Hub
  dailyChecklistItems: DailyChecklistItem[];

  addDailyChecklistItem: (
    item: Omit<DailyChecklistItem, "id" | "createdAt">,
  ) => void;

  updateDailyChecklistItem: (
    id: string,
    item: Partial<DailyChecklistItem>,
  ) => void;

  deleteDailyChecklistItem: (id: string) => void;

  toggleDailyChecklistItem: (id: string) => void;

  toggleRoutineOccurrence: (id: string, date: Date) => void;
  setRoutineProgress: (id: string, date: Date, value: number) => void;
  adjustRoutineProgress: (id: string, date: Date, delta: number) => void;

  completeRoutineOccurrenceForProfile: (
    profileId: string,
    id: string,
    date: Date,
  ) => 'applied' | 'alreadyApplied' | 'rejected';

  skipRoutineOccurrence: (id: string, date: Date, note?: string) => void;

  recoverRoutineOccurrence: (id: string, date: Date) => void;

  importantDates: ImportantDateItem[];

  addImportantDate: (
    item: Omit<ImportantDateItem, "id" | "createdAt"> & { id?: string },
  ) => void;

  updateImportantDate: (id: string, item: Partial<ImportantDateItem>) => void;

  deleteImportantDate: (id: string) => void;

  resolveImportantDate: (
    id: string,
    status?: ImportantDateStatus,
    occurrenceDate?: Date,
  ) => void;

  // Supplements
  supplements: Supplement[];
  addSupplement: (
    supplement: Omit<Supplement, "id" | "createdAt"> & { id?: string },
  ) => void;
  updateSupplement: (id: string, supplement: Partial<Supplement>) => void;
  deleteSupplement: (id: string) => void;

  getSupplementStats: (supplementId: string) => {
    daysUsed: number;
    daysRemaining: number;
    depletionDate: Date;
  };

  // Health
  health: HealthProfile;

  updateHealthProfile: (
    updates: Partial<HealthProfile>,
    evidence?: HealthEvidenceEvent,
  ) => void;

  addFoodEntry: (entry: Omit<FoodEntry, "id" | "createdAt">) => void;

  addFoodEntries: (
    entries: Array<Omit<FoodEntry, "id" | "createdAt">>,
  ) => string[];

  updateFoodEntry: (id: string, entry: Partial<FoodEntry>) => void;

  deleteFoodEntry: (id: string) => void;

  deleteFoodEntries: (ids: string[]) => void;

  addWeightEntry: (entry: Omit<WeightEntry, "id" | "createdAt">) => void;

  addWaterEntry: (entry: Omit<WaterEntry, "id" | "createdAt">) => string | undefined;
  deleteWaterEntry: (id: string) => void;
  addBodyMeasurementEntry: (entry: Omit<BodyMeasurementEntry, "id" | "createdAt">) => string | undefined;
  updateBodyMeasurementEntry: (id: string, updates: Partial<BodyMeasurementEntry>) => void;
  deleteBodyMeasurementEntry: (id: string) => void;

  updateWeightEntry: (id: string, entry: Partial<WeightEntry>) => void;

  deleteWeightEntry: (id: string) => void;

  addNoXTracker: (tracker: Omit<NoXTracker, "id" | "createdAt">) => void;

  updateNoXTracker: (id: string, tracker: Partial<NoXTracker>) => void;

  deleteNoXTracker: (id: string) => void;

  addActivityEntry: (
    entry: Omit<ActivityEntry, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;

  deleteActivityEntry: (id: string) => void;

  fastingSessions: FastingSession[];
  addFastingSession: (
    session: Omit<FastingSession, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;
  updateFastingSession: (id: string, updates: Partial<FastingSession>) => boolean;
  deleteFastingSession: (id: string) => void;

  workoutPlans: WorkoutPlan[];

  addWorkoutPlan: (
    plan: Omit<WorkoutPlan, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => string | undefined;

  updateWorkoutPlan: (id: string, plan: Partial<WorkoutPlan>) => void;

  deleteWorkoutPlan: (id: string) => void;

  workoutExercises: WorkoutExerciseDefinition[];
  workoutRoutines: WorkoutRoutine[];
  workoutSessions: WorkoutSession[];
  addWorkoutExercise: (
    exercise: Omit<WorkoutExerciseDefinition, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => string | undefined;
  updateWorkoutExercise: (id: string, updates: Partial<WorkoutExerciseDefinition>) => void;
  deleteWorkoutExercise: (id: string) => void;
  addWorkoutRoutine: (
    routine: Omit<WorkoutRoutine, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => string | undefined;
  updateWorkoutRoutine: (id: string, updates: Partial<WorkoutRoutine>) => void;
  deleteWorkoutRoutine: (id: string) => void;
  addWorkoutSession: (
    session: Omit<WorkoutSession, "id" | "createdAt"> & { id?: string },
  ) => string | undefined;
  updateWorkoutSession: (id: string, updates: Partial<WorkoutSession>) => void;
  deleteWorkoutSession: (id: string) => void;

  foodTemplates: FoodTemplate[];

  addFoodTemplate: (template: Omit<FoodTemplate, "id" | "createdAt">) => void;

  updateFoodTemplate: (id: string, template: Partial<FoodTemplate>) => void;

  deleteFoodTemplate: (id: string) => void;

  // Data
  exportData: () => string;
  importData: (jsonData: string, mergeMode: boolean) => void;
}
