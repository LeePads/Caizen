'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dedicated full-viewport surface for active workout execution.
 *
 * Modeled on `MusicFullPlayer`'s overlay mechanics (fixed, portal-rendered,
 * own stacking context) but deliberately skips escape/back-button dismissal:
 * the workout has explicit Back/End controls, and the runner already
 * checkpoints on every state change, so an accidental dismiss path isn't
 * needed here the way it is for a media player.
 */
export function WorkoutSessionScreen({ children }: { children: ReactNode }) {
  const previousOverflowRef = useRef<string | null>(null);
  const entryFocusRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    entryFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      if (!overlayRef.current?.contains(document.activeElement)) {
        overlayRef.current?.querySelector<HTMLElement>('[aria-label="Back to Workout Today"]')?.focus({ preventScroll: true });
      }
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = previousOverflowRef.current || '';
      }
      window.requestAnimationFrame(() => {
        const entry = entryFocusRef.current && document.contains(entryFocusRef.current) ? entryFocusRef.current : null;
        const target = entry ?? document.getElementById('workout-workspace-title') ?? document.getElementById('workout-progress-title');
        if (!entry && target) target.tabIndex = -1;
        target?.focus({ preventScroll: true });
      });
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div ref={overlayRef} className="workout-session-overlay" role="dialog" aria-modal="true" aria-labelledby="workout-runner-title" data-caizen-overlay="open">
      {children}
    </div>,
    document.body,
  );
}

export default WorkoutSessionScreen;
