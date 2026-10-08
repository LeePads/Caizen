import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeTopOverlay,
  isTopOverlay,
  overlayDepth,
  popOverlay,
  pushOverlay,
  resetOverlayStackForTests,
} from '@/lib/native/overlay-stack';

afterEach(() => {
  resetOverlayStackForTests();
});

describe('overlay stack', () => {
  it('closes only the most-recently-opened overlay', () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    pushOverlay(closeFirst);
    const secondId = pushOverlay(closeSecond);

    expect(isTopOverlay(secondId)).toBe(true);
    expect(closeTopOverlay()).toBe(true);
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(closeFirst).not.toHaveBeenCalled();
  });

  it('falls back to the next overlay after the top one is popped', () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const firstId = pushOverlay(closeFirst);
    const secondId = pushOverlay(closeSecond);

    popOverlay(secondId);
    expect(isTopOverlay(firstId)).toBe(true);
    expect(closeTopOverlay()).toBe(true);
    expect(closeFirst).toHaveBeenCalledTimes(1);
  });

  it('returns false when nothing is registered, so callers can use legacy handling', () => {
    expect(overlayDepth()).toBe(0);
    expect(closeTopOverlay()).toBe(false);
  });

  it('does not throw when popping an id that is not on the stack', () => {
    const close = vi.fn();
    pushOverlay(close);
    expect(() => popOverlay(9999)).not.toThrow();
    expect(overlayDepth()).toBe(1);
  });
});
