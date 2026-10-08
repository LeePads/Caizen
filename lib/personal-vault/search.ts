import type { CareerCourse, CareerCredential, CareerSkill, PersonalVaultItem } from '@/lib/types';

export type VaultSearchResult =
  | { kind: 'vault'; id: string; title: string; createdAt: Date; item: PersonalVaultItem }
  | { kind: 'career'; id: string; title: string; createdAt: Date; label: string; detail: string };

/** A view projection only: original records and their IDs remain authoritative. */
export function searchPersonalVault(query: string, source: {
  items: PersonalVaultItem[];
  skills?: CareerSkill[];
  courses?: CareerCourse[];
  certificates?: CareerCredential[];
}): VaultSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches = (...values: unknown[]) => values.some(value =>
    typeof value === 'string' && value.toLocaleLowerCase().includes(needle));
  const results: VaultSearchResult[] = source.items.filter(item => matches(
    item.title, item.subType, item.notes, item.link, item.officialWebsite,
    item.referenceHint, item.issuer, item.platform, item.installStatus,
  )).map(item => ({ kind: 'vault', id: item.id, title: item.title, createdAt: item.createdAt, item }));
  for (const item of source.skills || []) {
    if (matches(item.name, item.area, item.level, item.notes)) results.push({
      kind: 'career', id: item.id, title: item.name, createdAt: item.createdAt,
      label: 'Skill', detail: [item.area, item.level].filter(Boolean).join(' · '),
    });
  }
  for (const item of source.courses || []) {
    if (matches(item.title, item.provider, item.status, item.url, item.notes)) results.push({
      kind: 'career', id: item.id, title: item.title, createdAt: item.createdAt,
      label: 'Course', detail: [item.provider, item.status].filter(Boolean).join(' · '),
    });
  }
  for (const item of source.certificates || []) {
    if (matches(item.title, item.issuer, item.credentialId, item.url, item.notes)) results.push({
      kind: 'career', id: item.id, title: item.title, createdAt: item.createdAt,
      label: 'Certificate', detail: item.issuer || 'Career certificate',
    });
  }
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    || a.title.localeCompare(b.title));
}

export function vaultNotePreview(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*(?:#{1,6}\s+|[-*]\s+(?:\[[ xX]\]\s*)?|\d+\.\s+)/gm, '')
    .replace(/[*_`]/g, '').replace(/^\s*-{3,}\s*$/gm, '').replace(/\s+/g, ' ').trim();
}
