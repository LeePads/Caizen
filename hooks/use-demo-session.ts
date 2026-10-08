'use client';
import { useSyncExternalStore } from 'react';
import { getDemoSession, subscribeDemoSession } from '@/lib/demo/demo-session';
export function useDemoSession() {
  return useSyncExternalStore(subscribeDemoSession, getDemoSession, () => null);
}
