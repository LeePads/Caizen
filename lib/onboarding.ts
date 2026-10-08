import { getStoreValue, putStoreValue, deleteStoreValue } from './storage/database';
import { STORES } from './storage/schema';
import { getCurrencySelectOptions } from './currency';
import type { CurrencyCode } from './types';

export const ONBOARDING_PENDING_KEY = 'caizen-onboarding-pending-v1';
export const ONBOARDING_DRAFT_KEY = 'caizen-onboarding-draft-v2';
export const ONBOARDING_LEGACY_DRAFT_KEY = 'caizen-onboarding-draft-v1';
export const DEMO_ONBOARDING_RETURN_KEY = 'caizen-demo-onboarding-return-v1';

export type OnboardingMode = 'fresh' | 'replay';
export type OnboardingPhase = 'welcome' | 'essentials' | 'interests' | 'preview';
export type OnboardingPriority =
  | 'lifehub'
  | 'balance'
  | 'health'
  | 'workhub'
  | 'inventory'
  | 'entertainment'
  | 'personalhub';

export type OnboardingDraft = {
  version: 3;
  status: 'active' | 'paused' | 'completed';
  customizeNavigation: boolean;
  revision: number;
  updatedAt: string;
  profileId: string;
  mode: OnboardingMode;
  phase: OnboardingPhase;
  experienceIndex: number;
  name: string;
  currency: CurrencyCode;
  priorities: OnboardingPriority[];
};

export const ONBOARDING_PRIORITIES: ReadonlyArray<{
  id: OnboardingPriority;
  label: string;
}> = [
  { id: 'lifehub', label: 'Plan my life' },
  { id: 'balance', label: 'Understand my money' },
  { id: 'health', label: 'Care for my health' },
  { id: 'workhub', label: 'Organize my work' },
  { id: 'inventory', label: 'Care for things I own' },
  { id: 'entertainment', label: 'Make time for entertainment' },
  { id: 'personalhub', label: 'Keep useful references' },
];

const ONBOARDING_PHASES: ReadonlyArray<OnboardingPhase> = [
  'welcome',
  'essentials',
  'interests',
  'preview',
];

type DraftStorage = 'local' | 'session';

function readDraftValue(storage: DraftStorage, key: string): string | null {
  try {
    return storage === 'local'
      ? localStorage.getItem(key)
      : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeDraftValue(storage: DraftStorage, key: string): void {
  try {
    if (storage === 'local') localStorage.removeItem(key);
    else sessionStorage.removeItem(key);
  } catch {
    // Draft cleanup must not prevent setup completion.
  }
}

function parseDraftValue(value: string | null): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value || 'null') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function matchesDraftIdentity(
  parsed: Record<string, unknown> | null,
  profileId: string,
  mode: OnboardingMode,
): parsed is Record<string, unknown> & { profileId: string; mode: OnboardingMode } {
  return Boolean(parsed && parsed.profileId === profileId && parsed.mode === mode);
}

export function isOnboardingPriority(value: unknown): value is OnboardingPriority {
  return ONBOARDING_PRIORITIES.some(item => item.id === value);
}

/** Keep valid priorities in their chosen order, without duplicates, to three. */
export function normalizeOnboardingPriorities(value: unknown): OnboardingPriority[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(isOnboardingPriority))].slice(0, 3)
    : [];
}

function isOnboardingPhase(value: unknown): value is OnboardingPhase {
  return ONBOARDING_PHASES.includes(value as OnboardingPhase);
}

function normalizeName(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, 50) : fallback;
}

function normalizeCurrency(value: unknown, fallback: CurrencyCode): CurrencyCode {
  return getCurrencySelectOptions().some(option => option.value === value)
    ? value as CurrencyCode
    : fallback;
}

function createFallbackDraft(
  profileId: string,
  mode: OnboardingMode,
  name: string,
  currency: CurrencyCode,
): OnboardingDraft {
  return { version: 3, status: 'active', customizeNavigation: false, revision: 0, updatedAt: new Date().toISOString(), profileId, mode, phase: 'welcome', experienceIndex: 0, name, currency, priorities: [] };
}

