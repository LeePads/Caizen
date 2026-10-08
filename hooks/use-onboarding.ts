'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOnboardingDraft, saveOnboardingDraft, type OnboardingDraft, type OnboardingMode } from '@/lib/onboarding';
import type { CurrencyCode } from '@/lib/types';
export function useOnboarding(profileId: string, mode: OnboardingMode, name: string, currency: CurrencyCode) {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [error, setError] = useState('');
  const current = useRef<OnboardingDraft | null>(null);
  const defaults = useRef({ name, currency });
  defaults.current = { name, currency };
  useEffect(() => {
    let cancelled = false;
    current.current = null; setDraft(null);
    void loadOnboardingDraft(profileId, mode, defaults.current.name, defaults.current.currency).then(value => {
      if (!cancelled) { current.current = value; setDraft(value); }
    }).catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Setup progress could not be loaded.'); });
    return () => { cancelled = true; };
  }, [profileId, mode]);
  const update = useCallback((change: Partial<OnboardingDraft>) => {
    if (!current.current) return;
    const next = { ...current.current, ...change, revision: current.current.revision + 1, updatedAt: new Date().toISOString() };
    current.current = next; setDraft(next); setError('');
    void saveOnboardingDraft(next).catch(caught => setError(caught instanceof Error ? caught.message : 'Setup progress could not be saved.'));
  }, []);
  const checkpoint = useCallback(async () => {
    if (!current.current) throw new Error('Setup is still loading.');
    await saveOnboardingDraft(current.current);
    return current.current;
  }, []);
  return { draft, update, checkpoint, error, setError };
}
