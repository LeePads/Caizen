'use client';

import * as React from 'react';

import { getToastDuration, toast } from '@/hooks/use-toast';
import { ToastAction, type ToastProps } from '@/components/ui/toast';
import {
  DEFAULT_FEEDBACK_PREFERENCES,
  normalizeFeedbackPreferences,
  type ActionOutcome,
  type FeedbackKind,
  type FeedbackPreferences,
} from './types';

const MAX_PROCESSED_OUTCOMES = 200;
const processedActionIds = new Set<string>();
let preferences: FeedbackPreferences = DEFAULT_FEEDBACK_PREFERENCES;

const VARIANTS: Record<FeedbackKind, NonNullable<ToastProps['variant']>> = {
  success: 'success',
  reward: 'reward',
  achievement: 'achievement',
  info: 'default',
  warning: 'warning',
  error: 'destructive',
};

export function setFeedbackPreferences(value: Partial<FeedbackPreferences>) {
  preferences = normalizeFeedbackPreferences(value);
}

export function getFeedbackPreferences() {
  return preferences;
}

export function resetFeedbackState() {
  processedActionIds.clear();
  preferences = DEFAULT_FEEDBACK_PREFERENCES;
}

function buildDescription(outcome: ActionOutcome) {
  return outcome.description || '';
}

export function formatActionOutcomeDescription(outcome: ActionOutcome) {
  return buildDescription(outcome);
}

function priorityFor(kind: FeedbackKind) {
  return kind === 'error' || kind === 'warning' ? 100 : kind === 'achievement' ? 50 : 10;
}

export function notify(outcome: ActionOutcome) {
  if (processedActionIds.has(outcome.actionId)) return false;
  processedActionIds.add(outcome.actionId);
  if (processedActionIds.size > MAX_PROCESSED_OUTCOMES) {
    const oldest = processedActionIds.values().next().value;
    if (oldest) processedActionIds.delete(oldest);
  }

  const isCritical = outcome.kind === 'error' || outcome.kind === 'warning';
  if (!preferences.showToasts && !isCritical) return false;

  const description = buildDescription(outcome);
  const action = outcome.undo
    ? React.createElement(
        ToastAction,
        {
          altText: outcome.undo.label,
          onClick: () => void outcome.undo?.execute(),
        },
        outcome.undo.label,
      )
    : undefined;

  const variant = VARIANTS[outcome.kind];
  toast({
    title: outcome.title,
    description: description || undefined,
    action,
    variant,
    feedbackPriority: priorityFor(outcome.kind),
    feedbackGroup: outcome.feedbackGroup,
    feedbackMobileTitle: outcome.feedbackMobileTitle,
    duration: getToastDuration(variant, Boolean(action)),
    role: isCritical ? 'alert' : 'status',
  });
  return true;
}

/**
 * Temporary compatibility adapter for older UI-only messages. New committed
 * mutations should return a complete ActionOutcome and call notify directly.
 */
export function notifyLegacy(input: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastProps['variant'];
  actionId?: string;
}) {
  const title = typeof input.title === 'string' ? input.title : 'Caizen';
  const description = typeof input.description === 'string' ? input.description : undefined;
  return notify({
    actionId: input.actionId || `legacy:${title}:${description || ''}:${Date.now()}`,
    kind: input.variant === 'destructive'
      ? 'error'
      : input.variant === 'warning'
        ? 'warning'
        : input.variant === 'success'
          ? 'success'
          : 'info',
    title,
    description,
  });
}
