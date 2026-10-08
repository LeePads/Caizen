import type {
  Metadata,
  Viewport,
} from 'next';
import type {
  ReactNode,
} from 'react';

import './globals.css';

import {
  Analytics,
} from '@vercel/analytics/next';

import {
  ThemeProvider,
} from '@/lib/theme';
import {
  Toaster,
} from '@/components/ui/toaster';
import { getSiteUrl, PRODUCTION_SITE_URL } from '@/lib/site-url';

const SITE_URL = getSiteUrl();
const SHOULD_INDEX_SITE = SITE_URL === PRODUCTION_SITE_URL && process.env.VERCEL_ENV !== 'preview';

const SHOULD_MOUNT_VERCEL_ANALYTICS =
  process.env.NODE_ENV === 'production' &&
  process.env.VERCEL === '1' &&
  process.env.CAPACITOR_BUILD !== '1';

const THEME_BOOT_SCRIPT = `
(() => {
  try {
    const validThemes = new Set(['system', 'light', 'dark']);
    const validDarkStyles = new Set(['comfort', 'night', 'amoled']);
    const validLightStyles = new Set(['comfort', 'caizen', 'clean']);

    const storedTheme = localStorage.getItem('theme-preference');
    const theme = validThemes.has(storedTheme)
      ? storedTheme
      : 'system';

    const storedDarkStyle = localStorage.getItem('theme-dark-style');
    const darkStyle = validDarkStyles.has(storedDarkStyle)
      ? storedDarkStyle
      : 'comfort';

    const storedLightStyle = localStorage.getItem('theme-light-style');
    const lightStyle = validLightStyles.has(storedLightStyle)
      ? storedLightStyle
      : 'comfort';

    const resolvedTheme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;

    const darkBackgrounds = {
      comfort: '#1b1e22',
      night: '#0f141a',
      amoled: '#000000',
    };

    const lightBackgrounds = {
      comfort: '#E9EBEE',
      caizen: '#E7EEF1',
      clean: '#F7F8FA',
    };

    const backgroundColor =
      resolvedTheme === 'dark'
        ? darkBackgrounds[darkStyle]
        : lightBackgrounds[lightStyle];

    const root = document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.resolvedTheme = resolvedTheme;
    root.dataset.darkStyle = darkStyle;
    root.dataset.lightStyle = lightStyle;
    root.style.backgroundColor = backgroundColor;
  } catch {
    // Caizen still renders using the CSS defaults when storage is unavailable.
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      'Caizen — Personal Life Manager',
    template:
      '%s • Caizen',
  },
  description:
    'Your life, continuously refined. Caizen brings routines, health, productivity, finances, goals, media, and personal organization into one evolving system.',
  applicationName:
    'Caizen',
  category:
    'productivity',
  manifest:
    '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Caizen',
    statusBarStyle:
      'black-translucent',
  },
  keywords: [
    'Caizen',
    'life management',
    'personal productivity',
    'routine tracker',
    'health tracker',
    'goal tracking',
    'personal operating system',
  ],
  authors: [
    {
      name:
        'Micaiah Alban',
    },
  ],
  creator:
    'Micaiah Alban',
  icons: {
    icon: [
      {
        url: '/icons/caizen-favicon-512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    shortcut: '/icons/caizen-favicon-512.png',
    apple: '/icons/caizen-desktop-icon-1024.png',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName:
      'Caizen',
    title:
      'Caizen — Personal Life Manager',
    description:
      'A local-first personal operating system for routines, health, productivity, finances, goals, media, and everyday life.',
    images: [
      {
        url: '/icons/caizen-desktop-icon-1024.png',
        width: 1024,
        height: 1024,
        alt: 'Caizen',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title:
      'Caizen — Personal Life Manager',
    description:
      'A local-first personal operating system for routines, health, productivity, finances, goals, media, and everyday life.',
    images: [
      '/icons/caizen-desktop-icon-1024.png',
    ],
  },
  robots: {
    index: SHOULD_INDEX_SITE,
    follow: SHOULD_INDEX_SITE,
  },
};

export const viewport: Viewport = {
  width:
    'device-width',
  initialScale: 1,
  viewportFit:
    'cover',
  colorScheme:
    'light dark',
  themeColor: [
    {
      media:
        '(prefers-color-scheme: light)',
      color:
        '#E9EBEE',
    },
    {
      media:
        '(prefers-color-scheme: dark)',
      color:
        '#1b1e22',
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children:
    ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="scroll-smooth overflow-x-hidden"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              THEME_BOOT_SCRIPT,
          }}
        />
      </head>

      <body className="min-h-screen w-full overflow-x-hidden bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-foreground">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>

        {SHOULD_MOUNT_VERCEL_ANALYTICS ? <Analytics /> : null}
      </body>
    </html>
  );
}
