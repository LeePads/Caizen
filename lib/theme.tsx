'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { normalizeExternalWebUrl } from './native/open-link';

export type Theme =
  | 'light'
  | 'dark'
  | 'system';

export type DarkStyle =
  | 'comfort'
  | 'night'
  | 'amoled';

export type LightStyle =
  | 'comfort'
  | 'caizen'
  | 'clean';

type ThemeScheme =
  | 'cyan'
  | 'blue'
  | 'violet'
  | 'purple'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'slate'
  | 'custom'
  | 'mono';

type Density =
  | 'comfortable'
  | 'compact'
  | 'dense';

type AnimationPreference =
  | 'full'
  | 'reduced';

interface ThemeContextType {
  theme: Theme;
  darkStyle: DarkStyle;
  lightStyle: LightStyle;
  scheme: ThemeScheme;
  backgroundImage: string;
  backgroundOpacity: number;
  density: Density;
  animationPreference: AnimationPreference;
  useAlbumArtBackground: boolean;
  customAccent: string;
  sectionTransparency: number;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setDarkStyle: (style: DarkStyle) => void;
  setLightStyle: (style: LightStyle) => void;
  setScheme: (scheme: ThemeScheme) => void;
  setBackgroundImage: (url: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setDensity: (density: Density) => void;
  setAnimationPreference: (preference: AnimationPreference) => void;
  setUseAlbumArtBackground: (enabled: boolean) => void;
  setCustomAccent: (hex: string) => void;
  setSectionTransparency: (percent: number) => void;
}

export const MAX_SECTION_TRANSPARENCY = 40;

const DEFAULT_CUSTOM_ACCENT = '#c79232';
const DEFAULT_DARK_STYLE: DarkStyle = 'comfort';
const DEFAULT_LIGHT_STYLE: LightStyle = 'comfort';
const DEFAULT_THEME_SCHEME: ThemeScheme = 'violet';

const DARK_STYLE_BACKGROUNDS: Record<DarkStyle, string> = {
  comfort: '#1b1e22',
  night: '#0f141a',
  amoled: '#000000',
};

export const LIGHT_STYLE_OPTIONS: Array<{
  id: LightStyle;
  label: string;
  description: string;
  background: string;
  surface: string;
  secondary: string;
  toolbar: string;
  raised: string;
}> = [
  {
    id: 'comfort',
    label: 'Comfort Light',
    description: 'Softer gray for long sessions',
    background: '#E7E8E6',
    surface: '#F5F5F2',
    secondary: '#ECEFEC',
    toolbar: '#E5E9E6',
    raised: '#FDFDFC',
  },
  {
    id: 'caizen',
    label: 'Caizen Light',
    description: 'Cool blue-gray Caizen neutral',
    background: '#E2EAEC',
    surface: '#F3F7F7',
    secondary: '#EAF0F1',
    toolbar: '#E3EBED',
    raised: '#FCFDFD',
  },
  {
    id: 'clean',
    label: 'Clean Light',
    description: 'Bright, crisp neutral',
    background: '#F1F2F2',
    surface: '#F8FAF9',
    secondary: '#EFF3F2',
    toolbar: '#EAEFEE',
    raised: '#FFFFFF',
  },
];

const VALID_THEMES = new Set<Theme>([
  'light',
  'dark',
  'system',
]);

const VALID_DARK_STYLES = new Set<DarkStyle>([
  'comfort',
  'night',
  'amoled',
]);

const VALID_LIGHT_STYLES = new Set<LightStyle>([
  'comfort',
  'caizen',
  'clean',
]);

function isTheme(value: string | null): value is Theme {
  return Boolean(value && VALID_THEMES.has(value as Theme));
}

function isDarkStyle(value: string | null): value is DarkStyle {
  return Boolean(value && VALID_DARK_STYLES.has(value as DarkStyle));
}

function isLightStyle(value: string | null): value is LightStyle {
  return Boolean(value && VALID_LIGHT_STYLES.has(value as LightStyle));
}

function applyCustomAccent(
  html: HTMLElement,
  scheme: ThemeScheme,
  hex: string,
) {
  const properties = [
    '--primary',
    '--ring',
    '--chart-1',
    '--accent',
    '--primary-foreground',
  ];

  if (scheme !== 'custom') {
    properties.forEach(property =>
      html.style.removeProperty(property),
    );
    return;
  }

  const normalized = /^#[0-9a-f]{6}$/i.test(hex)
    ? hex
    : DEFAULT_CUSTOM_ACCENT;

  const rgb = normalized
    .slice(1)
    .match(/.{2}/g)!
    .map(value => parseInt(value, 16));

  const luminance =
    (0.2126 * rgb[0] +
      0.7152 * rgb[1] +
      0.0722 * rgb[2]) /
    255;

  html.style.setProperty('--primary', normalized);
  html.style.setProperty('--ring', normalized);
  html.style.setProperty('--chart-1', normalized);
  html.style.setProperty(
    '--accent',
    `color-mix(in oklch, ${normalized} 14%, var(--background))`,
  );
  html.style.setProperty(
    '--primary-foreground',
    luminance > 0.62 ? '#111827' : '#ffffff',
  );
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function syncBrowserThemeColor(color: string) {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach(meta => {
      meta.content = color;
    });
}

function applyResolvedTheme(
  theme: Theme,
  darkStyle: DarkStyle,
  lightStyle: LightStyle,
) {
  const html = document.documentElement;
  const resolvedTheme = resolveTheme(theme);
  const backgroundColor =
    resolvedTheme === 'dark'
      ? DARK_STYLE_BACKGROUNDS[darkStyle]
      : LIGHT_STYLE_OPTIONS.find(
          option => option.id === lightStyle,
        )?.background ?? LIGHT_STYLE_OPTIONS[0].background;

  html.classList.toggle(
    'dark',
    resolvedTheme === 'dark',
  );

  html.dataset.resolvedTheme = resolvedTheme;
  html.dataset.darkStyle = darkStyle;
  html.dataset.lightStyle = lightStyle;
  html.style.setProperty(
    '--native-app-background',
    backgroundColor,
  );

  syncBrowserThemeColor(backgroundColor);

  window.dispatchEvent(
    new CustomEvent('caizen:theme-resolved', {
      detail: {
        resolvedTheme,
        darkStyle,
        lightStyle,
        backgroundColor,
      },
    }),
  );
}

const ThemeContext =
  createContext<
    ThemeContextType | undefined
  >(undefined);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] =
    useState<Theme>('system');

