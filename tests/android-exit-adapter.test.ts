import { beforeEach, describe, expect, it, vi } from 'vitest';

const minimizeApp = vi.fn(async () => undefined);

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    minimizeApp,
  },
}));

describe('Android exit adapter', () => {
  beforeEach(() => {
    minimizeApp.mockClear();
  });

  it('minimizes through the Capacitor App integration only after confirmation', async () => {
    const { minimizeAndroidApp } = await import('@/lib/native/back-handler');
    await minimizeAndroidApp();
    expect(minimizeApp).toHaveBeenCalledTimes(1);
  });
});
