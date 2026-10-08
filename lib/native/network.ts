import { Network } from '@capacitor/network';
import { dispatchNativeEvent, isNativeApp } from '../platform';

export async function registerNetworkAwareness(): Promise<() => Promise<void>> {
  if (!isNativeApp()) {
    const update = () => dispatchNativeEvent('network', { connected: navigator.onLine });
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return async () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }
  dispatchNativeEvent('network', await Network.getStatus());
  const listener = await Network.addListener('networkStatusChange', (status) =>
    dispatchNativeEvent('network', status),
  );
  return () => listener.remove();
}
