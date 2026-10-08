import { useEffect, useState } from 'react';

/**
 * Lightweight reduced-motion preference hook for surfaces that only need the
 * media-query state. Keeping this separate from the animation runtime avoids
 * pulling the full motion library into the app shell's critical path.
 */
export function useReducedMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReduceMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener('change', syncPreference);

    return () => mediaQuery.removeEventListener('change', syncPreference);
  }, []);

  return reduceMotion;
}
