import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getFeedbackPreferences,
  formatActionOutcomeDescription,
  notify,
  resetFeedbackState,
  setFeedbackPreferences,
} from '@/lib/feedback/notify';
import {
  normalizeFeedbackPreferences,
  rewardHasDetails,
  type ActionOutcome,
} from '@/lib/feedback/types';
import { getToastDuration, reducer, toast } from '@/hooks/use-toast';

vi.mock('@/hooks/use-toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-toast')>();
  return { ...actual, toast: vi.fn(actual.toast) };
});

afterEach(() => {
  resetFeedbackState();
});

describe('global feedback outcomes', () => {
  it('uses one canonical kind and normalizes profile preferences safely', () => {
    const outcome: ActionOutcome = {
      actionId: 'task:1:completed',
      kind: 'reward',
      title: 'Task completed',
      reward: { categoryXp: 20 },
    };

    expect(outcome.kind).toBe('reward');
    expect(normalizeFeedbackPreferences(undefined)).toEqual({
      showToasts: true,
      showRewardDetails: true,
    });
    expect(normalizeFeedbackPreferences({ showToasts: false })).toEqual({
      showToasts: false,
      showRewardDetails: true,
    });
    expect(rewardHasDetails(outcome)).toBe(true);
  });

  it('deduplicates action IDs and keeps critical errors visible when feedback is off', () => {
    setFeedbackPreferences({ showToasts: false, showRewardDetails: false });

    expect(notify({ actionId: 'task:2', kind: 'success', title: 'Saved' })).toBe(false);
    expect(notify({ actionId: 'storage:1', kind: 'error', title: 'Storage failed' })).toBe(true);
    expect(notify({ actionId: 'storage:1', kind: 'error', title: 'Storage failed' })).toBe(false);
    expect(getFeedbackPreferences()).toEqual({ showToasts: false, showRewardDetails: false });
  });

  it('does not render legacy reward numbers in feedback descriptions', () => {
    const outcome: ActionOutcome = {
      actionId: 'routine:1:completed',
      kind: 'reward',
      title: 'Routine completed',
      reward: { category: 'productivity', categoryXp: 15, bondXp: 3, gold: 2 },
    };

    setFeedbackPreferences({ showRewardDetails: false });
    expect(formatActionOutcomeDescription(outcome)).toBe('');
    setFeedbackPreferences({ showRewardDetails: true });
    expect(formatActionOutcomeDescription(outcome)).toBe('');
  });

  it('does not change semantic kind through a convenience path', () => {
    const outcome: ActionOutcome = {
      actionId: 'achievement:1',
      kind: 'achievement',
      title: 'Achievement unlocked',
      milestone: { achievementName: 'Returning Page' },
    };

    expect(outcome.kind).toBe('achievement');
    expect(outcome).not.toHaveProperty('variant');
  });

  it('keeps critical feedback ahead of a bounded reward queue', () => {
    let state: { toasts: any[] } = { toasts: [] };
    for (const [id, priority] of [['reward-1', 10], ['reward-2', 10], ['error-1', 100], ['reward-3', 10], ['reward-4', 10]] as const) {
      state = reducer(state, {
        type: 'ADD_TOAST',
        toast: { id, title: id, open: true, feedbackPriority: priority },
      } as never);
    }

    expect(state.toasts).toHaveLength(3);
    expect(state.toasts[0].id).toBe('error-1');
  });

  it('assigns short success/info durations, longer warnings, and manual-dismiss errors', () => {
    expect(getToastDuration('success')).toBe(2500);
    expect(getToastDuration('default')).toBe(2500);
    expect(getToastDuration('warning')).toBe(4000);
    expect(getToastDuration('destructive')).toBe(0);
    expect(getToastDuration('success', true)).toBe(8000);
  });

  it('wires notify() itself to ship severity-based durations, not a flat value', () => {
    // notify() previously hardcoded `duration: isCritical ? 0 : 6500` at the
    // call site, bypassing getToastDuration entirely — the constants above
    // were tested but never actually shipped. Assert on the real call site.
    const toastSpy = vi.mocked(toast);
    const before = toastSpy.mock.calls.length;

    notify({ actionId: 'toast-duration:success', kind: 'success', title: 'Saved' });
    notify({ actionId: 'toast-duration:warning', kind: 'warning', title: 'Careful' });
    notify({ actionId: 'toast-duration:error', kind: 'error', title: 'Failed' });

    const calls = toastSpy.mock.calls.slice(before);
    expect(calls[0][0].duration).toBe(getToastDuration('success'));
    expect(calls[1][0].duration).toBe(getToastDuration('warning'));
    expect(calls[2][0].duration).toBe(getToastDuration('destructive'));
    expect(calls[2][0].duration).toBe(0);
  });
});