function normalizeV2Draft(
  parsed: Record<string, unknown>,
  profileId: string,
  mode: OnboardingMode,
  name: string,
  currency: CurrencyCode,
): OnboardingDraft {
  const priorities = normalizeOnboardingPriorities(parsed.priorities);
  const legacyPhases: Record<string, OnboardingPhase> = { profile: 'essentials', priorities: 'interests', experience: 'preview', complete: priorities.length ? 'preview' : 'interests' };
  const phaseValue = typeof parsed.phase === 'string' ? legacyPhases[parsed.phase] ?? parsed.phase : parsed.phase;
  let phase = isOnboardingPhase(phaseValue) ? phaseValue : 'welcome';
  if (mode === 'replay' && phase === 'essentials') phase = 'interests';
  const requestedIndex = parsed.phase === 'complete' ? priorities.length - 1 : Number.isInteger(parsed.experienceIndex)
    ? Number(parsed.experienceIndex)
    : 0;
  const experienceIndex = priorities.length
    ? Math.max(0, Math.min(priorities.length - 1, requestedIndex))
    : 0;

  if (phase === 'preview' && priorities.length === 0) phase = 'interests';

  return {
    version: 3,
    status: parsed.status === 'paused' || parsed.status === 'completed' ? parsed.status : 'active',
    customizeNavigation: parsed.customizeNavigation === true && mode === 'fresh',
    revision: Number.isSafeInteger(parsed.revision) ? Number(parsed.revision) : 0,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    profileId,
    mode,
    phase,
    experienceIndex,
    name: normalizeName(parsed.name, name),
    currency: normalizeCurrency(parsed.currency, currency),
    priorities,
  };
}

/**
 * Convert the current v1 sequential questionnaire draft into the selected
 * section flow. Only completed old questionnaires resume at their previews;
 * an unfinished questionnaire opens the editable priority grid.
 */
function migrateV1Draft(
  parsed: Record<string, unknown>,
  profileId: string,
  mode: OnboardingMode,
  name: string,
  currency: CurrencyCode,
): OnboardingDraft {
  const priorities = normalizeOnboardingPriorities(parsed.priorities);
  const step = Number.isInteger(parsed.step)
    ? Math.max(0, Math.min(3, Number(parsed.step)))
    : 0;
  const legacyInterestIndex = Number.isInteger(parsed.interestIndex)
    ? Math.max(0, Math.min(ONBOARDING_PRIORITIES.length, Number(parsed.interestIndex)))
    : 0;
  const oldChoicesComplete = step === 3 ||
    legacyInterestIndex === ONBOARDING_PRIORITIES.length ||
    priorities.length === 3;
  let phase: OnboardingPhase;
  if (step === 0) phase = 'welcome';
  else if (step === 1) phase = 'essentials';
  else if (oldChoicesComplete) phase = priorities.length > 0 ? 'preview' : 'interests';
  else phase = 'interests';

  return {
    version: 3,
    status: parsed.status === 'paused' || parsed.status === 'completed' ? parsed.status : 'active',
    customizeNavigation: parsed.customizeNavigation === true && mode === 'fresh',
    revision: Number.isSafeInteger(parsed.revision) ? Number(parsed.revision) : 0,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    profileId,
    mode,
    phase,
    experienceIndex: 0,
    name: normalizeName(parsed.name, name),
    currency: normalizeCurrency(parsed.currency, currency),
    priorities,
  };
}

function loadLegacyDraft(
  profileId: string,
  mode: OnboardingMode,
  name: string,
  currency: CurrencyCode,
): OnboardingDraft {
  const fallback = createFallbackDraft(profileId, mode, name, currency);
  const currentValue = readDraftValue('session', ONBOARDING_DRAFT_KEY);

  if (currentValue !== null) {
    const current = parseDraftValue(currentValue);
    return matchesDraftIdentity(current, profileId, mode)
      ? normalizeV2Draft(current, profileId, mode, name, currency)
      : fallback;
  }

  const legacyValues = [
    readDraftValue('local', ONBOARDING_LEGACY_DRAFT_KEY),
    readDraftValue('session', ONBOARDING_LEGACY_DRAFT_KEY),
  ];
  for (const legacyValue of legacyValues) {
    const legacy = parseDraftValue(legacyValue);
    if (matchesDraftIdentity(legacy, profileId, mode)) {
      return migrateV1Draft(legacy, profileId, mode, name, currency);
    }
  }

  return fallback;
}

