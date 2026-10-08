'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Image as ImageIcon, Palette } from 'lucide-react';
import { DARK_STYLE_OPTIONS } from '@/components/ThemeToggle';
import { LIGHT_STYLE_OPTIONS, MAX_SECTION_TRANSPARENCY, useTheme } from '@/lib/theme';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

const CUSTOM_ACCENT_PALETTE = [
  '#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#d946ef', '#fb7185',
  '#f59e0b', '#eab308', '#84cc16', '#34d399', '#2dd4bf', '#94a3b8',
];

function hslToHex(hue: number, saturation = 76, lightness = 54) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${match.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHue(value: string) {
  const hex = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 42;
  const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 42;
  const delta = max - min;
  const raw = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return Math.round((raw * 60 + 360) % 360);
}

function SettingSwitch({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className="settings-switch-row group"
    >
      <span className="min-w-0 text-left">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function SettingsSubheading({
  title,
  description,
  id,
}: {
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className="mb-2 mt-5 scroll-mt-5 first:mt-0">
      <h4 className="text-section-title">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function AppearanceSettings({
  theme,
  darkStyle,
  lightStyle,
  scheme,
  backgroundImage,
  backgroundOpacity,
  animationPreference,
  useAlbumArtBackground,
  setTheme,
  setDarkStyle,
  setLightStyle,
  setScheme,
  setBackgroundImage,
  setBackgroundOpacity,
  setAnimationPreference,
  setUseAlbumArtBackground,
  themeTransition,
  compact = false,
}: {
  theme: string;
  darkStyle: string;
  lightStyle: string;
  scheme: string;
  backgroundImage: string;
  backgroundOpacity: number;
  animationPreference: string;
  useAlbumArtBackground: boolean;
  setTheme: (theme: any) => void;
  setDarkStyle: (style: any) => void;
  setLightStyle: (style: any) => void;
  setScheme: (scheme: any) => void;
  setBackgroundImage: (url: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setAnimationPreference: (preference: any) => void;
  setUseAlbumArtBackground: (enabled: boolean) => void;
  themeTransition?: { value: string; onChange: (value: string) => void };
  compact?: boolean;
}) {
  const { customAccent, setCustomAccent, sectionTransparency, setSectionTransparency } = useTheme();
  const appearanceId = useId().replace(/:/g, '');
  const accentLabelId = `settings-${appearanceId}-accent-label`;
  const backgroundPhotoId = `settings-${appearanceId}-background-photo-url`;
  const photoOpacityId = `settings-${appearanceId}-photo-opacity`;
  const sectionTransparencyId = `settings-${appearanceId}-section-transparency`;
  const [customHex, setCustomHex] = useState(customAccent);
  const [backgroundDraft, setBackgroundDraft] = useState(backgroundImage);
  const [backgroundError, setBackgroundError] = useState('');
  const savedAccentRef = useRef(customAccent);
  const [customHue, setCustomHue] = useState(() => hexToHue(customAccent));
  const [customAccentNotice, setCustomAccentNotice] = useState('');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.resolvedTheme === 'dark'
      ? 'dark'
      : 'light',
  );

  useEffect(() => {
    setCustomHex(customAccent);
    savedAccentRef.current = customAccent;
    setCustomHue(hexToHue(customAccent));
  }, [customAccent]);

  useEffect(() => {
    setBackgroundDraft(backgroundImage);
    setBackgroundError('');
  }, [backgroundImage]);

  const commitBackground = () => {
    const next = backgroundDraft.trim();
    if (next && !normalizeExternalWebUrl(next)) {
      setBackgroundError('Enter a valid HTTPS image URL.');
      return;
    }
    setBackgroundError('');
    setBackgroundImage(next);
  };

  useEffect(() => {
    const syncResolvedTheme = () => {
      setResolvedTheme(document.documentElement.dataset.resolvedTheme === 'dark' ? 'dark' : 'light');
    };

    syncResolvedTheme();
    window.addEventListener('caizen:theme-resolved', syncResolvedTheme);
    return () => window.removeEventListener('caizen:theme-resolved', syncResolvedTheme);
  }, [theme]);

  const effectiveTheme = theme === 'system' ? resolvedTheme : theme;
  const styleOptions = effectiveTheme === 'dark' ? DARK_STYLE_OPTIONS : LIGHT_STYLE_OPTIONS;
  const activeStyle = effectiveTheme === 'dark' ? darkStyle : lightStyle;

  const modes = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const schemes = [
    { id: 'cyan', label: 'Cyan', swatch: 'bg-cyan-500' },
    { id: 'blue', label: 'Blue', swatch: 'bg-blue-500' },
    { id: 'violet', label: 'Violet', swatch: 'bg-violet-500' },
    { id: 'purple', label: 'Purple', swatch: 'bg-purple-500' },
    { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
    {
      id: 'amber',
      label: 'Caizen Gold',
      swatch: 'bg-[#c79232] dark:bg-[#e7b34e]',
    },
    { id: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
    { id: 'slate', label: 'Slate', swatch: 'bg-slate-500' },
    { id: 'custom', label: 'Custom', swatch: '' },
  ];

  const animationOptions = [
    { id: 'full', label: 'Full' },
    { id: 'reduced', label: 'Reduced' },
  ];

  return (
    <section
      className={compact ? 'settings-appearance-panel space-y-0' : 'mt-5 rounded-3xl border border-border/50 bg-card/70 p-3'}
    >
      <div className={compact ? 'hidden' : 'mb-3 flex items-center gap-2'}>
        <Palette className="h-4 w-4 text-primary" />
        <h4 className="text-section-title">Appearance</h4>
      </div>

      <SettingsSubheading id="settings-theme-group" title="Theme" />
      <p className="text-body-sm text-muted-foreground">Mode</p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {modes.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={theme === item.id}
            onClick={() => setTheme(item.id)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${
              theme === item.id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/50 bg-input text-muted-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {effectiveTheme === 'dark' ? 'Dark style' : 'Light style'}
          </label>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {theme === 'system'
              ? `System mode uses this style whenever the device is ${effectiveTheme}.`
              : `Choose the ${effectiveTheme} palette for this mode.`}
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {styleOptions.map(item => {
              const active = activeStyle === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (effectiveTheme === 'dark') {
                      setDarkStyle(item.id);
                    } else {
                      setLightStyle(item.id);
                    }
                  }}
                  className={`caizen-theme-style-option rounded-xl border p-2.5 text-left transition ${
                    active
                      ? 'border-primary/45 bg-primary/10'
                      : 'border-border/55 bg-input hover:border-primary/25'
                  }`}
                >
                  <span
                    className="caizen-theme-style-preview"
                    aria-hidden="true"
                  >
                    <span style={{ backgroundColor: item.background }} />
                    <span style={{ backgroundColor: item.surface }} />
                    <span style={{ backgroundColor: item.secondary }} />
                    <span style={{ backgroundColor: item.toolbar }} />
                    <span style={{ backgroundColor: item.raised }} />
                  </span>

                  <span className="mt-2 flex items-center justify-between gap-2">
                    <strong
                      className={
                        active
                          ? 'text-sm text-primary'
                          : 'text-sm text-foreground'
                      }
                    >
                      {item.label}
                    </strong>

                    {active ? (
                      <span className="text-primary" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </span>

                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </>

      <SettingsSubheading id="settings-accent-group" title="Accent" />
      <p id={accentLabelId} className="sr-only">
        Accent
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-labelledby={accentLabelId}>
        {schemes.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scheme === item.id}
            onClick={() => setScheme(item.id)}
            className={`
              flex
              items-center
              gap-2
              rounded-xl
              border
              p-2.5
              text-left
              text-sm
              font-semibold
              ${
                scheme === item.id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/50 bg-input text-muted-foreground'
              }
            `}
          >
            <span
              className={`h-4 w-4 rounded-full ${item.swatch}`}
              style={
                item.id === 'custom'
                  ? {
                      backgroundColor: /^#[0-9a-f]{6}$/i.test(customHex)
                        ? customHex
                        : customAccent,
                    }
                  : undefined
              }
            />
            <span className="min-w-0 flex-1">{item.label}</span>
            {scheme === item.id && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>

      {scheme === 'custom' && (
        <div className="mt-2.5 rounded-xl border border-border bg-background p-2.5">
          <div
            className="h-16 rounded-lg border border-border/60"
            style={{
              background: 'linear-gradient(90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
            }}
            aria-hidden="true"
          />

          <p className="mt-2 text-xs text-muted-foreground">
            Preview changes, then Apply to save this accent.
          </p>

          <label className="mt-2.5 block text-xs font-bold text-muted-foreground" htmlFor={`${appearanceId}-hue`}>
            Hue
          </label>
          <Slider
            id={`${appearanceId}-hue`}
            min={0}
            max={360}
            step={1}
            value={[customHue]}
            onValueChange={([hue]) => {
              setCustomHue(hue);
              setCustomHex(hslToHex(hue));
              setCustomAccentNotice('');
            }}
            aria-label="Custom accent hue"
            className="mt-2 min-h-11"
          />

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span
              className="h-11 w-full rounded-xl border border-border shadow-inner sm:w-14"
              style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(customHex) ? customHex : customAccent }}
              aria-label="Current accent preview"
              role="img"
            />

            <input
              value={customHex}
              onChange={event => {
                const value = event.target.value.startsWith('#')
                  ? event.target.value
                  : `#${event.target.value}`;
                setCustomHex(value);
                setCustomAccentNotice('');
              }}
              aria-label="Custom accent hex color"
              className={`control-input font-mono uppercase ${
                /^#[0-9a-f]{6}$/i.test(customHex)
                  ? ''
                  : 'border-destructive'
              }`}
              maxLength={7}
            />

            <button
              type="button"
              onClick={() => {
                setCustomHex('#c79232');
                setCustomHue(hexToHue('#c79232'));
                setCustomAccentNotice('');
              }}
              className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-bold"
            >
              Reset
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Accent color palette">
            {CUSTOM_ACCENT_PALETTE.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  setCustomHex(color);
                  setCustomHue(hexToHue(color));
                  setCustomAccentNotice('');
                }}
                className="flex size-11 items-center justify-center rounded-full border-2 border-background shadow-sm ring-1 ring-border transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Choose ${color} accent`}
                aria-pressed={customHex.toLowerCase() === color}
              >
                <span
                  className="size-9 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          {!/^#[0-9a-f]{6}$/i.test(customHex) && (
            <p className="mt-2 text-xs font-semibold text-destructive">
              Enter a six-digit hex color.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {customAccentNotice && (
              <p className="mr-auto text-xs font-semibold text-primary" role="status" aria-live="polite">
                {customAccentNotice}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                const savedAccent = savedAccentRef.current;
                setCustomHex(savedAccent);
                setCustomHue(hexToHue(savedAccent));
                setCustomAccentNotice('');
              }}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!/^#[0-9a-f]{6}$/i.test(customHex)}
              onClick={() => {
                setCustomAccent(customHex);
                setCustomAccentNotice('Accent saved.');
              }}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <SettingsSubheading id="settings-motion-group" title="Motion" />

      <p className="text-body-sm text-muted-foreground">App motion</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {animationOptions.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={animationPreference === item.id}
            onClick={() => setAnimationPreference(item.id)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${
              animationPreference === item.id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/50 bg-input text-muted-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {themeTransition && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Theme transition</p>
          <p className="mt-1 text-body-sm text-muted-foreground">Controls how shared surfaces respond when the theme changes.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {['off', 'subtle', 'glow'].map(option => (
              <button key={option} type="button" aria-pressed={themeTransition.value === option} onClick={() => themeTransition.onChange(option)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${themeTransition.value === option ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/50 bg-input text-muted-foreground'}`}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      <SettingsSubheading id="settings-background-group" title="Background and surfaces" />
      <label htmlFor={backgroundPhotoId} className="mt-3 block text-sm font-semibold text-foreground">
        Background photo URL
      </label>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/50 bg-input px-3">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <input
          id={backgroundPhotoId}
          value={backgroundDraft}
          onChange={event => { setBackgroundDraft(event.target.value); setBackgroundError(''); }}
          onBlur={commitBackground}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          aria-invalid={Boolean(backgroundError)}
          aria-describedby={backgroundError ? `${backgroundPhotoId}-error` : undefined}
          placeholder="https://..."
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {backgroundError ? <p id={`${backgroundPhotoId}-error`} className="mt-1 text-xs font-semibold text-destructive" role="alert">{backgroundError}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">Remote photos are fetched from their host.</p>

      {backgroundDraft && (
        <button
          type="button"
          onClick={() => { setBackgroundDraft(''); setBackgroundError(''); setBackgroundImage(''); }}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-border/50 bg-input px-3 text-xs font-bold text-muted-foreground transition-all hover:text-foreground"
        >
          Clear background photo
        </button>
      )}

      <div className="mt-3">
        <SettingSwitch
          label="Video background"
          description="Uses a playing YouTube video as the page background when playback and motion settings allow."
          checked={useAlbumArtBackground}
          onChange={setUseAlbumArtBackground}
        />
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <label htmlFor={photoOpacityId}>Photo opacity</label>
          <span>{backgroundOpacity}%</span>
        </div>

        <Slider
          id={photoOpacityId}
          aria-label="Photo opacity"
          min={0}
          max={36}
          step={1}
          value={[backgroundOpacity]}
          onValueChange={([value]) => setBackgroundOpacity(value)}
          className="min-h-11"
        />
      </div>

      <div className="mt-2">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <label htmlFor={sectionTransparencyId}>Section transparency</label>
          <span>{sectionTransparency}%</span>
        </div>

        <Slider
          id={sectionTransparencyId}
          aria-label="Section transparency"
          min={0}
          max={MAX_SECTION_TRANSPARENCY}
          step={1}
          value={[sectionTransparency]}
          onValueChange={([value]) => setSectionTransparency(value)}
          className="min-h-11"
        />

        <p className="mt-1 text-xs text-muted-foreground">
          Lets background show through major section surfaces. Dialogs, menus, and controls stay solid.
        </p>
      </div>

    </section>
  );
}

