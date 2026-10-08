'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AnimatedOverlayCloseOptions = {
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
};

/**
 * Gives custom overlays the same short exit window that Radix owns for its
 * primitives. The parent remains mounted briefly, so focus and scroll-lock
 * ownership stay intact while the surface leaves.
 */
export function useAnimatedOverlayClose({
  isOpen,
  onClose,
  duration = 160,
}: AnimatedOverlayCloseOptions) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      closingRef.current = false;
      setIsClosing(false);
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    closingRef.current = false;
    setIsClosing(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const closeAfter = useCallback((onAfterClose?: () => void) => {
    if (!isOpen || closingRef.current) return;

    closingRef.current = true;
    setIsClosing(true);

    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.animation === 'reduced';

    if (reduceMotion || duration <= 0) {
      onClose();
      onAfterClose?.();
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onClose();
      onAfterClose?.();
    }, duration);
  }, [duration, isOpen, onClose]);

  const close = useCallback(() => closeAfter(), [closeAfter]);

  return { close, closeAfter, isClosing };
}
