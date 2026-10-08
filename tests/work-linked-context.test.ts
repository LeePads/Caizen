import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Work linked-context integration contracts', () => {
  it('keeps the selector section-first, active-only for new links, and truthful for existing Trash links', () => {
    const selector = read('components/common/LifeHubLinkedContextSelector.tsx');
    expect(selector).toContain("{ value: 'work', label: 'Work' }");
    expect(selector).toContain('isWorkItemEligibleForNewLink(item, workItems)');
    expect(selector).toContain("selectedWorkTarget?.state === 'in-trash'");
    expect(selector).toContain("type: 'work-item', entityId: nextId");
    expect(selector).toContain('Restore it to use the existing link again');
    expect(selector).not.toContain('linkedWorkId');
  });

  it('preserves soft-Trash links and clears only during permanent deletion', () => {
    const context = read('lib/context.tsx');
    const moveStart = context.indexOf('  const moveToTrash = (');
    const restoreStart = context.indexOf('  const restoreTrashItem =', moveStart);
    const permanentStart = context.indexOf('  const deleteTrashItemPermanently =');
    const moveBlock = context.slice(moveStart, restoreStart);
    const permanentBlock = context.slice(permanentStart, context.indexOf('  // Profile operations', permanentStart));

    expect(moveBlock).not.toContain('clearWorkLinksFromRoutines');
    expect(moveBlock).not.toContain('clearWorkLinksFromTasks');
    expect(moveBlock).toContain("source === \"workItems\" && item.type === \"project\"");
    expect(permanentBlock).toContain('getWorkItemIdsFromTrashData');
    expect(permanentBlock).toContain('clearWorkLinksFromRoutines');
    expect(permanentBlock).toContain('clearWorkLinksFromTasks');
  });

  it('keeps Work-side navigation and completion ownership independent', () => {
    const workHub = read('components/sections/WorkHubSection.tsx');
    const workActivity = read('lib/work/lifehub-activity.ts');
    const lifeHub = read('components/sections/LifeHubSection.tsx');

    expect(workHub).toContain("detail: { section: 'lifehub', feature, recordId }");
    expect(workHub).toContain('deriveWorkLifeHubActivity');
    expect(workHub).toContain('<WorkLifeHubContext');
    expect(workActivity).not.toContain('week');
    expect(workActivity).not.toContain('month');
    expect(lifeHub).toContain("navigateTo('workhub', 'work-item', workItemId)");
    expect(workHub).toContain('context.completeWorkItemForProfile(profile.id, item.id)');
  });
});