  const [darkStyle, setDarkStyleState] =
    useState<DarkStyle>(DEFAULT_DARK_STYLE);

  const [lightStyle, setLightStyleState] =
    useState<LightStyle>(DEFAULT_LIGHT_STYLE);

  const [scheme, setSchemeState] =
    useState<ThemeScheme>(DEFAULT_THEME_SCHEME);

  const [backgroundImage, setBackgroundImageState] =
    useState('');

  const [backgroundOpacity, setBackgroundOpacityState] =
    useState(18);

  const [density, setDensityState] =
    useState<Density>('comfortable');

  const [animationPreference, setAnimationPreferenceState] =
    useState<AnimationPreference>('full');

  const [useAlbumArtBackground, setUseAlbumArtBackgroundState] =
    useState(false);

  const [customAccent, setCustomAccentState] =
    useState(DEFAULT_CUSTOM_ACCENT);

  const [sectionTransparency, setSectionTransparencyState] =
    useState(0);

  const [isHydrated, setIsHydrated] =
    useState(false);

  const applyTheme = (
    newTheme: Theme,
    newScheme = scheme,
    newBackgroundImage = backgroundImage,
    newBackgroundOpacity = backgroundOpacity,
    newDensity = density,
    newAnimationPreference = animationPreference,
    newCustomAccent = customAccent,
    newDarkStyle = darkStyle,
    newLightStyle = lightStyle,
  ) => {
    const html = document.documentElement;

    applyResolvedTheme(
      newTheme,
      newDarkStyle,
      newLightStyle,
    );

    localStorage.setItem(
      'theme-preference',
      newTheme,
    );

    localStorage.setItem(
      'theme-dark-style',
      newDarkStyle,
    );

    localStorage.setItem(
      'theme-light-style',
      newLightStyle,
    );

    html.dataset.themeScheme =
      newScheme;

    applyCustomAccent(
      html,
      newScheme,
      newCustomAccent,
    );

    html.dataset.density =
      newDensity;

    html.dataset.animation =
      newAnimationPreference;

    html.style.setProperty(
      '--app-bg-photo',
      newBackgroundImage
        ? `url("${newBackgroundImage.replace(/"/g, '\\"')}")`
        : 'none',
    );

    html.style.setProperty(
      '--app-bg-photo-opacity',
      String(
        Math.min(
          0.36,
          Math.max(
            0,
            newBackgroundOpacity / 100,
          ),
        ),
      ),
    );

    localStorage.setItem(
      'theme-scheme',
      newScheme,
    );

    localStorage.setItem(
      'theme-background-image',
      newBackgroundImage,
    );

    localStorage.setItem(
      'theme-background-opacity',
      String(newBackgroundOpacity),
    );

    localStorage.setItem(
      'ui-density',
      newDensity,
    );

    localStorage.setItem(
      'ui-animation-preference',
      newAnimationPreference,
    );
  };

