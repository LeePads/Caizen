import { describe, expect, it } from 'vitest';
import { formatWorkCustomFieldValues, normalizeWorkCustomFieldDefinitions, normalizeWorkCustomFieldValues, validateWorkCustomFieldValues } from '@/lib/workhub/custom-fields';

describe('Work Hub custom field values', () => {
  const fields = normalizeWorkCustomFieldDefinitions([
    { id: 'summary', label: 'Summary', type: 'short-text', required: true },
    { id: 'details', label: 'Details', type: 'long-text' },
    { id: 'estimate', label: 'Estimate', type: 'number' },
    { id: 'status', label: 'Status', type: 'select', options: [{ id: 'ready', label: 'Ready' }, { id: 'old', label: 'Old', archived: true }] },
    { id: 'areas', label: 'Areas', type: 'multi-select', options: [{ id: 'work', label: 'Work' }, { id: 'health', label: 'Health' }] },
    { id: 'review-date', label: 'Review date', type: 'date' },
    { id: 'reference', label: 'Reference', type: 'url' },
    { id: 'verified', label: 'Verified', type: 'checkbox', required: true },
  ]);

  it('normalizes and validates all V1 field types, including false and archived selections', () => {
    const values = normalizeWorkCustomFieldValues({
      summary: 'Ready for review',
      details: 'Long notes',
      estimate: 2.5,
      status: 'old',
      areas: ['work', 'work', 'health'],
      'review-date': '2026-09-29',
      reference: 'https://example.com/docs',
      verified: false,
    })!;
    const result = validateWorkCustomFieldValues(fields, values);

    expect(values.areas).toEqual(['work', 'health']);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects invalid dates, unsafe URLs, non-finite values, and missing required fields', () => {
    const result = validateWorkCustomFieldValues(fields, {
      summary: '  ',
      estimate: Number.POSITIVE_INFINITY,
      'review-date': '2026-02-30',
      reference: 'javascript:alert(1)',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.summary).toContain('required');
    expect(result.errors.estimate).toContain('finite number');
    expect(result.errors['review-date']).toContain('valid date');
    expect(result.errors.reference).toContain('HTTP or HTTPS');
    expect(result.errors.verified).toContain('required');
  });

  it('keeps unknown field IDs and formats arrays, booleans, and unavailable values for search/export', () => {
    const values = normalizeWorkCustomFieldValues({ status: 'old', areas: ['work', 'removed'], verified: false, 'unknown-field': 'kept' });

    expect(values?.['unknown-field']).toBe('kept');
    expect(formatWorkCustomFieldValues(values, fields)).toContain('Status: Old');
    expect(formatWorkCustomFieldValues(values, fields)).toContain('Areas: Work, removed');
    expect(formatWorkCustomFieldValues(values, fields)).toContain('Verified: No');
    expect(formatWorkCustomFieldValues(values, fields)).toContain('unknown-field: kept');
  });
});