const draftKey = (profileId: string, mode: OnboardingMode) => 'caizen-onboarding-draft-v3:' + profileId + ':' + mode;
let draftWrites: Promise<unknown> = Promise.resolve();
export async function loadOnboardingDraft(profileId: string, mode: OnboardingMode, name: string, currency: CurrencyCode): Promise<OnboardingDraft> {
  await draftWrites.catch(() => undefined);
  const saved = await getStoreValue<{ value: Record<string, unknown> }>(STORES.settings, draftKey(profileId, mode));
  if (saved && matchesDraftIdentity(saved.value, profileId, mode)) return normalizeV2Draft(saved.value, profileId, mode, name, currency);
  const legacy = loadLegacyDraft(profileId, mode, name, currency);
  await saveOnboardingDraft(legacy, profileId, mode);
  return legacy;
}
export function saveOnboardingDraft(draft: OnboardingDraft, profileId = draft.profileId, mode = draft.mode): Promise<void> {
  const snapshot = structuredClone(draft);
  const write = async () => {
    if (snapshot.profileId !== profileId || snapshot.mode !== mode) throw new Error('The active profile changed. Resume setup for the original profile.');
    const value = normalizeV2Draft(snapshot as unknown as Record<string, unknown>, profileId, mode, snapshot.name, snapshot.currency);
    const key = draftKey(profileId, mode);
    await putStoreValue(STORES.settings, { key, value });
    const verified = await getStoreValue<{ value: OnboardingDraft }>(STORES.settings, key);
    if (JSON.stringify(verified?.value) !== JSON.stringify(value)) throw new Error('Your setup progress could not be confirmed. Try again.');
    clearLegacyDraft();
  };
  const pending = draftWrites.catch(() => undefined).then(write);
  draftWrites = pending;
  return pending;
}
function clearLegacyDraft() {
  for (const storage of ['local', 'session'] as const) {
    removeDraftValue(storage, ONBOARDING_DRAFT_KEY);
    removeDraftValue(storage, ONBOARDING_LEGACY_DRAFT_KEY);
  }
}
export async function clearOnboardingDraft(profileId?: string, mode?: OnboardingMode): Promise<void> {
  await draftWrites.catch(() => undefined);
  if (profileId) {
    for (const draftMode of mode ? [mode] : ['fresh', 'replay'] as const) await deleteStoreValue(STORES.settings, draftKey(profileId, draftMode));
  }
  clearLegacyDraft();
}

export function orderTabsForOnboarding(existing: string[], priorities: OnboardingPriority[]): string[] {
  return [...new Set(['dashboard', ...normalizeOnboardingPriorities(priorities), ...existing])];
}

export function primaryTabsForOnboarding(priorities: OnboardingPriority[]): string[] {
  const normalized = normalizeOnboardingPriorities(priorities);
  return [...new Set(['dashboard', ...normalized, 'lifehub', 'health', 'balance'])]
    .slice(0, Math.max(3, normalized.length + 1));
}

export type OnboardingVisibilityFacts = {
  setupCompleted: boolean;
  onboardingPending: boolean;
  hasStoredProfiles: boolean;
};

/**
 * Profile creation is an implementation detail of AppProvider. This helper
 * keeps first-run visibility tied to the user's setup state instead of the
 * presence of that provider-created profile.
 */
export function shouldShowOnboarding(facts: OnboardingVisibilityFacts): boolean {
  if (facts.onboardingPending) return true;
  return !facts.setupCompleted && !facts.hasStoredProfiles;
}
