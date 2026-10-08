'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/platform';

/**
 * Publishes the real usable viewport height as `--cz-vh`, plus how much of the
 * layout viewport the soft keyboard currently covers as `--cz-keyboard-h`.
 *
 * Why not `100dvh`: on Android WebView `dvh` tracks browser chrome, not the
 * IME. When the keyboard opens, `100dvh` stays at full height, so a shell
 * pinned to `height: 100dvh; overflow: hidden` keeps its full size while the
 * keyboard overlays it - the focused field ends up behind the keyboard and the
 * sticky action bar sits off screen.
 *
 * `visualViewport.height` is correct in BOTH regimes:
 *   - if the native layer already resized the WebView, it equals the layout
 *     viewport and this is a no-op;
 *   - if it did not (API < 34, adjustPan, or an OEM quirk), it shrinks while
 *     `dvh` does not, and this is the only accurate signal.
 *
 * It also works in a desktop browser and in the headless Playwright harness,
 * which makes the keyboard layout testable without a device.
 *
 * `--cz-keyboard-h` is deliberately "how much the IME covers the layout
 * viewport", not "how tall the IME is". Once the native side resizes properly
 * that value is 0 - which is correct, and is why the old
 * `padding-bottom: calc(5rem + var(--keyboard-height))` rules added a phantom
 * gap on top of an already-shrunk viewport.
 */

const KEYBOARD_OPEN_THRESHOLD_PX = 120;

export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    /*
      On native Android, NativeAppShell's Keyboard.addListener('keyboardWillShow'
      / 'keyboardWillHide') is the sole authority for the data-keyboard-open
      attribute - it reflects the OS's own show/hide intent immediately and
      deterministically. If this hook ALSO toggled the attribute from the
      threshold check below, the two sources raced during the keyboard's slide
      animation: the native event would hide the dock/FAB instantly, then an
      early visualViewport resize (reporting a partially-animated height) could
      report "not yet past threshold" and remove the attribute, showing the
      dock again for a frame before the next resize re-hid it - a visible
      flicker on every open/close. On web there is no native Keyboard plugin,
      so this threshold heuristic remains the only signal there.
    */
    const nativeKeyboardIsAuthoritative = isNativeApp();

    const applyFallback = () => {
      root.style.setProperty('--cz-vh', `${window.innerHeight}px`);
      root.style.setProperty('--cz-keyboard-h', '0px');
      root.style.setProperty('--keyboard-height', '0px');
      if (!nativeKeyboardIsAuthoritative) {
        root.removeAttribute('data-keyboard-open');
      }
    };

    if (!viewport) {
      applyFallback();
      window.addEventListener('resize', applyFallback);
      return () => window.removeEventListener('resize', applyFallback);
    }

    /*
      Applied synchronously rather than inside requestAnimationFrame. Setting
      three custom properties is trivial work, and deferring it left the shell
      one frame of stale height after a rotation - long enough for anything
      measuring immediately after a resize (including the smoke harness) to
      read the previous orientation's dimensions.
    */
    const sync = () => {
      const height = viewport.height;
      const covered = Math.max(0, window.innerHeight - height - viewport.offsetTop);
      root.style.setProperty('--cz-vh', `${Math.round(height)}px`);
      root.style.setProperty('--cz-keyboard-h', `${Math.round(covered)}px`);
      // Legacy alias: several rules still read --keyboard-height.
      root.style.setProperty('--keyboard-height', `${Math.round(covered)}px`);
      if (!nativeKeyboardIsAuthoritative) {
        root.toggleAttribute('data-keyboard-open', covered > KEYBOARD_OPEN_THRESHOLD_PX);
      }
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    // Rotation changes the layout viewport without necessarily firing a
    // visualViewport resize, which used to leave stale dimensions behind.
    window.addEventListener('orientationchange', sync);
    window.addEventListener('resize', sync);

    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
}

/**
 * Keeps the focused field above the keyboard.
 *
 * Replaces a 180ms `scrollIntoView({ block: 'center' })`, which fired
 * unconditionally on every keyboard open, fought the browser's own scroll
 * anchoring, and produced a visible jump even when the field was already
 * comfortably visible. This only scrolls when the field is actually obscured,
 * and only far enough to clear it.
 */
export function useKeepFocusedFieldVisible(actionBarPx = 64) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let visibilityTimeout: number | null = null;

    const ensureVisible = () => {
      visibilityTimeout = null;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      if (!focused.matches('input, textarea, select, [contenteditable="true"]')) return;

      const rect = focused.getBoundingClientRect();
      const floor = viewport.height - actionBarPx;
      if (rect.bottom > floor || rect.top < 0) {
        const reducedMotion =
          window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
          document.documentElement.dataset.animation === 'reduced';
        focused.scrollIntoView({
          block: 'nearest',
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
      }
    };

    const scheduleEnsureVisible = () => {
      if (visibilityTimeout !== null) {
        window.clearTimeout(visibilityTimeout);
      }
      visibilityTimeout = window.setTimeout(ensureVisible, 60);
    };

    viewport.addEventListener('resize', scheduleEnsureVisible);
    document.addEventListener('focusin', scheduleEnsureVisible);
    return () => {
      viewport.removeEventListener('resize', scheduleEnsureVisible);
      document.removeEventListener('focusin', scheduleEnsureVisible);
      if (visibilityTimeout !== null) {
        window.clearTimeout(visibilityTimeout);
      }
    };
  }, [actionBarPx]);
}
