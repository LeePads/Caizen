import type { QuickAddKind } from '../quick-add';
// Single source of truth for "what does this section actually contain"
// copy, consumed by Android More, the desktop nav tooltip, and Life Pulse.
// Keep summaries scannable (label · label · label), not marketing copy.
// Update this file when a section's real top-level capabilities change —
// do not duplicate these strings elsewhere.

export type SectionDiscoveryMeta = {
  id: string;
  purpose?: string;
  relatedSections?: string[];
  suggestedFirstAction?: QuickAddKind;
  firstActionLabel?: string;
  label: string;
  /** One line, "Capability · Capability · Capability" style. */
  summary: string;
  /** 3-5 capability names, same source as `summary`. */
  capabilities: string[];
  /** Optional onboarding context explaining when this section is useful. */
  onboardingValue?: string;
};

const SECTION_METADATA = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    summary: 'Today · Upcoming · Life Pulse',
    capabilities: ['Today', 'Upcoming', 'Life Pulse'],
  },
  balance: {
    id: 'balance',
    label: 'Money',
    summary: 'Wallets · Transactions · Reports · Purchase plans',
    capabilities: ['Wallets', 'Transactions', 'Reports', 'Purchase plans'],
    onboardingValue: 'Understand wallets, transactions, reports, and plans when you want a clearer picture of your money.',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventory',
    summary: 'Items · Categories · Storage locations',
    capabilities: ['Items', 'Categories', 'Storage locations'],
    onboardingValue: 'Track what you own, its categories, and where it is stored so useful items stay easy to find.',
  },
  skincare: {
    id: 'skincare',
    label: 'Skincare',
    summary: 'Products · Routines · Usage stats',
    capabilities: ['Products', 'Routines', 'Usage stats'],
  },
  health: {
    id: 'health',
    label: 'Health',
    summary: 'Food · Sleep · Workouts · Weight · Supplements',
    capabilities: ['Food', 'Sleep', 'Workouts', 'Weight', 'Supplements'],
    onboardingValue: 'Track food, sleep, workouts, weight, and supplements as you check in on changing habits and health trends.',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment',
    summary: 'Library · Games · Books · Calendar · Discover',
    capabilities: ['Library', 'Games', 'Books', 'Calendar', 'Discover'],
    onboardingValue: 'Keep media, games, books, calendars, and discoveries together when you are ready to choose what to enjoy next.',
  },
  music: {
    id: 'music',
    label: 'Music',
    summary: 'All songs · Playlists · Favorites',
    capabilities: ['All songs', 'Playlists', 'Favorites'],
  },
  lifehub: {
    id: 'lifehub',
    label: 'Life Hub',
    summary: 'Tasks · Routines · Dates · Journal',
    capabilities: ['Tasks', 'Routines', 'Dates', 'Journal'],
    onboardingValue: 'Bring tasks, routines, dates, and journaling together so you can return to what needs attention each day.',
  },
  workhub: {
    id: 'workhub',
    label: 'Work Hub',
    summary: 'Tasks · Notes · Resources · Schedule',
    capabilities: ['Tasks', 'Notes', 'Resources', 'Schedule'],
    onboardingValue: 'Keep tasks, notes, resources, and schedules together so ongoing projects are easy to pick up again.',
  },
  personalhub: {
    id: 'personalhub',
    label: 'Personal Vault',
    summary: 'Documents · Career · Creative · Installs · Links',
    capabilities: ['Documents', 'Career', 'Creative', 'Installs', 'Links'],
    onboardingValue: 'Organize documents, career materials, creative work, installs, and links so important references are ready when needed.',
  },
};

export type SectionId = keyof typeof SECTION_METADATA;
const EDUCATION: Record<SectionId, Pick<SectionDiscoveryMeta, 'purpose' | 'relatedSections' | 'suggestedFirstAction' | 'firstActionLabel'>> = {
dashboard: { purpose: "See what deserves attention across your day, money, health, and work.", relatedSections: ["lifehub","workhub"], suggestedFirstAction: "task", firstActionLabel: "Add a task" },
lifehub: { purpose: "Give personal tasks, routines, dates, and reflections a home you can return to each day.", relatedSections: ["health","workhub"], suggestedFirstAction: "task", firstActionLabel: "Add a task" },
health: { purpose: "Keep everyday logs together and notice how your habits and measurements change over time.", relatedSections: ["lifehub","skincare"], suggestedFirstAction: "sleep", firstActionLabel: "Log sleep" },
balance: { purpose: "Distinguish what you have, what is available to spend, and what is already committed.", relatedSections: ["inventory","lifehub"], suggestedFirstAction: "wallet", firstActionLabel: "Add a wallet" },
inventory: { purpose: "Know what you own, where it is, and its current or replacement value.", relatedSections: ["balance","skincare"], suggestedFirstAction: "inventory", firstActionLabel: "Add an item" },
skincare: { purpose: "Keep track of products you use, their routines, usage, and lifecycle.", relatedSections: ["lifehub","inventory"], suggestedFirstAction: "skincare", firstActionLabel: "Add a product" },
workhub: { purpose: "Organize active work around projects, related tasks, notes, and schedules.", relatedSections: ["dashboard","personalhub"], suggestedFirstAction: "work", firstActionLabel: "Add a work item" },
personalhub: { purpose: "Keep useful documents, career materials, creative references, installs, and links available.", relatedSections: ["workhub","inventory"], suggestedFirstAction: "personal", firstActionLabel: "Add a reference" },
entertainment: { purpose: "Keep your next watch, read, or game alongside what you are enjoying and have finished.", relatedSections: ["music","lifehub"], suggestedFirstAction: "media", firstActionLabel: "Add to your library" },
music: { purpose: "Bring songs, playlists, favorites, and listening links into one library.", relatedSections: ["entertainment","workhub"], suggestedFirstAction: "music", firstActionLabel: "Add a song or link" },
};
export const SECTION_DISCOVERY_META: Record<SectionId, SectionDiscoveryMeta> = Object.fromEntries(
  Object.entries(SECTION_METADATA).map(([id, meta]) => [id, { ...meta, ...EDUCATION[id as SectionId] }]),
) as Record<SectionId, SectionDiscoveryMeta>;
export function getSectionDiscoveryMeta(sectionId: string): SectionDiscoveryMeta | undefined {
  return SECTION_DISCOVERY_META[sectionId as SectionId];
}
