import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { materializeDemoWorkspace } from '@/lib/demo/demo-workspace';

describe('Demo custom Work date values', () => {
  it('shifts Date custom fields using their profile Work Type schema', () => {
    const envelope = JSON.parse(readFileSync('public/caizen-demo.json', 'utf8'));
    // A schema-owned Date field is independent of the sample record names.
    const profile = envelope.data.profiles[0];
    profile.workTypes = [{ id: 'test-note', fields: [{ id: 'field-follow-up-date', type: 'date' }] }];
    profile.workItems = [{ id: 'test-review', type: 'note', customFieldValues: { 'field-follow-up-date': '2026-10-08', 'text-field': '2026-10-08' } }];
    const template = JSON.stringify(envelope);
    const materialized = JSON.parse(materializeDemoWorkspace(template, '2026-08-05')) as {
      data: { profiles: Array<{
        workItems: Array<{ id: string; customFieldValues?: Record<string, unknown> }>;
      }> };
    };
    const sample = materialized.data.profiles[0].workItems.find(item => item.id === 'test-review');

    expect(sample?.customFieldValues?.['field-follow-up-date']).toBe('2026-08-13');
    expect(sample?.customFieldValues?.['text-field']).toBe('2026-10-08');
  });
});
