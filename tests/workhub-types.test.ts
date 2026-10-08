import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@/lib/types';
import { normalizeWorkItemAttachments } from '@/lib/work-attachments';
import { resolveWorkTypeId, resolveWorkTypes, serializeWorkTypeOverrides } from '@/lib/workhub/work-types';

describe('Work Hub Work Type compatibility', () => {
  it('resolves legacy note and resource types without rewriting their records', () => {
    const cases: Array<[Partial<WorkItem>, string]> = [
      [{ type: 'note', noteType: 'scratchpad' }, 'note-general'],
      [{ type: 'note', noteType: 'meeting' }, 'note-meeting'],
      [{ type: 'note', noteType: 'daily' }, 'note-daily-update'],
      [{ type: 'note', noteType: 'test' }, 'note-test-session'],
      [{ type: 'note', noteType: 'bug' }, 'note-bug-incident'],
      [{ type: 'note', noteType: 'report_draft' }, 'note-report-draft'],
      [{ type: 'note', noteType: 'other' }, 'note-other'],
      [{ type: 'file' }, 'resource-document'],
      [{ type: 'report' }, 'resource-report'],
      [{ type: 'presentation' }, 'resource-presentation'],
      [{ type: 'note_file' }, 'resource-reference'],
      [{ type: 'ticket' }, 'resource-ticket-case'],
      [{ type: 'test_data' }, 'resource-dataset'],
      [{ type: 'template' }, 'resource-template'],
    ];

    for (const [record, expected] of cases) {
      expect(resolveWorkTypeId(record as WorkItem)).toBe(expected);
    }
  });

  it('merges profile definitions with virtual built-ins and stores only changed defaults', () => {
    const types = resolveWorkTypes([{ id: 'note-custom', name: 'Case Note', kind: 'note', fields: [] }]);

    expect(types.some(type => type.id === 'note-general' && type.builtIn)).toBe(true);
    expect(types.some(type => type.id === 'note-custom' && type.name === 'Case Note')).toBe(true);
    expect(serializeWorkTypeOverrides(types)).toHaveLength(1);
    expect(serializeWorkTypeOverrides(types)[0]).toMatchObject({ id: 'note-custom', name: 'Case Note', kind: 'note', fields: [], builtIn: false });
    expect(serializeWorkTypeOverrides(resolveWorkTypes(undefined))).toEqual([]);
  });

  it('retains custom IDs, category snapshots, and orphaned typed values through record normalization', () => {
    const normalized = normalizeWorkItemAttachments({
      id: 'note-1',
      type: 'note',
      workTypeId: 'missing-imported-type',
      workCategoryId: 'missing-category',
      workCategoryLabel: 'Old category name',
      customFieldValues: {
        'archived-field': 'kept',
        'unknown-number': 4.5,
        'unknown-flag': false,
        'unknown-options': ['old-option'],
      },
    });

    expect(normalized).toMatchObject({
      workTypeId: 'missing-imported-type',
      workCategoryId: 'missing-category',
      workCategoryLabel: 'Old category name',
      customFieldValues: {
        'archived-field': 'kept',
        'unknown-number': 4.5,
        'unknown-flag': false,
        'unknown-options': ['old-option'],
      },
    });
  });
});
