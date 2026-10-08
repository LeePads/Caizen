'use client';

import { type RefObject, useEffect, useRef } from 'react';
import {
  isTopOverlay,
  popOverlay,
  pushOverlay,
} from '@/lib/native/overlay-stack';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let scrollLockDepth = 0;
let savedOverflow = '';

// `html { scrollbar-gutter: stable }` (globals.css) keeps the scrollbar
// track reserved at all times, so locking scroll here no longer needs to
// measure and compensate with body padding-right — that compensation was
// the source of the underlying page shifting sideways when an overlay
// opened/closed.
function lockBodyScroll() {
  if (scrollLockDepth === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockDepth += 1;
}

function unlockBodyScroll() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth === 0) {
    document.body.style.overflow = savedOverflow;
  }
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.closest('[inert]') &&
        element.getClientRects().length > 0
      );
    });
}

function visibleOverlayContainer(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-caizen-overlay="open"], [role="dialog"], [role="alertdialog"], [data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="drawer-content"]',
    ),
  ).filter(element => element.getClientRects().length > 0);
  return candidates[candidates.length - 1] || null;
}

// Radix popovers/selects/dropdowns (Combobox, Select, DropdownMenu, the
// date-picker's month/year list) are deliberately portaled to document.body
// so they can nest inside Caizen's modal shell without Radix's own
// dialog-nesting logic closing them. That portal target sits outside any
// modal's containerRef, so it must be treated as "inside" the active overlay
// here too — otherwise this hook's focus trap fights the popover for focus
// on every keystroke.
function isInsideNestedPopover(target: Node): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '[data-radix-popper-content-wrapper], [data-caizen-nested-popover]',
    ),
  );
}

// Overlay surfaces are fixed/portal-mounted. Focusing a trigger or the first
// control with the browser's default scroll behavior can move the underlying
// page, especially in Android WebViews. Keep focus semantics while preserving
// the user's current scroll position.
function focusWithoutScroll(element: HTMLElement | null) {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export type OverlayLifecycleOptions = {
  lockScroll?: boolean;
  restoreFocus?: boolean;
  autoFocus?: boolean;
  trapFocus?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  initialFocusSelector?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => boolean;
  /** Let an open nested picker handle Escape before this overlay consumes it. */
  deferEscapeKeyDown?: (event: KeyboardEvent) => boolean;
};

/**
 * Shared lifecycle for custom dialogs and sheets.
 *
 * - Registers open order for Android Back and Escape.
 * - Uses a ref-counted body scroll lock for nested overlays.
 * - Traps Tab focus when a container ref is provided.
 * - Restores focus to the trigger after close.
 */
export function useOverlayLifecycle(
  isOpen: boolean,
  onClose: () => void,
  options: OverlayLifecycleOptions = {},
) {
  const {
    lockScroll = true,
    restoreFocus = true,
    autoFocus = true,
    trapFocus = true,
    containerRef,
    initialFocusRef,
    initialFocusSelector,
    onEscapeKeyDown,
    deferEscapeKeyDown,
  } = options;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onEscapeKeyDownRef = useRef(onEscapeKeyDown);
  onEscapeKeyDownRef.current = onEscapeKeyDown;
  const deferEscapeKeyDownRef = useRef(deferEscapeKeyDown);
  deferEscapeKeyDownRef.current = deferEscapeKeyDown;

  useEffect(() => {
    if (!isOpen) return;

    const triggerElement =
      restoreFocus && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (lockScroll) lockBodyScroll();
    const overlayId = pushOverlay(() => onCloseRef.current());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(overlayId)) return;

      if (event.key === 'Escape') {
        if (deferEscapeKeyDownRef.current?.(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (onEscapeKeyDownRef.current?.(event)) return;
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !trapFocus) return;

      // A ref is preferred, but the shared lifecycle also owns overlays that
      // are rendered by a primitive or a legacy caller without one. Resolve
      // the top visible surface at event time so focus trapping is systemic,
      // not opt-in per modal.
      const container = containerRef?.current || visibleOverlayContainer();
      if (!container) return;

      const items = focusableElements(container);
      if (items.length === 0) {
        event.preventDefault();
        focusWithoutScroll(container);
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const activeIsContained =
        active instanceof Node &&
        (container.contains(active) || isInsideNestedPopover(active));

      if (event.shiftKey && (active === first || !activeIsContained)) {
        event.preventDefault();
        focusWithoutScroll(last);
      } else if (!event.shiftKey && (active === last || !activeIsContained)) {
        event.preventDefault();
        focusWithoutScroll(first);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopOverlay(overlayId) || !trapFocus) return;

      const container = containerRef?.current || visibleOverlayContainer();
      if (!container) return;

      const target = event.target;
      if (
        target instanceof Node &&
        (container.contains(target) || isInsideNestedPopover(target))
      ) {
        return;
      }

      const items = focusableElements(container);
      focusWithoutScroll(items[0] || container);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('focusin', handleFocusIn, { capture: true });

    const focusFrame = window.requestAnimationFrame(() => {
      if (!autoFocus || !isTopOverlay(overlayId)) return;
      const container = containerRef?.current || visibleOverlayContainer();
      const target =
        initialFocusRef?.current ||
        (container && initialFocusSelector
          ? container.querySelector<HTMLElement>(initialFocusSelector)
          : null) ||
        (container ? focusableElements(container)[0] : null) ||
        container;
      focusWithoutScroll(target);
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('focusin', handleFocusIn, { capture: true });
      popOverlay(overlayId);
      if (lockScroll) unlockBodyScroll();

      if (triggerElement && document.contains(triggerElement)) {
        window.requestAnimationFrame(() => focusWithoutScroll(triggerElement));
      }
    };
  }, [
    autoFocus,
    containerRef,
    initialFocusRef,
    initialFocusSelector,
    isOpen,
    lockScroll,
    restoreFocus,
    trapFocus,
  ]);
}
