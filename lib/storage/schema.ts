export const DATABASE_NAME = "caizen-life-manager";
export const DATABASE_VERSION = 1;

export const STORES = {
  profiles: "profiles",
  records: "records",
  media: "media",
  mediaBlobs: "mediaBlobs",
  settings: "settings",
  meta: "meta",
  backupHistory: "backupHistory",
} as const;

export const LEGACY_STORAGE_KEY = "asset-planning-app-data";
export const LEGACY_RECOVERY_KEY = "caizen-legacy-recovery-v1";
export const MIGRATION_META_KEY = "legacy-localstorage-v1";

/**
 * Collections split out of the profile core document into the records store.
 * Adding personalVaultTaxonomy here safely migrates an older inline array.
 */
export const PROFILE_COLLECTIONS = [
  "wallets",
  "transactions",
  "inventoryItems",
  "wishlistItems",
  "upcomingMoneyItems",
  "journalEntries",
  "games",
  "gameGuides",
  "productivityItems",
  "mediaItems",
  "musicItems",
  "workItems",
  "personalVaultItems",
  "careerSkills",
  "careerCourses",
  "careerCredentials",
  "personalVaultTaxonomy",
  "trashItems",
  "skincareProducts",
  "skincareUsageEvents",
  "dailyChecklistItems",
  "importantDates",
  "supplements",
  "balanceProjectionRows",
  "budgets",
  "financialCategories",
  "balanceCheckIns",
] as const;

export const HEALTH_COLLECTIONS = [
  "weightEntries",
  "waterEntries",
  "bodyMeasurementEntries",
  "nutritionEntries",
  "foodEntries",
  "foodLogCompletedDates",
  "foodTemplates",
  "mealTemplates",
  "activityEntries",
  "workoutEntries",
  "workoutSessions",
  "sleepEntries",
  "noXTrackers",
] as const;

export type ProfileCollection = (typeof PROFILE_COLLECTIONS)[number];
export type HealthCollection = (typeof HEALTH_COLLECTIONS)[number];
