export type AndroidBackAction =
  | 'dismiss-keyboard'
  | 'close-overlay'
  | 'close-nested-flow'
  | 'navigate-history'
  | 'navigate-dashboard'
  | 'open-exit-dialog';

export type AndroidBackState = {
  keyboardVisible: boolean;
  overlayOpen: boolean;
  nestedFlowOpen: boolean;
  hasAppHistory: boolean;
  section: string;
};

export function decideAndroidBackAction(
  state: AndroidBackState,
): AndroidBackAction {
  if (state.keyboardVisible) return 'dismiss-keyboard';
  if (state.overlayOpen) return 'close-overlay';
  if (state.nestedFlowOpen) return 'close-nested-flow';
  if (state.hasAppHistory) return 'navigate-history';
  if (state.section !== 'dashboard') return 'navigate-dashboard';
  return 'open-exit-dialog';
}

export function createSingleListenerRegistry<T>(
  addListener: () => Promise<T>,
  removeListener: (listener: T) => Promise<void>,
) {
  let listenerPromise: Promise<T> | null = null;
  let consumers = 0;

  return async () => {
    consumers += 1;
    listenerPromise ??= addListener();
    let released = false;

    return async () => {
      if (released) return;
      released = true;
      consumers = Math.max(0, consumers - 1);

      if (consumers === 0 && listenerPromise) {
        const listener = await listenerPromise;
        listenerPromise = null;
        await removeListener(listener);
      }
    };
  };
}
