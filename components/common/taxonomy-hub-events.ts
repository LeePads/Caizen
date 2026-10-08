import type { TaxonomyWorkspaceProps } from '@/components/common/TaxonomyWorkspace';
import type { PersonalVaultType } from '@/lib/types';

export type TaxonomyHubArea = 'inventory' | 'skincare' | 'money' | 'supplements' | 'work-hub' | 'personal-vault';
export type TaxonomyHubPanel = 'categories' | 'locations' | 'product-types' | 'types' | 'units' | 'work-types';

export type TaxonomyHubRequest = {
  area: TaxonomyHubArea;
  panel?: TaxonomyHubPanel;
  taxonomy?: TaxonomyWorkspaceProps;
  section?: PersonalVaultType;
};

export const TAXONOMY_HUB_OPEN_EVENT = 'caizen:open-taxonomy-hub';

export function openTaxonomyHub(request: TaxonomyHubRequest) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TaxonomyHubRequest>(TAXONOMY_HUB_OPEN_EVENT, { detail: request }));
}
