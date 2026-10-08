import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { buildCareerCredentialsCsv, buildCareerExportDocument, buildCareerSkillsCsv, buildCareerXlsx, getCareerExportFileName, resolveCareerExportRecords } from '@/lib/collections/career-exports';

const records = {
  skills: [{ id: 'skill-1', name: 'TypeScript', area: 'Engineering', level: 'Advanced' as const, notes: 'Line one\nLine two', createdAt: new Date('2026-08-01') }],
  courses: [{ id: 'course-1', title: 'Typed course', provider: 'Caizen', status: 'Completed' as const, relatedSkillIds: ['skill-1'], createdAt: new Date('2026-08-02') }],
  credentials: [{ id: 'credential-1', title: 'Certificate, "A"', issuer: 'Issuer', relatedSkillIds: ['skill-1'], relatedCourseIds: ['course-1'], noExpiry: true, credentialId: 'CERT-1', proofAssetId: 'media-secret', createdAt: new Date('2026-08-03') }],
  legacyItems: [{ id: 'legacy-1', type: 'career' as const, title: 'Legacy', subType: 'certificates', createdAt: new Date('2026-08-04') }],
};

describe('Career exports', () => {
  it('resolves all/current/custom scopes before building one document', () => {
    const current = { ...records, skills: [], courses: [], credentials: [], legacyItems: [] };
    expect(resolveCareerExportRecords({ scope: 'all', ...records, current, customFilters: { recordType: 'all', skillLevel: 'all', courseStatus: 'all', expiryStatus: 'all', search: '' } }).skills).toHaveLength(1);
    expect(resolveCareerExportRecords({ scope: 'current', ...records, current, customFilters: { recordType: 'all', skillLevel: 'all', courseStatus: 'all', expiryStatus: 'all', search: '' } }).skills).toHaveLength(0);
    expect(resolveCareerExportRecords({ scope: 'custom', ...records, current, customFilters: { recordType: 'credentials', skillLevel: 'all', courseStatus: 'all', expiryStatus: 'No expiry', search: 'certificate' } }).credentials).toHaveLength(1);
  });

  it('keeps Current view scoped to the active Career tab', () => {
    const current = { skills: records.skills, courses: [], credentials: [], legacyItems: [] };
    const resolved = resolveCareerExportRecords({ scope: 'current', ...records, current, customFilters: { recordType: 'all', skillLevel: 'all', courseStatus: 'all', expiryStatus: 'all', search: '' } });
    expect(resolved.skills).toHaveLength(1);
    expect(resolved.courses).toHaveLength(0);
    expect(resolved.credentials).toHaveLength(0);
    expect(resolved.legacyItems).toHaveLength(0);
  });

  it('derives relationship labels and preserves proof state without IDs or bytes', () => {
    const document = buildCareerExportDocument({ profileName: 'Cai', generatedAt: new Date('2026-08-24T12:00:00'), scope: 'all', scopeLabel: 'All Career records', filterSummary: 'No active filters', records });
    expect(document.skills[0].relatedCourses).toBe('Typed course');
    expect(document.credentials[0].proofAttached).toBe(true);
    expect(JSON.stringify(document)).not.toContain('skill-1');
    expect(JSON.stringify(document)).not.toContain('media-secret');
    expect(JSON.stringify(document)).not.toContain('profileId');
  });

  it('uses separate CSV contracts and exact XLSX sheet names', async () => {
    const document = buildCareerExportDocument({ generatedAt: new Date('2026-08-24T12:00:00'), scope: 'all', scopeLabel: 'All Career records', filterSummary: 'No active filters', records, profileName: 'Cai' });
    expect(buildCareerSkillsCsv(document).startsWith('\uFEFFSkill,Area,Level')).toBe(true);
    expect(buildCareerCredentialsCsv(document)).toContain('Certificate, ""A""');
    expect(getCareerExportFileName('skills-csv', document.generatedAt)).toBe('Caizen-Career-Skills-2026-08-24.csv');
    expect(getCareerExportFileName('courses-csv', document.generatedAt)).toBe('Caizen-Career-Courses-2026-08-24.csv');
    const workbook = strFromU8(unzipSync(new Uint8Array(await buildCareerXlsx(document).arrayBuffer()))['xl/workbook.xml']);
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])).toEqual(['Summary', 'Skills', 'Courses', 'Credentials', 'Legacy Career']);
  });
});
