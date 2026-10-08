import type {
  CapacitorConfig,
} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.caizen.life',
  appName: 'Caizen',
  webDir: 'out',

  // Native fallback shown before the WebView applies the saved theme.
  // Comfort Dark is the safest default for both day and night use.
  backgroundColor: '#191a18',

  android: {
    allowMixedContent: false,

    // Keep IME composition, swipe typing, autocorrect, and CJK candidates.
    captureInput: false,

    // Capacitor derives WebView debugging from Android's debuggable flag.
    // A release build must not inherit the environment used for cap sync.
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor:
        '#191a18ff',
      androidScaleType:
        'CENTER_CROP',
      showSpinner: false,
    },

    Keyboard: {
      // Android sizing remains controlled by adjustResize in the manifest.
      resizeOnFullScreen:
        false,
    },

    LocalNotifications: {
      smallIcon:
        'ic_stat_caizen',
      iconColor:
        '#f59e0b',
    },
  },
};

export default config;