  const applySectionTransparency = (
    percent: number,
  ) => {
    const clamped = Math.min(
      MAX_SECTION_TRANSPARENCY,
      Math.max(0, percent),
    );

    document.documentElement.style.setProperty(
      '--section-surface-opacity',
      `${100 - clamped}%`,
    );

    return clamped;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedTheme =
      localStorage.getItem(
        'theme-preference',
      );

    const initialTheme =
      isTheme(storedTheme)
        ? storedTheme
        : 'system';

    const storedDarkStyle =
      localStorage.getItem(
        'theme-dark-style',
      );

    const initialDarkStyle =
      isDarkStyle(storedDarkStyle)
        ? storedDarkStyle
        : DEFAULT_DARK_STYLE;

    const storedLightStyle =
      localStorage.getItem(
        'theme-light-style',
      );

    const initialLightStyle =
      isLightStyle(storedLightStyle)
        ? storedLightStyle
        : DEFAULT_LIGHT_STYLE;

    const storedScheme =
      localStorage.getItem(
        'theme-scheme',
      ) as ThemeScheme | null;

    const storedBackground =
      localStorage.getItem(
        'theme-background-image',
      ) || '';

    const storedOpacity =
      Number(
        localStorage.getItem(
          'theme-background-opacity',
        ) || 18,
      );

    const storedDensity =
      localStorage.getItem(
        'ui-density',
      ) as Density | null;

    const storedAnimationPreference =
      localStorage.getItem(
        'ui-animation-preference',
      ) as AnimationPreference | null;

    const storedAlbumArtBackground =
      localStorage.getItem(
        'ui-album-art-background',
      ) === 'true';

    const storedCustomAccent =
      localStorage.getItem(
        'theme-custom-accent',
      ) || DEFAULT_CUSTOM_ACCENT;

    const storedSectionTransparency =
      Number(
        localStorage.getItem(
          'theme-section-transparency',
        ) || 0,
      );

    setTheme(initialTheme);
    setDarkStyleState(initialDarkStyle);
    setLightStyleState(initialLightStyle);
    setSchemeState(storedScheme || DEFAULT_THEME_SCHEME);
    setBackgroundImageState(storedBackground);
    setBackgroundOpacityState(storedOpacity);
    setDensityState(
      storedDensity || 'comfortable',
    );
    setAnimationPreferenceState(
      storedAnimationPreference || 'full',
    );
    setUseAlbumArtBackgroundState(
      storedAlbumArtBackground,
    );
    setCustomAccentState(
      storedCustomAccent,
    );

    setSectionTransparencyState(
      applySectionTransparency(
        storedSectionTransparency,
      ),
    );

    applyTheme(
      initialTheme,
      storedScheme || DEFAULT_THEME_SCHEME,
      storedBackground,
      storedOpacity,
      storedDensity || 'comfortable',
      storedAnimationPreference || 'full',
      storedCustomAccent,
      initialDarkStyle,
      initialLightStyle,
    );

    setIsHydrated(true);
    // The first application intentionally runs once with persisted values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !isHydrated ||
      theme !== 'system'
    ) {
      return;
    }

