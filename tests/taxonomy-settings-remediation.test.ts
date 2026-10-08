import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeTaxonomy } from '@/lib/module-taxonomy';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('taxonomy settings remediation contracts', () => {
  it('preserves stable taxonomy identifiers and the existing persistence shape', () => {
    const taxonomy = normalizeTaxonomy([
      {
        id: 'taxonomy-personal-tech',
        name: 'personal_tech',
        subcategories: ['device'],
      },
    ]);

    expect(taxonomy[0]).toMatchObject({
      id: 'taxonomy-personal-tech',
      name: 'personal_tech',
      subcategories: ['device'],
    });

    const hook = source('lib/module-taxonomy.ts');
    expect(hook).toContain('moduleTaxonomies');
    expect(hook).toContain('onChange: categories =>');
    expect(hook).toContain('normalizeTaxonomy(categories)');
  });

  it('formats labels without changing stored values or adding a display-name field', () => {
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    expect(workspace).toContain('formatLabel(renameDraft)');
    expect(workspace).toContain('Existing record values remain unchanged.');
    expect(workspace).not.toContain('displayName: renameDraft');
  });
  it('delegates the Taxonomy button through the Hub and announces applied changes', () => {
    const button = source('components/common/TaxonomySettingsButton.tsx');
    const hub = source('components/common/TaxonomyHub.tsx');
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    expect(button).toContain('openTaxonomyHub({ area, panel, taxonomy: props })');
    expect(hub).toContain('<TaxonomyWorkspace');
    for (const label of ["inventory: 'Inventory'", "wishlist: 'Wishlist'", "skincare: 'Skincare'", "supplements: 'Supplement'"]) expect(workspace).toContain(label);
    expect(workspace).toContain('applied changes save automatically.');
    expect(workspace).toContain("setStatusMessage('Changes applied.')");
    expect(workspace).toContain('role="status" aria-live="polite" aria-atomic="true"');
  });
  it('keeps selection, archive, delete, and reorder actions accessible', () => {
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    expect(workspace).toContain('aria-pressed={isSelected}');
    expect(workspace).toContain('aria-pressed={view === nextView}');
    expect(workspace).toContain('aria-label={`Move ${itemLabel} up`}');
    expect(workspace).toContain('taxonomy.archiveCategory');
    expect(workspace).toContain('taxonomy.deleteCategory');
    expect(workspace).toContain('taxonomy.deleteSubcategory');
    expect(workspace).toContain('<ConfirmDialog');
    expect(workspace).toContain('taxonomy.isSystemCategory(name)');
    expect(workspace).toContain('const uses = taxonomy.categoryUsageCount(name)');
  });
  it('prevents reordering when category filtering hides the ordering context', () => {
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    expect(workspace).toContain('query.trim().length === 0');
    expect(workspace).toContain("view === 'active' && archivedCategories.length === 0");
    expect(workspace).toContain('if (!canReorderCategories) return;');
    expect(workspace).toContain('disabled={selectedCategoryIndex <= 0}');
  });
  it('labels inputs and preserves draft, search, and keyboard ownership', () => {
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    for (const contract of ['aria-label={', 'New subcategory name', 'Subcategory name', 'Clear search', 'No matching', "event.key === 'Enter'", "event.key !== 'Escape'", 'navigateWithinWorkspace', 'onDraftChange', 'onNavigationRequest']) expect(workspace).toContain(contract);
    const hub = source('components/common/TaxonomyHub.tsx');
    expect(hub).toContain('useOverlayLifecycle');
    expect(hub).toContain('requestWorkspaceNavigation');
    expect(hub).toContain('requestBack');
  });
  it('keeps embedded and standalone workspaces responsive with native entry markers', () => {
    const workspace = source('components/common/TaxonomyWorkspace.tsx');
    expect(workspace).toContain('@container/taxonomy');
    expect(workspace).toContain('@3xl/taxonomy:hidden');
    expect(workspace).toContain('data-caizen-nested-flow="open"');
    expect(workspace).toContain("data-android-screen={androidPresentation ? 'taxonomy' : undefined}");
    expect(workspace).toContain('embeddedOpen');
  });
});
