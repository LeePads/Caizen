import type { PersonalVaultType } from '@/lib/types';

export type PersonalVaultCategoryOption = { id: string; label: string };

export const PERSONAL_VAULT_CATEGORY_OPTIONS: Record<PersonalVaultType, PersonalVaultCategoryOption[]> = {
  document: [
    { id: 'identity-government', label: 'Identity & Government' },
    { id: 'finance-bills', label: 'Finance & Bills' },
    { id: 'receipts-warranties', label: 'Receipts & Warranties' },
    { id: 'health', label: 'Health' },
    { id: 'travel', label: 'Travel' },
    { id: 'other', label: 'Other' },
  ],
  career: [
    { id: 'resume-portfolio', label: 'Resume & Portfolio' },
    { id: 'employment', label: 'Employment' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'presentations', label: 'Presentations' },
    { id: 'other', label: 'Other' },
  ],
  creative: [
    { id: 'recordings', label: 'Recordings' },
    { id: 'videos', label: 'Videos' },
    { id: 'projects-practice', label: 'Projects & Practice' },
    { id: 'other', label: 'Other' },
  ],
  install: [
    { id: 'essential-apps', label: 'Essential Apps' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'developer-tools', label: 'Developer Tools' },
    { id: 'creative-tools', label: 'Creative Tools' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'utilities-extensions', label: 'Utilities & Extensions' },
    { id: 'setup-checklist', label: 'Setup Checklist' },
    { id: 'other', label: 'Other' },
  ],
  links: [
    { id: 'favorites-shortcuts', label: 'Favorites & Shortcuts' },
    { id: 'government', label: 'Government' },
    { id: 'cloud-storage', label: 'Cloud Storage' },
    { id: 'tools', label: 'Tools' },
    { id: 'learning', label: 'Learning' },
    { id: 'shopping', label: 'Shopping' },
    { id: 'creative-resources', label: 'Creative Resources' },
    { id: 'other', label: 'Other' },
  ],
};

export const PERSONAL_VAULT_TAXONOMY_DEFAULTS: Record<PersonalVaultType, string[]> = Object.fromEntries(
  Object.entries(PERSONAL_VAULT_CATEGORY_OPTIONS).map(([type, categories]) => [
    type,
    categories.map(category => category.id),
  ]),
) as Record<PersonalVaultType, string[]>;

export const PERSONAL_VAULT_SECTION_OPTIONS: Array<{ value: PersonalVaultType; label: string }> = [
  { value: 'document', label: 'Documents' },
  { value: 'career', label: 'Career references' },
  { value: 'creative', label: 'Creative' },
  { value: 'install', label: 'Install Kit' },
  { value: 'links', label: 'Links' },
];

export function personalVaultCategoryLabel(type: unknown, value: string): string {
  const options = typeof type === 'string' && Object.prototype.hasOwnProperty.call(PERSONAL_VAULT_CATEGORY_OPTIONS, type)
    ? PERSONAL_VAULT_CATEGORY_OPTIONS[type as PersonalVaultType]
    : undefined;
  return (Array.isArray(options) ? options.find(category => category.id === value)?.label : undefined)
    || value.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}
