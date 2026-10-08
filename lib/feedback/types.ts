import type { AchievementPath, MasterySkinId } from '@/lib/types';

export type FeedbackKind =
  | 'success'
  | 'reward'
  | 'achievement'
  | 'info'
  | 'warning'
  | 'error';

export interface FeedbackPreferences {
  showToasts: boolean;
  showRewardDetails: boolean;
}

export const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  showToasts: true,
  showRewardDetails: true,
};

export interface ActionOutcome {
  actionId: string;
  kind: FeedbackKind;
  title: string;
  description?: string;
  /** Runtime grouping for feedback that should replace an earlier message. */
  feedbackGroup?: string;
  /** Optional native-only concise title; the web keeps the normal title. */
  feedbackMobileTitle?: string;
  reward?: {
    category?: AchievementPath;
    categoryXp?: number;
    bondRecipient?: AchievementPath;
    bondXp?: number;
    gold?: number;
  };
  milestone?: {
    achievementName?: string;
    categoryLevel?: number;
    masteryRank?: string;
    companionUnlocked?: boolean;
    skinUnlocked?: MasterySkinId | string;
  };
  undo?: {
    label: string;
    execute: () => void | Promise<void>;
  };
}

export function normalizeFeedbackPreferences(
  value: Partial<FeedbackPreferences> | null | undefined,
): FeedbackPreferences {
  return {
    showToasts: value?.showToasts !== false,
    showRewardDetails: value?.showRewardDetails !== false,
  };
}

export function rewardHasDetails(outcome: ActionOutcome) {
  const reward = outcome.reward;
  return Boolean(
    reward &&
      ((reward.categoryXp ?? 0) > 0 ||
        (reward.bondXp ?? 0) > 0 ||
        (reward.gold ?? 0) > 0),
  );
}
