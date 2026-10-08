// Deterministic, local analysis of "what is happening right now" in every
// major Caizen section. Pure functions only — no rendering, no network
// calls, no persistence. Reuses existing derived/calculation helpers
// wherever they exist instead of recomputing them. Consumed by
// lib/mochi/briefing.ts, which turns observations into what Mochi says.

import type {
  DailyChecklistItem,
  FastingSession,
  FoodEntry,
  Game,
  InventoryItem,
  JournalEntry,
  MediaItem,
  MusicItem,
  NoXTracker,
  ProductivityItem,
  SkincareProduct,
  SleepEntry,
  Supplement,
  UpcomingMoneyItem,
  Wallet,
  WeightEntry,
  WishlistItem,
  WorkItem,
  WorkoutSession,
  CareerCourse,
  CareerCredential,
  CareerSkill,
  PersonalVaultItem,
} from '@/lib/types';
import type { MochiObservation } from '@/lib/mochi/types';
import { startOfLocalDay } from '@/lib/lifehub/date-utils';
import {
  getUpcomingMoneyRemaining,
  getUpcomingMoneyStatus,
} from '@/lib/upcoming-money';
import {
  getActiveFastingSession,
  formatFastingShortDuration,
  getFastingElapsedMs,
} from '@/lib/health/fasting';
import { getStreakActiveDays } from '@/lib/health/streak-timeline';
import {
  getSkincareCycleDaysUsed,
  getSkincareTypicalDurationDays,
} from '@/lib/skincare/duration';
import { getCareerCredentialExpiryStatus } from '@/lib/career/expiry';
import {
  isRoutineDoneForDate,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';

function daysFromToday(value: Date | string, now: Date): number {
  const DAY_MS = 86_400_000;
  return Math.round((startOfLocalDay(value).getTime() - startOfLocalDay(now).getTime()) / DAY_MS);
}

function isWithinLastDays(value: Date | string | null | undefined, days: number, now: Date): boolean {
  if (!value) return false;
  const diff = daysFromToday(value, now);
  return diff <= 0 && diff >= -days;
}

/** The full slice of profile data Mochi's analysis reads. Pass the values
 * already destructured from useAppContext() — this module never touches
 * context or storage directly, so it works identically on web and Android. */
export type MochiAnalysisContext = {
  now: Date;
  profileId: string;
  // Money
  wallets: Wallet[];
  upcomingMoneyItems: UpcomingMoneyItem[];
  wishlistItems: WishlistItem[];
  // Inventory
  inventoryItems: InventoryItem[];
  // Skincare
  skincareProducts: SkincareProduct[];
  // Health
  foodEntries: FoodEntry[];
  mealTemplateCount: number;
  sleepEntries: SleepEntry[];
  weightEntries: WeightEntry[];
  fastingSessions: FastingSession[];
  workoutSessions: WorkoutSession[];
  noXTrackers: NoXTracker[];
  supplements: Supplement[];
  foodLogCompletedDates: string[];
  // Entertainment
  mediaItems: MediaItem[];
  games: Game[];
  books: import('@/lib/types').BookItem[];
  // Music
  musicItems: MusicItem[];
  // Life Hub
  productivityItems: ProductivityItem[];
  dailyChecklistItems: DailyChecklistItem[];
  journalEntries: JournalEntry[];
  // Work Hub
  workItems: WorkItem[];
  // Personal Vault
  personalVaultItems: PersonalVaultItem[];
  careerCourses: CareerCourse[];
  careerCredentials: CareerCredential[];
  careerSkills: CareerSkill[];
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function analyzeMoney(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];
  const active = ctx.upcomingMoneyItems.filter(item => !item.archived);
  const overdue = active.filter(item => getUpcomingMoneyStatus(item, ctx.now) === 'overdue');
  const dueSoon = active.filter(item => {
    if (!item.dueDate) return false;
    const days = daysFromToday(item.dueDate, ctx.now);
    return days >= 0 && days <= 7 && getUpcomingMoneyStatus(item, ctx.now) !== 'paid' && getUpcomingMoneyStatus(item, ctx.now) !== 'received';
  });

  if (overdue.length > 0) {
    observations.push({
      id: 'money-overdue',
      section: 'balance',
      importance: 'high',
      kind: 'attention',
      title: overdue.length === 1 ? `"${overdue[0].title}" is overdue` : `${overdue.length} money items are overdue`,
      detail: `${overdue.length} upcoming money ${overdue.length === 1 ? 'item is' : 'items are'} past due.`,
      target: { section: 'balance', feature: 'money-item' },
    });
  } else if (dueSoon.length > 0) {
    const total = dueSoon.reduce((sum, item) => sum + getUpcomingMoneyRemaining(item), 0);
    observations.push({
      id: 'money-due-soon',
      section: 'balance',
      importance: 'medium',
      kind: 'upcoming',
      title: `${dueSoon.length} money item${dueSoon.length === 1 ? '' : 's'} due within a week`,
      detail: `About ${Math.round(total)} still to reconcile in the next 7 days.`,
      target: { section: 'balance', feature: 'money-item' },
    });
  }

  if (ctx.wallets.length === 0) {
    observations.push({
      id: 'money-quiet',
      section: 'balance',
      importance: 'low',
      kind: 'quiet',
      title: 'Money is not set up yet',
      detail: 'No wallets yet. Add one to start tracking your balance.',
      target: { section: 'balance' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function analyzeInventory(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];

  const needsAttention = ctx.inventoryItems
    .filter(item => item.status === 'replace' || item.status === 'maintenance')
    .sort((a, b) => (b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0) - (a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0))[0];

  if (needsAttention) {
    observations.push({
      id: 'inventory-needs-attention',
      section: 'inventory',
      importance: needsAttention.status === 'replace' ? 'medium' : 'low',
      kind: 'attention',
      title: needsAttention.status === 'replace'
        ? `"${needsAttention.name}" is marked to replace`
        : `"${needsAttention.name}" needs maintenance`,
      detail: needsAttention.status === 'replace'
        ? 'This item is flagged for replacement whenever you get to it.'
        : 'This item is flagged as needing upkeep.',
      target: { section: 'inventory', feature: 'item', recordId: needsAttention.id },
    });
  }

  if (ctx.inventoryItems.length === 0) {
    observations.push({
      id: 'inventory-quiet',
      section: 'inventory',
      importance: 'low',
      kind: 'quiet',
      title: 'Inventory is empty',
      detail: 'Add something you own to start tracking it.',
      target: { section: 'inventory' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Skincare
// ---------------------------------------------------------------------------

export function analyzeSkincare(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];
  const active = ctx.skincareProducts.filter(product => (product.status || 'active') === 'active');

  let nearestFinish: { product: SkincareProduct; daysLeft: number } | null = null;
  for (const product of active) {
    const used = getSkincareCycleDaysUsed(product, ctx.now);
    const typical = getSkincareTypicalDurationDays(product, ctx.skincareProducts, ctx.now);
    if (used === null || typical === null) continue;
    const daysLeft = typical - used;
    if (daysLeft <= 7 && (!nearestFinish || daysLeft < nearestFinish.daysLeft)) {
      nearestFinish = { product, daysLeft };
    }
  }

  if (nearestFinish) {
    observations.push({
      id: 'skincare-nearing-finish',
      section: 'skincare',
      importance: nearestFinish.daysLeft <= 0 ? 'medium' : 'low',
      kind: 'attention',
      title: nearestFinish.daysLeft <= 0
        ? `"${nearestFinish.product.name}" is probably finished`
        : `"${nearestFinish.product.name}" is close to finished`,
      detail: nearestFinish.daysLeft <= 0
        ? 'Based on your usual pace, this is about due for a repurchase decision.'
        : `About ${nearestFinish.daysLeft} day${nearestFinish.daysLeft === 1 ? '' : 's'} left at your usual pace.`,
      target: { section: 'skincare', feature: 'item', recordId: nearestFinish.product.id },
    });
  } else if (active.length > 0) {
    observations.push({
      id: 'skincare-active',
      section: 'skincare',
      importance: 'low',
      kind: 'progress',
      title: `${active.length} active product${active.length === 1 ? '' : 's'}`,
      detail: 'Your routine is being tracked.',
      target: { section: 'skincare' },
    });
  } else {
    observations.push({
      id: 'skincare-quiet',
      section: 'skincare',
      importance: 'low',
      kind: 'quiet',
      title: 'Skincare is not started yet',
      detail: 'Add a product to start tracking your routine.',
      target: { section: 'skincare' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Health (deepest coverage — food, sleep, weight, fasting, workouts,
// habits/streaks, supplements)
// ---------------------------------------------------------------------------

export function analyzeHealth(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];

  // Supplements: expiring soon (matches Dashboard's existing 0-14 day window).
  const expiringSupplement = ctx.supplements
    .filter(item => item.expiryDate)
    .map(item => ({ item, days: daysFromToday(item.expiryDate as Date, ctx.now) }))
    .filter(({ days }) => days >= 0 && days <= 14)
    .sort((a, b) => a.days - b.days)[0];

  if (expiringSupplement) {
    observations.push({
      id: 'health-supplement-expiring',
      section: 'health',
      importance: expiringSupplement.days <= 7 ? 'high' : 'medium',
      kind: 'attention',
      title: `"${expiringSupplement.item.name}" expires soon`,
      detail: expiringSupplement.days === 0
        ? 'Expires today.'
        : `Expires in ${expiringSupplement.days} day${expiringSupplement.days === 1 ? '' : 's'}.`,
      target: { section: 'health', feature: 'supplements' },
    });
  }

  // Food: logged today vs a recent logging pattern.
  const todayKey = startOfLocalDay(ctx.now).getTime();
  const loggedToday = ctx.foodEntries.some(entry => startOfLocalDay(entry.date).getTime() === todayKey);
  const loggedRecently = ctx.foodEntries.some(entry => isWithinLastDays(entry.date, 3, ctx.now));
  if (!loggedToday && loggedRecently) {
    observations.push({
      id: 'health-food-gap',
      section: 'health',
      importance: 'low',
      kind: 'attention',
      title: "You haven't logged food today",
      detail: "You've been logging regularly — today is still open.",
      target: { section: 'health', feature: 'food' },
    });
  }

  // Fasting: active session.
  const activeFast = getActiveFastingSession(ctx.fastingSessions);
  if (activeFast) {
    observations.push({
      id: 'health-fasting-active',
      section: 'health',
      importance: 'low',
      kind: 'progress',
      title: 'A fast is in progress',
      detail: `${formatFastingShortDuration(getFastingElapsedMs(activeFast, ctx.now))} so far.`,
      target: { section: 'health', feature: 'fasting' },
    });
  }

  // Sleep: recent gap.
  const sleptRecently = ctx.sleepEntries.some(entry => isWithinLastDays(entry.date, 3, ctx.now));
  if (ctx.sleepEntries.length > 0 && !sleptRecently) {
    observations.push({
      id: 'health-sleep-gap',
      section: 'health',
      importance: 'low',
      kind: 'attention',
      title: 'No recent sleep logs',
      detail: "It's been a few days since your last sleep entry.",
      target: { section: 'health', feature: 'sleep' },
    });
  }

  // Weight: latest trend direction (only a plain fact, no health judgment).
  const sortedWeights = ctx.weightEntries.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (sortedWeights.length >= 2) {
    const [latest, previous] = sortedWeights;
    const change = latest.weightKg - previous.weightKg;
    if (Math.abs(change) >= 0.1) {
      observations.push({
        id: 'health-weight-trend',
        section: 'health',
        importance: 'low',
        kind: 'progress',
        title: `Weight moved ${change > 0 ? 'up' : 'down'} since your last entry`,
        detail: `${Math.abs(change).toFixed(1)} kg ${change > 0 ? 'higher' : 'lower'} than the entry before.`,
        target: { section: 'health', feature: 'weight' },
      });
    }
  }

  // Workouts: sessions this week.
  const workoutsThisWeek = ctx.workoutSessions.filter(session => session.status === 'completed' && isWithinLastDays(session.startedAt, 7, ctx.now));
  if (workoutsThisWeek.length > 0) {
    observations.push({
      id: 'health-workout-progress',
      section: 'health',
      importance: 'low',
      kind: 'progress',
      title: `${workoutsThisWeek.length} workout${workoutsThisWeek.length === 1 ? '' : 's'} this week`,
      detail: 'Nice consistency this week.',
      target: { section: 'health', feature: 'workout' },
    });
  }

  // Habits & streaks: longest active streak.
  const longestStreak = ctx.noXTrackers
    .filter(tracker => !tracker.pausedAt)
    .map(tracker => ({ tracker, days: getStreakActiveDays(tracker, ctx.now) }))
    .sort((a, b) => b.days - a.days)[0];

  if (longestStreak && longestStreak.days >= 7) {
    observations.push({
      id: 'health-streak',
      section: 'health',
      importance: 'medium',
      kind: 'progress',
      title: `${longestStreak.days}-day streak on "${longestStreak.tracker.name}"`,
      detail: "That's a solid run — worth keeping going.",
      target: { section: 'health', feature: 'streaks' },
    });
  }

  if (
    ctx.foodEntries.length === 0 &&
    ctx.sleepEntries.length === 0 &&
    ctx.weightEntries.length === 0 &&
    ctx.workoutSessions.length === 0 &&
    ctx.fastingSessions.length === 0
  ) {
    observations.push({
      id: 'health-quiet',
      section: 'health',
      importance: 'low',
      kind: 'quiet',
      title: 'Health is not started yet',
      detail: 'Log a meal, a workout, or sleep to start building a picture here.',
      target: { section: 'health' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Entertainment
// ---------------------------------------------------------------------------

export function analyzeEntertainment(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];

  const withUpdates = ctx.mediaItems.filter(item => item.newUnitsAvailable || item.hasNewSeason);
  if (withUpdates.length > 0) {
    observations.push({
      id: 'entertainment-updates',
      section: 'entertainment',
      importance: 'medium',
      kind: 'upcoming',
      title: withUpdates.length === 1
        ? `New episodes are ready for "${withUpdates[0].title}"`
        : `${withUpdates.length} titles have new episodes ready`,
      detail: 'New releases are available for something you track.',
      target: { section: 'entertainment', feature: 'updates' },
    });
  }

  const readingBooks = ctx.books.filter(book => book.status === 'reading');
  if (readingBooks.length > 0 && withUpdates.length === 0) {
    observations.push({
      id: 'entertainment-books-progress',
      section: 'entertainment',
      importance: 'low',
      kind: 'progress',
      title: `${readingBooks.length} book${readingBooks.length === 1 ? '' : 's'} in progress`,
      detail: 'Your reading is being tracked.',
      target: { section: 'entertainment', feature: 'library' },
    });
  }

  if (ctx.mediaItems.length === 0 && ctx.games.length === 0 && ctx.books.length === 0) {
    observations.push({
      id: 'entertainment-quiet',
      section: 'entertainment',
      importance: 'low',
      kind: 'quiet',
      title: 'Entertainment is empty',
      detail: 'Add something you are watching, playing, or reading.',
      target: { section: 'entertainment' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

export function analyzeMusic(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];
  if (ctx.musicItems.length === 0) return observations;

  const recentlyPlayed = ctx.musicItems.some(item => isWithinLastDays(item.lastPlayedAt ?? null, 14, ctx.now));

  if (!recentlyPlayed) {
    observations.push({
      id: 'music-quiet',
      section: 'music',
      importance: 'low',
      kind: 'quiet',
      title: 'Quiet on Music lately',
      detail: 'Nothing played in the last couple of weeks.',
      target: { section: 'music' },
    });
    return observations;
  }

  const mostPlayed = ctx.musicItems
    .filter(item => (item.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))[0];

  if (mostPlayed && (mostPlayed.playCount || 0) >= 5) {
    observations.push({
      id: 'music-most-played',
      section: 'music',
      importance: 'low',
      kind: 'progress',
      title: `"${mostPlayed.title}" is on repeat`,
      detail: `Played ${mostPlayed.playCount} times.`,
      target: { section: 'music' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Life Hub
// ---------------------------------------------------------------------------

export function analyzeLifeHub(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];
  const activeTasks = ctx.productivityItems.filter(item => !['completed', 'failed', 'dropped'].includes(item.status));
  const overdue = activeTasks.filter(item => item.deadline && daysFromToday(item.deadline, ctx.now) < 0);
  const dueToday = activeTasks.filter(item => item.deadline && daysFromToday(item.deadline, ctx.now) === 0);

  if (overdue.length > 0) {
    observations.push({
      id: 'lifehub-overdue',
      section: 'lifehub',
      importance: 'high',
      kind: 'attention',
      title: overdue.length === 1 ? `"${overdue[0].title}" is overdue` : `${overdue.length} tasks are overdue`,
      detail: 'That might be the easiest thing to clear first.',
      target: { section: 'lifehub', feature: 'tasks' },
    });
  } else if (dueToday.length > 0) {
    observations.push({
      id: 'lifehub-due-today',
      section: 'lifehub',
      importance: 'medium',
      kind: 'upcoming',
      title: `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today`,
      detail: 'Worth a quick look before the day gets away.',
      target: { section: 'lifehub', feature: 'tasks' },
    });
  }

  const dueRoutines = ctx.dailyChecklistItems.filter(
    item => item.active !== false && isRoutineDueForDate(item, ctx.now) && !isRoutineDoneForDate(item, ctx.now),
  );
  if (dueRoutines.length > 0) {
    observations.push({
      id: 'lifehub-routines-pending',
      section: 'lifehub',
      importance: 'low',
      kind: 'upcoming',
      title: `${dueRoutines.length} routine${dueRoutines.length === 1 ? '' : 's'} still open today`,
      detail: "You've already got a rhythm going — keep it up.",
      target: { section: 'lifehub', feature: 'routine' },
    });
  }

  const completedToday = ctx.productivityItems.filter(
    item => item.status === 'completed' && item.completedAt && daysFromToday(item.completedAt, ctx.now) === 0,
  );
  if (completedToday.length >= 2) {
    observations.push({
      id: 'lifehub-tasks-completed-today',
      section: 'lifehub',
      importance: 'low',
      kind: 'progress',
      title: `${completedToday.length} tasks finished today`,
      detail: 'That is a meaningful step through your Life Hub list.',
      target: { section: 'lifehub', feature: 'tasks' },
    });
  }

  if (ctx.productivityItems.length === 0 && ctx.dailyChecklistItems.length === 0 && ctx.journalEntries.length === 0) {
    observations.push({
      id: 'lifehub-quiet',
      section: 'lifehub',
      importance: 'low',
      kind: 'quiet',
      title: 'Life Hub is quiet',
      detail: 'Add a task or a routine to start tracking your days.',
      target: { section: 'lifehub' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Work Hub
// ---------------------------------------------------------------------------

export function analyzeWorkHub(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];
  const activeTasks = ctx.workItems.filter(item => item.type === 'task' && !['done', 'archived'].includes(item.status));
  const overdue = activeTasks.filter(item => item.dueDate && daysFromToday(item.dueDate, ctx.now) < 0);
  const dueToday = activeTasks.filter(item => item.dueDate && daysFromToday(item.dueDate, ctx.now) === 0);

  if (overdue.length > 0) {
    observations.push({
      id: 'workhub-overdue',
      section: 'workhub',
      importance: 'high',
      kind: 'attention',
      title: overdue.length === 1 ? 'You have one overdue work task' : `${overdue.length} work tasks are overdue`,
      detail: 'That might be the easiest thing to clear first.',
      target: { section: 'workhub', feature: 'tasks' },
    });
  } else if (dueToday.length > 0) {
    observations.push({
      id: 'workhub-due-today',
      section: 'workhub',
      importance: 'medium',
      kind: 'upcoming',
      title: `${dueToday.length} work task${dueToday.length === 1 ? '' : 's'} due today`,
      detail: 'Worth a quick look.',
      target: { section: 'workhub', feature: 'tasks' },
    });
  }

  if (ctx.workItems.length === 0) {
    observations.push({
      id: 'workhub-quiet',
      section: 'workhub',
      importance: 'low',
      kind: 'quiet',
      title: 'Work Hub is quiet',
      detail: 'Add a task or a project to start tracking your work.',
      target: { section: 'workhub' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Personal Vault (Career records can only be reached at the section level —
// there is no working deep link straight to a skill/course/credential).
// ---------------------------------------------------------------------------

export function analyzePersonalVault(ctx: MochiAnalysisContext): MochiObservation[] {
  const observations: MochiObservation[] = [];

  const expiring = ctx.careerCredentials
    .map(credential => ({ credential, status: getCareerCredentialExpiryStatus(credential, ctx.now) }))
    .filter(({ status }) => status === 'Expiring soon')
    .sort((a, b) => {
      const aTime = a.credential.expiryDate ? new Date(a.credential.expiryDate).getTime() : Infinity;
      const bTime = b.credential.expiryDate ? new Date(b.credential.expiryDate).getTime() : Infinity;
      return aTime - bTime;
    })[0];

  if (expiring) {
    const days = expiring.credential.expiryDate ? daysFromToday(expiring.credential.expiryDate, ctx.now) : null;
    observations.push({
      id: 'personalhub-credential-expiring',
      section: 'personalhub',
      importance: days !== null && days <= 7 ? 'high' : 'medium',
      kind: 'attention',
      title: `"${expiring.credential.title}" expires soon`,
      detail: days !== null ? `Expires in ${days} day${days === 1 ? '' : 's'}.` : 'This credential is expiring soon.',
      target: { section: 'personalhub' },
    });
  } else {
    const inProgress = ctx.careerCourses.filter(course => course.status === 'In progress');
    if (inProgress.length > 0) {
      observations.push({
        id: 'personalhub-course-progress',
        section: 'personalhub',
        importance: 'low',
        kind: 'progress',
        title: `${inProgress.length} course${inProgress.length === 1 ? '' : 's'} in progress`,
        detail: 'Your career records are being tracked.',
        target: { section: 'personalhub' },
      });
    }
  }

  if (
    ctx.personalVaultItems.length === 0 &&
    ctx.careerSkills.length === 0 &&
    ctx.careerCourses.length === 0 &&
    ctx.careerCredentials.length === 0
  ) {
    observations.push({
      id: 'personalhub-quiet',
      section: 'personalhub',
      importance: 'low',
      kind: 'quiet',
      title: 'Personal Vault is empty',
      detail: 'Save a document, link, or career record to start.',
      target: { section: 'personalhub' },
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------

export function analyzeAllSections(ctx: MochiAnalysisContext): MochiObservation[] {
  return [
    ...analyzeMoney(ctx),
    ...analyzeInventory(ctx),
    ...analyzeSkincare(ctx),
    ...analyzeHealth(ctx),
    ...analyzeEntertainment(ctx),
    ...analyzeMusic(ctx),
    ...analyzeLifeHub(ctx),
    ...analyzeWorkHub(ctx),
    ...analyzePersonalVault(ctx),
  ];
}
