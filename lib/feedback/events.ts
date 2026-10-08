import type { ActionOutcome } from './types';

export const ACTION_OUTCOME_EVENT = 'caizen:action-outcome';

export function publishActionOutcome(outcome: ActionOutcome) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ActionOutcome>(ACTION_OUTCOME_EVENT, { detail: outcome }),
  );
}
