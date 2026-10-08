'use client';

import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openTaxonomyHub } from '@/components/common/taxonomy-hub-events';

// Supplement types remain a separate profile taxonomy from dosage units.
export const DEFAULT_SUPPLEMENT_TYPES = ['vitamin', 'mineral', 'herb', 'protein', 'probiotic', 'other'];

type Props = {
  observed?: Array<{ category?: string }>;
  androidPresentation?: boolean;
};

export function SupplementTypeSettingsButton({ observed = [], androidPresentation = false }: Props) {
  const taxonomy = {
    module: 'supplement-types' as const,
    displayName: 'Supplement types',
    manageLabel: 'Manage types',
    itemSingular: 'type',
    defaults: DEFAULT_SUPPLEMENT_TYPES,
    observed,
    androidPresentation,
    showSubcategories: false,
    allowRenameCategory: false,
    allowRenameSubcategory: false,
  };

  return (
    <Button type="button" variant="outline" onClick={() => openTaxonomyHub({ area: 'supplements', panel: 'types', taxonomy })} className="min-h-11 rounded-xl">
      <Settings2 className="mr-2 size-4" aria-hidden="true" />Manage types
    </Button>
  );
}
