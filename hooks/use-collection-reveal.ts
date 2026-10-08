'use client';

import { useLayoutEffect, useRef } from 'react';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';

/** Attach to a container with direct children marked data-caizen-collection-item.
 * Pass committed controls only; search is represented by the visible IDs/order.
 * CSS animation names alternate on the same DOM nodes, never React record keys.
 */
export function useCollectionReveal<T extends HTMLElement = HTMLDivElement>(
  visibleIds: readonly (string | number)[],
  controls: readonly unknown[] = [],
) {
  const ref = useRef<T>(null);
  const mode = useCaizenMotionMode();
  const signature = JSON.stringify([visibleIds, controls, mode]);
  const previous = useRef<{ container: T; signature: string } | null>(null);

  // Inspect after each commit so a conditionally mounted result container is
  // handled even when its IDs are unchanged. Unrelated renders do no DOM work.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) {
      previous.current = null;
      return;
    }
    if (previous.current?.container === container && previous.current.signature === signature) return;
    previous.current = { container, signature };

    const records = Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.caizenCollectionItem === 'true',
    );
    records.forEach((child, index) => {
      if (mode === 'reduced') {
        child.removeAttribute('data-caizen-grid-reveal');
        return;
      }
      child.style.setProperty('--caizen-grid-index', String(Math.min(index, 9)));
      child.dataset.caizenGridRevealPhase = child.dataset.caizenGridRevealPhase === 'a' ? 'b' : 'a';
      child.dataset.caizenGridReveal = 'true';
    });
  });

  return ref;
}
