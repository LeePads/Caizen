import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';
import { isAndroid } from '../platform';
import {
  createSingleListenerRegistry,
  decideAndroidBackAction,
} from './back-navigation';
import {
  closeTopOverlay as closeStackedOverlay,
  overlayDepth,
} from './overlay-stack';
import {
  consumePreviousRootSection,
  hasPreviousRootSection,
  landOnDashboardViaBack,
} from './root-nav-history';

type NativeBackRequestDetail = {
  handled: boolean;
  kind: 'overlay' | 'nested-flow';
};

const requestReactBackNavigation = (
  kind: NativeBackRequestDetail['kind'],
) => {
  const detail: NativeBackRequestDetail = {
    handled: false,
    kind,
  };
  window.dispatchEvent(
    new CustomEvent('caizen:native-back-request', { detail }),
  );
  return detail.handled;
};

const closeTopOverlay = () => {
  // Stack-registered overlays (ConfirmDialog, CaizenBottomSheet) know their
  // true open order, so this closes the actual topmost one first.
  if (closeStackedOverlay()) return;
  if (requestReactBackNavigation('overlay')) return;
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
};

const registerOnce = createSingleListenerRegistry<PluginListenerHandle>(
  () => App.addListener('backButton', async () => {
    const html = document.documentElement;
    const section =
      document.querySelector<HTMLElement>('[data-caizen-section]')
        ?.dataset.caizenSection ?? 'dashboard';
    const overlayOpen =
      overlayDepth() > 0 ||
      Boolean(
        document.querySelector(
          '[data-caizen-overlay="open"], [role="dialog"][data-state="open"], [data-slot="popover-content"][data-state="open"], [data-slot="select-content"][data-state="open"], [data-slot="dropdown-menu-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"], [data-slot="drawer-content"][data-state="open"], .caizen-mobile-sheet-root',
        ),
      );
    const nestedFlowOpen = Boolean(document.querySelector(
      '[data-caizen-nested-flow="open"]',
    ));
    const action = decideAndroidBackAction({
      keyboardVisible: html.hasAttribute('data-keyboard-open'),
      overlayOpen,
      nestedFlowOpen,
      hasAppHistory: hasPreviousRootSection(),
      section,
    });

    if (action === 'dismiss-keyboard') {
      await Keyboard.hide().catch(() => undefined);
      return;
    }
    if (action === 'close-overlay') {
      closeTopOverlay();
      return;
    }
    if (action === 'close-nested-flow') {
      requestReactBackNavigation('nested-flow');
      return;
    }
    if (action === 'navigate-history') {
      const target = consumePreviousRootSection();
      window.dispatchEvent(
        new CustomEvent('caizen:navigate', {
          detail: { section: target ?? 'dashboard' },
        }),
      );
      return;
    }
    if (action === 'navigate-dashboard') {
      landOnDashboardViaBack();
      window.dispatchEvent(
        new CustomEvent('caizen:navigate', {
          detail: { section: 'dashboard' },
        }),
      );
      return;
    }
    if (action === 'open-exit-dialog') {
      window.dispatchEvent(
        new CustomEvent('caizen:exit-request'),
      );
    }
  }),
  (listener) => listener.remove(),
);

export async function registerAndroidBackHandler(): Promise<() => Promise<void>> {
  if (!isAndroid()) return async () => undefined;
  return registerOnce();
}

export async function minimizeAndroidApp(): Promise<void> {
  await App.minimizeApp();
}
