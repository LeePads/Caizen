import { describe, expect, it } from 'vitest';

import { getCareerCredentialExpiryStatus } from '@/lib/career/expiry';
import { normalizeCareerCollections } from '@/lib/career/normalization';
import { isCareerDateRangeValid, isValidCareerUrl } from '@/lib/career/validation';

describe('Career canonical records', () => {
  it('keeps only canonical forward references and never creates reverse arrays', () => {
    const normalized = normalizeCareerCollections(
      [{ id: 'skill-1', name: 'TypeScript', level: 'Advanced', createdAt: '2026-08-01' }],
      [{ id: 'course-1', title: 'Course', status: 'Completed', relatedSkillIds: ['skill-1', 'missing'], createdAt: '2026-08-02' }],
      [{ id: 'credential-1', title: 'Credential', relatedSkillIds: ['skill-1', 'missing'], relatedCourseIds: ['course-1', 'missing'], createdAt: '2026-08-03' }],
    );
    expect(normalized.courses[0].relatedSkillIds).toEqual(['skill-1']);
    expect(normalized.credentials[0].relatedSkillIds).toEqual(['skill-1']);
    expect(normalized.credentials[0].relatedCourseIds).toEqual(['course-1']);
    expect(normalized.skills[0]).not.toHaveProperty('relatedCourseIds');
    expect(normalized.skills[0]).not.toHaveProperty('relatedCredentialIds');
  });

  it('derives credential expiry locally with the 30-day threshold', () => {
    const today = new Date('2026-08-24T12:00:00');
    expect(getCareerCredentialExpiryStatus({ noExpiry: true }, today)).toBe('No expiry');
    expect(getCareerCredentialExpiryStatus({ expiryDate: new Date('2026-09-23T12:00:00'), noExpiry: false }, today)).toBe('Expiring soon');
    expect(getCareerCredentialExpiryStatus({ expiryDate: new Date('2026-08-23T12:00:00'), noExpiry: false }, today)).toBe('Expired');
    expect(getCareerCredentialExpiryStatus({ expiryDate: new Date('2027-01-01T12:00:00'), noExpiry: false }, today)).toBe('Valid');
  });
});

describe('Career form validation', () => {
  it('allows empty URLs and valid HTTP(S) URLs but rejects other schemes', () => {
    expect(isValidCareerUrl('')).toBe(true);
    expect(isValidCareerUrl('https://example.com/very/long/path')).toBe(true);
    expect(isValidCareerUrl('http://localhost:3000/course')).toBe(true);
    expect(isValidCareerUrl('javascript:alert(1)')).toBe(false);
    expect(isValidCareerUrl('not a url')).toBe(false);
  });

  it('only rejects dates when the end precedes the start', () => {
    expect(isCareerDateRangeValid('', '2026-01-01')).toBe(true);
    expect(isCareerDateRangeValid('2026-01-01', '')).toBe(true);
    expect(isCareerDateRangeValid('2026-01-01', '2026-01-01')).toBe(true);
    expect(isCareerDateRangeValid('2026-02-01', '2026-01-01')).toBe(false);
  });
});
