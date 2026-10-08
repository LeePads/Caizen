import { describe, expect, it } from 'vitest';

import { isActionableWorkHubProjection } from '@/lib/workhub/derived';

import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('Work Hub bounded remediation', () => {
  it('keeps future projections actionable without rewriting stored history', () => {
    expect(isActionableWorkHubProjection('task', 'active')).toBe(true);
    expect(isActionableWorkHubProjection('task', 'done')).toBe(false);
    expect(isActionableWorkHubProjection('task', 'archived')).toBe(false);
    expect(isActionableWorkHubProjection('resource', 'planned')).toBe(true);
    expect(isActionableWorkHubProjection('event', 'upcoming')).toBe(true);
    expect(isActionableWorkHubProjection('event', 'completed')).toBe(false);
    expect(isActionableWorkHubProjection('event', 'dismissed')).toBe(false);
  });

  it('keeps the Work Hub correction contracts explicit', () => {
    const source = read('components/sections/WorkHubSection.tsx');
    const projectHeaderStart = source.indexOf('function ProjectHeader({');
    const tasksStart = source.indexOf('function Tasks({', projectHeaderStart);
    const taskBoardColumnStart = source.indexOf('function TaskBoardColumn({', tasksStart);
    const projectHeader = source.slice(projectHeaderStart, tasksStart);
    const tasks = source.slice(tasksStart, taskBoardColumnStart);

    expect(projectHeader).not.toContain('<SearchField');
    expect(tasks).toContain('<SearchField');
    expect(tasks).toContain('placeholder="Search tasks…"');
    expect(source).toContain("tab === 'tasks'");
    expect(source).toContain("tab === 'notes'");
    expect(source).toContain("tab === 'resources'");
    expect(source).toContain('<SectionTabs');
    expect(source).toContain('mode="panels"');
    expect(source).toContain('<WorkTabs tabs={TABS} />');
    expect(source).toContain('<TabsList aria-label="Work sections"');
    expect(source).toContain('<TabsTrigger');
    expect(source).toContain('<TabsContent value={tab}');
    expect(source).toContain('<FilterBar label="Task filters"');
    expect(source).toContain('selected={filter === option.value}');
    expect(source).toContain('label={`${labelText} view`}');
    expect(source).toContain("options={labelText === 'Notes' ? NOTE_FILTERS : RESOURCE_FILTERS}");
    expect(source).toContain('label="Work calendar view"');
    expect(source).toContain("options={[{ value: 'agenda', label: 'Agenda' }, { value: 'month', label: 'Month' }]}");
    expect(source).toContain("type NoteFilter = 'all' | 'pinned'");
    expect(source).toContain('types={workTypes.filter(type => type.kind === \'note\')}');
    expect(source).toContain('typeFilter={noteTypeFilter}');
    expect(source).toContain('categoryFilter={noteCategoryFilter}');
    expect(source).toContain('function RecordFilterControls');
    expect(source).toContain('Filter{activeCount ? ` (${activeCount})` : \'\'}');
    expect(source).toContain('workProjectPreferenceKey(profileId)');
    expect(source).toContain('activeProjects.some(project => project.id === selectedProjectId)');
    expect(source).toContain("const bug = draft.noteType === 'bug' || draft.workTypeId === 'note-bug-incident'");
    expect(source).toContain('Field name="Steps to reproduce"');
    expect(source).toContain('Field name="Expected result"');
    expect(source).toContain('Field name="Actual result"');
    expect(source).toContain('trackAsOverdue: event?.trackAsOverdue === true');
    expect(source).toContain('projectId: location ? undefined : draft.projectId || projectId');
    expect(source).toContain('isActionableWorkHubProjection(entry.source, entry.item.status)');
  });

  it('keeps the shared month grid selected and current-day semantics intact', () => {
    const source = read('components/work/WorkHubMonthGrid.tsx');

    expect(source).toContain('aria-pressed={selected}');
    expect(source).toContain("aria-current={sameDay(date, new Date()) ? 'date' : undefined}");
  });

  it('uses a non-empty Radix Select value for the no-category option in both editors', () => {
    const source = read('components/sections/WorkHubSection.tsx');

    expect(source).not.toContain('<SelectItem value="">No category</SelectItem>');
    expect(source.match(/<SelectItem value=\{NO_WORK_CATEGORY_VALUE\}>No category<\/SelectItem>/g)).toHaveLength(2);
    expect(source).toContain('function workCategorySelectionValue(categoryId?: string)');
    expect(source).toContain('function workCategoryIdFromSelection(value: string)');
  });
});
