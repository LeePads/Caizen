'use client';

import { useSyncExternalStore } from 'react';

const subscribers = new Set<() => void>();
let observer: MutationObserver | null = null;
let reducedMotionQuery: MediaQueryList | null = null;

type CaizenMotionMode = 'full' | 'android' | 'constrained' | 'reduced';

function getMotionMode(): CaizenMotionMode {
  if (typeof window === 'undefined') return 'reduced';
  const root = document.documentElement;
  if (root.dataset.animation === 'reduced'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
  if (root.dataset.caizenPerformance === 'constrained') return 'constrained';
  return root.dataset.capacitor === 'true' ? 'android' : 'full';
}

function notifySubscribers() {
  subscribers.forEach(subscriber => subscriber());
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber);

  if (subscribers.size === 1 && typeof window !== 'undefined') {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionQuery.addEventListener('change', notifySubscribers);
    observer = new MutationObserver(notifySubscribers);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-animation', 'data-caizen-performance', 'data-capacitor'],
    });
  }

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      reducedMotionQuery?.removeEventListener('change', notifySubscribers);
      observer?.disconnect();
      reducedMotionQuery = null;
      observer = null;
    }
  };
}

export function useCaizenMotionEnabled() {
  const mode = useSyncExternalStore(subscribe, getMotionMode, () => 'reduced');
  return mode === 'full' || mode === 'android';
}

export function useCaizenMotionMode() {
  return useSyncExternalStore(subscribe, getMotionMode, (): CaizenMotionMode => 'reduced');
}
