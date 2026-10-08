'use client';

import { useEffect, type ReactNode } from 'react';

import { useAppContext } from '@/lib/context';
import { ACTION_OUTCOME_EVENT } from '@/lib/feedback/events';
import {
  notify,
  setFeedbackPreferences,
} from '@/lib/feedback/notify';
import { normalizeFeedbackPreferences } from '@/lib/feedback/types';

export default function FeedbackHost({ children }: { children: ReactNode }) {
  const { getCurrentProfile } = useAppContext();
  const profile = getCurrentProfile();
  const { showToasts } = normalizeFeedbackPreferences(profile?.feedbackPreferences);

  useEffect(() => {
    setFeedbackPreferences({ showToasts });
  }, [showToasts]);

  useEffect(() => {
    const handleOutcome = (event: Event) => {
      const outcome = (event as CustomEvent<Parameters<typeof notify>[0]>).detail;
      if (outcome) notify(outcome);
    };
    window.addEventListener(ACTION_OUTCOME_EVENT, handleOutcome);
    return () => window.removeEventListener(ACTION_OUTCOME_EVENT, handleOutcome);
  }, []);

  return children;
}