    const colorScheme =
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      );

    const handleSystemThemeChange =
      () =>
        applyResolvedTheme(
          'system',
          darkStyle,
          lightStyle,
        );

    colorScheme.addEventListener(
      'change',
      handleSystemThemeChange,
    );

    return () => {
      colorScheme.removeEventListener(
        'change',
        handleSystemThemeChange,
      );
    };
  }, [
    darkStyle,
    isHydrated,
    lightStyle,
    theme,
  ]);

  const toggleTheme = () => {
    const newTheme =
      theme === 'dark'
        ? 'light'
        : 'dark';

    setThemePreference(newTheme);
  };

  const setThemePreference = (
    newTheme: Theme,
  ) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const setDarkStyle = (
    newDarkStyle: DarkStyle,
  ) => {
    setDarkStyleState(
      newDarkStyle,
    );

    applyTheme(
      theme,
      scheme,
      backgroundImage,
      backgroundOpacity,
      density,
      animationPreference,
      customAccent,
      newDarkStyle,
      lightStyle,
    );
  };

  const setLightStyle = (
    newLightStyle: LightStyle,
  ) => {
    setLightStyleState(newLightStyle);

    applyTheme(
      theme,
      scheme,
      backgroundImage,
      backgroundOpacity,
      density,
      animationPreference,
      customAccent,
      darkStyle,
      newLightStyle,
    );
  };

  const setScheme = (
    newScheme: ThemeScheme,
  ) => {
    setSchemeState(newScheme);

    applyTheme(
      theme,
      newScheme,
    );
  };

  const setBackgroundImage = (
    url: string,
  ) => {
    const next = url.trim() ? normalizeExternalWebUrl(url) : '';
    if (next === null) return;
    setBackgroundImageState(next);

    applyTheme(
      theme,
      scheme,
      next,
    );
  };

  const setBackgroundOpacity = (
    opacity: number,
  ) => {
    setBackgroundOpacityState(
      opacity,
    );

    applyTheme(
      theme,
      scheme,
      backgroundImage,
      opacity,
    );
  };

  const setDensity = (
    newDensity: Density,
  ) => {
    setDensityState(newDensity);

    applyTheme(
      theme,
      scheme,
      backgroundImage,
      backgroundOpacity,
      newDensity,
      animationPreference,
    );
  };

  const setAnimationPreference = (
    preference: AnimationPreference,
  ) => {
    setAnimationPreferenceState(
      preference,
    );

    applyTheme(
      theme,
      scheme,
      backgroundImage,
      backgroundOpacity,
      density,
      preference,
    );
  };

  const setUseAlbumArtBackground = (
    enabled: boolean,
  ) => {
    setUseAlbumArtBackgroundState(
      enabled,
    );

    localStorage.setItem(
      'ui-album-art-background',
      String(enabled),
    );
  };

  const setSectionTransparency = (
    percent: number,
  ) => {
    const clamped = applySectionTransparency(percent);

    setSectionTransparencyState(clamped);

    localStorage.setItem(
      'theme-section-transparency',
      String(clamped),
    );
  };

  const setCustomAccent = (
    hex: string,
  ) => {
    if (
      !/^#[0-9a-f]{6}$/i.test(hex)
    ) {
      return;
    }

    setCustomAccentState(hex);
    setSchemeState('custom');

    localStorage.setItem(
      'theme-custom-accent',
      hex,
    );

    applyTheme(
      theme,
      'custom',
      backgroundImage,
      backgroundOpacity,
      density,
      animationPreference,
      hex,
    );
  };

  if (!isHydrated) {
    return (
      <div
        className="caizen-boot"
        role="status"
        aria-label="Loading Caizen"
      >
        <div className="caizen-boot-mark">
          <img
            src="/icons/caizen-monochrome-black-1024.png"
            alt=""
            className="dark:hidden"
          />
          <img
            src="/icons/caizen-monochrome-white-1024.png"
            alt=""
            className="hidden dark:block"
          />
          <span className="caizen-boot-orbit" />
        </div>

        <div className="caizen-boot-copy">
          <strong>CAIZEN</strong>
          <span>
            Your life, continuously refined
          </span>
        </div>

        <span className="caizen-boot-line" />
      </div>
    );
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        darkStyle,
        lightStyle,
        scheme,
        backgroundImage,
        backgroundOpacity,
        density,
        animationPreference,
        useAlbumArtBackground,
        customAccent,
        sectionTransparency,
        toggleTheme,
        setTheme:
          setThemePreference,
        setDarkStyle,
        setLightStyle,
        setScheme,
        setBackgroundImage,
        setBackgroundOpacity,
        setDensity,
        setAnimationPreference,
        setUseAlbumArtBackground,
        setCustomAccent,
        setSectionTransparency,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context =
    useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'useTheme must be used within ThemeProvider',
    );
  }

  return context;
}
