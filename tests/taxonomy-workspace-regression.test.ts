import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TaxonomyWorkspace } from '@/components/common/TaxonomyWorkspace';
import { normalizePersonalVaultTaxonomy } from '@/lib/personal-vault/normalization';
import {
  PERSONAL_VAULT_SECTION_OPTIONS,
  PERSONAL_VAULT_TAXONOMY_DEFAULTS,
  personalVaultCategoryLabel,
} from '@/lib/personal-vault/taxonomy';

vi.mock('@/lib/context', () => ({
  useAppContext: () => ({
    currentProfileId: 'vault-regression-profile',
    profiles: [{ id: 'vault-regression-profile' }],
    updateProfile: vi.fn(),
  }),
}));

vi.mock('@/components/common/ConfirmDialog', () => ({ default: () => null }));

describe('Taxonomy Workspace initial Vault render', () => {
  for (const { value: section, label } of PERSONAL_VAULT_SECTION_OPTIONS) {
    it.each([false, true])(`renders ${label} before selection effects (Android: %s)`, androidPresentation => {
      const formatter = vi.fn((category: string, value: string) => {
        if (!category || !value) throw new Error('Formatter received empty selection');
        return personalVaultCategoryLabel(category, value);
      });
      const onChange = vi.fn();
      const markup = renderToStaticMarkup(createElement(TaxonomyWorkspace, {
        module: 'personal',
        displayName: 'Personal Vault',
        defaults: { [section]: PERSONAL_VAULT_TAXONOMY_DEFAULTS[section] },
        focusedCategoryName: section,
        allowRenameCategory: false,
        subcategoryLabel: formatter,
        embedded: true,
        embeddedOpen: true,
        androidPresentation,
        persistence: {
          value: normalizePersonalVaultTaxonomy([
            null,
            { name: section, subcategories: [null, 42, 'custom-category'] },
            { name: 'unknown-legacy-type', subcategories: 'invalid' },
          ]).filter(category => category.name === section),
          migrateLegacy: false,
          onChange,
        },
      }));

      expect(markup).toContain('Personal Vault categories');
      expect(markup).toContain('Select a category');
      expect(formatter).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  }

  it('does not call a category formatter while a standalone workspace is closed', () => {
    const formatter = vi.fn(() => { throw new Error('Formatter called before selection'); });
    const markup = renderToStaticMarkup(createElement(TaxonomyWorkspace, {
      module: 'personal',
      defaults: PERSONAL_VAULT_TAXONOMY_DEFAULTS,
      subcategoryLabel: formatter,
    }));

    expect(markup).toContain('Manage categories');
    expect(formatter).not.toHaveBeenCalled();
  });
});
