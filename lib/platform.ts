import { Capacitor } from '@capacitor/core';

export type CaizenPlatform = 'android' | 'ios' | 'web';

export const getPlatform = (): CaizenPlatform => {
  if (typeof window === 'undefined') return 'web';
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
};

export const isNativeApp = () =>
  typeof window !== 'undefined' && Capacitor.isNativePlatform();

export const isAndroid = () => getPlatform() === 'android';

export const dispatchNativeEvent = <T>(name: string, detail: T) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`caizen:${name}`, { detail }));
  }
};
