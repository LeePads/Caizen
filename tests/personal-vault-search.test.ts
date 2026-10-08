import { describe, expect, it } from 'vitest';
import { searchPersonalVault, vaultNotePreview } from '@/lib/personal-vault/search';

describe('Personal Vault retrieval', () => {
  const createdAt = new Date('2026-10-01T00:00:00Z');
  const source = {
    items: [{ id: 'old', type: 'career' as const, title: 'Renewal reference', favorite: false, createdAt }],
    skills: [{ id: 'skill', name: 'Renewal planning', level: 'Learning' as const, createdAt }],
    courses: [{ id: 'course', title: 'Administration', provider: 'Renewal academy', status: 'Completed' as const, relatedSkillIds: [], createdAt }],
    certificates: [{ id: 'certificate', title: 'Permit', issuer: 'Renewal office', relatedSkillIds: [], relatedCourseIds: [], createdAt }],
  };

  it('finds unpinned references and all structured Career families without changing source records', () => {
    const before = structuredClone(source);
    const results = searchPersonalVault('  RENEWAL  ', source);
    expect(results.map(result => result.id).sort()).toEqual(['certificate', 'course', 'old', 'skill']);
    expect(results.find(result => result.id === 'old')?.kind).toBe('vault');
    expect(results.find(result => result.id === 'certificate')).toMatchObject({ kind: 'career', label: 'Certificate' });
    expect(source).toEqual(before);
  });

  it('handles older profiles without Career arrays, empty queries, and no matches', () => {
    expect(searchPersonalVault('renewal', { items: source.items })).toHaveLength(1);
    expect(searchPersonalVault(' ', source)).toEqual([]);
    expect(searchPersonalVault('missing', source)).toEqual([]);
  });

  it('produces plain readable notes without changing the saved markdown', () => {
    const notes = '## Renewal\n- [ ] **Bring** _documents_\n[Office](https://example.com)\n---';
    expect(vaultNotePreview(notes)).toBe('Renewal Bring documents Office');
    expect(notes).toContain('**Bring**');
  });

  it('retrieves multilingual and long references across a thousand records without mutating their order', () => {
    const items = Array.from({ length: 1000 }, (_, index) => ({
      id: `reference-${index}`, type: 'document' as const,
      title: `旅行 مستندات 🧭 ${'long-title-'.repeat(20)} ${index}`,
      createdAt: new Date(createdAt.getTime() + index * 1000),
    }));
    const originalIds = items.map(item => item.id);
    const results = searchPersonalVault('مستندات', { items });
    expect(results).toHaveLength(1000);
    expect(results[0].id).toBe('reference-999');
    expect(results[999].id).toBe('reference-0');
    expect(searchPersonalVault('旅行', { items })).toHaveLength(1000);
    expect(searchPersonalVault('🧭', { items })).toHaveLength(1000);
    expect(items.map(item => item.id)).toEqual(originalIds);
  });
});
