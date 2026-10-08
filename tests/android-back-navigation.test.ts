import { describe, expect, it, vi } from 'vitest';

import {
  createSingleListenerRegistry,
  decideAndroidBackAction,
} from '@/lib/native/back-navigation';

const baseState = {
  keyboardVisible: false,
  overlayOpen: false,
  nestedFlowOpen: false,
  hasAppHistory: false,
  section: 'dashboard',
};

describe('Android Back navigation decisions', () => {
  it('dismisses the keyboard before navigating', () => {
    expect(decideAndroidBackAction({
      ...baseState,
      keyboardVisible: true,
      overlayOpen: true,
    })).toBe('dismiss-keyboard');
  });

  it.each([
    ['dialog', { overlayOpen: true }, 'close-overlay'],
    ['sheet', { overlayOpen: true }, 'close-overlay'],
    ['nested detail', { nestedFlowOpen: true }, 'close-nested-flow'],
    ['application history', { hasAppHistory: true }, 'navigate-history'],
    ['secondary root', { section: 'health' }, 'navigate-dashboard'],
  ])('handles %s before exit', (_name, state, action) => {
    expect(decideAndroidBackAction({
      ...baseState,
      ...state,
    })).toBe(action);
  });

  it('opens an explicit exit dialog at the Dashboard root', () => {
    expect(decideAndroidBackAction(baseState)).toBe('open-exit-dialog');
  });

  it('prevents duplicate native listener registration', async () => {
    const listener = {};
    const add = vi.fn(async () => listener);
    const remove = vi.fn(async () => undefined);
    const register = createSingleListenerRegistry(add, remove);

    const releaseFirst = await register();
    const releaseSecond = await register();

    expect(add).toHaveBeenCalledTimes(1);
    await releaseFirst();
    expect(remove).not.toHaveBeenCalled();
    await releaseSecond();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
