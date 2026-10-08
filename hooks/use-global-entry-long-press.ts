'use client';

import { useEffect } from 'react';
import { hapticSelection } from '@/lib/native/haptics';

const ENTRY_SELECTOR =
  '.android-record-row, [data-entry-actions], .cz-queue-row, [data-entry-row]';
const ACTION_SELECTOR =
  '[data-entry-action-trigger], button[aria-haspopup="menu"], button[aria-label*="More" i], button[aria-label*="actions" i], button[title="More actions"]';
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"]';
const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Opens an entry's action menu after a deliberate long press. The click that
 * Android emits after pointer-up is suppressed so the row itself is not also
 * opened after the menu appears.
 */
export function useGlobalEntryLongPress(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    let pointerId: number | null = null;
    let origin: { x: number; y: number } | null = null;
    let row: HTMLElement | null = null;
    let didLongPress = false;
    let suppressClickUntil = 0;
    let dispatchingActionClick = false;

    const clearHold = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      pointerId = null;
      origin = null;
      row = null;
    };

    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;

      const target = event.target instanceof Element ? event.target : null;
      const candidate = target?.closest<HTMLElement>(ENTRY_SELECTOR) ?? null;
      if (!candidate) return;

      const interactive = target?.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (interactive && interactive !== candidate) return;

      clearHold();
      didLongPress = false;
      pointerId = event.pointerId;
      row = candidate;
      origin = { x: event.clientX, y: event.clientY };

      timer = window.setTimeout(() => {
        const action = row?.querySelector<HTMLElement>(ACTION_SELECTOR);
        if (!action || action.getAttribute('aria-disabled') === 'true') return;
        if (action instanceof HTMLButtonElement && action.disabled) return;

        didLongPress = true;
        suppressClickUntil = performance.now() + 750;
        void hapticSelection().catch(() => undefined);
        dispatchingActionClick = true;
        try {
          action.click();
        } finally {
          dispatchingActionClick = false;
        }
      }, HOLD_MS);
    };

    const move = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !origin) return;
      if (
        Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE ||
        Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE
      ) {
        clearHold();
      }
    };

    const up = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      clearHold();
    };

    const suppressFollowUpClick = (event: MouseEvent) => {
      if (dispatchingActionClick) return;

      const now = performance.now();
      if (!didLongPress || now > suppressClickUntil) {
        if (now > suppressClickUntil) {
          didLongPress = false;
          suppressClickUntil = 0;
        }
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(ENTRY_SELECTOR)) return;

      didLongPress = false;
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', clearHold, true);
    document.addEventListener('click', suppressFollowUpClick, true);

    return () => {
      clearHold();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', clearHold, true);
      document.removeEventListener('click', suppressFollowUpClick, true);
    };
  }, [enabled]);
}
