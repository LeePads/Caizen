import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Android Life Hub focused follow-up contracts', () => {
  it('keeps Android Dashboard capture rows and nearby controls on neutral surfaces', () => {
    const styles = read('app/globals.css');
    const dashboard = read('components/sections/Dashboard.tsx');

    expect(dashboard).toContain('android-quick-add-sheet-action');
    expect(styles).toContain('.android-quick-add-sheet-action');
    expect(styles).toContain('background: var(--surface-toolbar);');
    expect(styles).toContain('.android-dashboard .dashboard-customize-button');
  });

  it('uses accessible tabs for Life Hub destinations', () => {
    const section = read('components/sections/LifeHubSection.tsx');

    expect(section).toContain('role="tablist" aria-label="Life Hub sections"');
    expect(section).toContain('role="tab"');
    expect(section).toContain('aria-selected={activeTab === tab.id}');
    expect(section).toContain('lifehub-primary-tab caizen-tab inline-flex');
  });

  it('switches Life Hub notes to plain multiline fields on Android without changing the stored value', () => {
    const taskModal = read('components/modals/LifeHubTaskModal.tsx');
    const dateModal = read('components/modals/LifeHubDateModal.tsx');

    expect(taskModal).toContain('showToolbar={!androidPresentation}');
    expect(taskModal).toContain("description: item?.description || item?.notes || ''");
    expect(dateModal).toContain('androidPresentation?: boolean;');
    expect(dateModal).toContain('showToolbar={!androidPresentation}');
    expect(dateModal).toContain("notes: item?.notes || ''");
  });

  it('paginates Android Activity after filtering and resets on date or filter changes', () => {
    const timeline = read('components/sections/LifeHubActivityTimeline.tsx');
    const section = read('components/lifehub/LifeHubActivityWorkspace.tsx');

    expect(timeline).toContain('const ANDROID_ACTIVITY_PAGE_SIZE = 10;');
    expect(timeline).toContain('filter,');
    expect(timeline).toContain('groups.slice((currentPage - 1) * ANDROID_ACTIVITY_PAGE_SIZE');
    expect(timeline).toContain('setPage(1);');
    expect(timeline).toContain('}, [filter, selectedDateKey]);');
    expect(timeline).toContain('Previous');
    expect(timeline).toContain('Page {currentPage} of {totalPages}');
    expect(timeline).toContain('Next');
    expect(section).toContain('<LifeHubActivityTimeline');
  });

  it('leaves the journal day tile as one primary tap target and keeps music in the entry sheet', () => {
    const section = read('components/sections/JournalSection.tsx');

    expect(section).not.toContain('journal-month-day-play');
    expect(section).not.toContain('onPlayMusic');
    expect(section).toContain('Music Today');
    expect(section).toContain('playItems(linkedItem.id, [linkedItem])');
    expect(section).toContain('openExternalLink(safeLink)');
  });
});
