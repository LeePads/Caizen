'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  Check,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';

import {
  type DarkStyle,
  type LightStyle,
  type Theme,
  LIGHT_STYLE_OPTIONS,
  useTheme,
} from '@/lib/theme';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const modeOptions: Array<{
  id: Theme;
  label: string;
  icon: typeof Monitor;
}> = [
  {
    id: 'system',
    label: 'System',
    icon: Monitor,
  },
  {
    id: 'light',
    label: 'Light',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: Moon,
  },
];

export const DARK_STYLE_OPTIONS: Array<{
  id: DarkStyle;
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
    label: 'Comfort Dark',
    description: 'Soft charcoal for long sessions',
    background: '#1b1e22',
    surface: '#24282d',
    secondary: '#2a2f35',
    toolbar: '#333a42',
    raised: '#2a2f35',
  },
  {
    id: 'night',
    label: 'Caizen Night',
    description: 'Deep navy-charcoal',
    background: '#0f141a',
    surface: '#151c24',
    secondary: '#1a242d',
    toolbar: '#26343f',
    raised: '#1b252e',
  },
  {
    id: 'amoled',
    label: 'AMOLED Black',
    description: 'Maximum black contrast',
    background: '#000000',
    surface: '#0c0e0f',
    secondary: '#0d1011',
    toolbar: '#181c1d',
    raised: '#070809',
  },
];

export function ThemeToggle() {
  const {
    theme,
    darkStyle,
    lightStyle,
    setTheme,
    setDarkStyle,
    setLightStyle,
  } = useTheme();

  const [resolvedTheme, setResolvedTheme] =
    useState<'light' | 'dark'>(() =>
      typeof document !== 'undefined' &&
      document.documentElement.dataset.resolvedTheme === 'dark'
        ? 'dark'
        : 'light',
    );

  useEffect(() => {
    const syncResolvedTheme = () => {
      setResolvedTheme(
        document.documentElement.dataset.resolvedTheme === 'dark'
          ? 'dark'
          : 'light',
      );
    };

    syncResolvedTheme();
    window.addEventListener(
      'caizen:theme-resolved',
      syncResolvedTheme,
    );

    return () =>
      window.removeEventListener(
        'caizen:theme-resolved',
        syncResolvedTheme,
      );
  }, [theme]);

  const effectiveTheme =
    theme === 'system'
      ? resolvedTheme
      : theme;

  const styleOptions =
    effectiveTheme === 'dark'
      ? DARK_STYLE_OPTIONS
      : LIGHT_STYLE_OPTIONS;

  const activeStyle =
    effectiveTheme === 'dark'
      ? darkStyle
      : lightStyle;

  const CurrentIcon =
    theme === 'system'
      ? Monitor
      : theme === 'dark'
        ? Moon
        : Sun;

  const currentModeLabel =
    modeOptions.find(
      option =>
        option.id === theme,
    )?.label ?? 'System';

  const currentDarkStyleLabel =
    styleOptions.find(
      option =>
        option.id === activeStyle,
    )?.label ?? (effectiveTheme === 'dark'
      ? 'Comfort Dark'
      : 'Comfort Light');

  return (
    <DropdownMenu>
      <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild>
        <button
          type="button"
          className="caizen-theme-toggle inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/65 bg-card/78 text-foreground shadow-sm backdrop-blur-xl transition hover:border-primary/30 hover:bg-card"
          aria-label="Choose appearance"
        >
          <CurrentIcon className="h-4.5 w-4.5" />
        </button>
      </DropdownMenuTrigger></TooltipTrigger><TooltipContent>{
            theme === 'light'
              ? 'Theme: Light'
              : `Theme: ${currentModeLabel} · ${currentDarkStyleLabel}`
          }</TooltipContent></Tooltip>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-72 rounded-2xl p-2"
      >
        <DropdownMenuLabel className="px-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Mode
        </DropdownMenuLabel>

        {modeOptions.map(option => {
          const Icon = option.icon;
          const active =
            option.id === theme;

          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={() =>
                setTheme(option.id)
              }
              className="cursor-pointer rounded-xl px-3 py-2.5"
            >
              <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="flex-1 font-semibold">
                {option.label}
              </span>
              {active ? (
                <Check className="h-4 w-4 text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="px-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {effectiveTheme === 'dark'
            ? 'Dark style'
            : 'Light style'}
        </DropdownMenuLabel>

        {styleOptions.map(option => {
          const active =
            option.id === activeStyle;

          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={() => {
                if (effectiveTheme === 'dark') {
                  setDarkStyle(option.id as DarkStyle);
                } else {
                  setLightStyle(option.id as LightStyle);
                }
              }}
              className="cursor-pointer rounded-xl px-3 py-2.5"
            >
              <span
                className="mr-3 flex h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-border"
                aria-hidden="true"
              >
                <span
                  className="h-full flex-1"
                  style={{
                    backgroundColor:
                      option.background,
                  }}
                />
                <span
                  className="h-full flex-1"
                  style={{
                    backgroundColor:
                      option.surface,
                  }}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {option.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.description}
                </span>
              </span>

              {active ? (
                <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
