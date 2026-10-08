'use client';

import { Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TaxonomyWorkspace, type TaxonomyWorkspaceProps } from '@/components/common/TaxonomyWorkspace';
import { openTaxonomyHub } from '@/components/common/taxonomy-hub-events';

export type TaxonomySettingsButtonProps = TaxonomyWorkspaceProps;

export function TaxonomySettingsButton(props: TaxonomySettingsButtonProps) {
  if (props.module === 'wishlist') return <TaxonomyWorkspace {...props} />;

  const area = props.module === 'inventory' ? 'inventory' : props.module === 'skincare' ? 'skincare' : 'supplements';
  const panel = props.module === 'supplements' ? 'units' : 'categories';

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => openTaxonomyHub({ area, panel, taxonomy: props })}
      className="min-h-11 rounded-xl"
      aria-label={`Manage ${props.displayName || props.module} taxonomy`}
    >
      <Settings2 className="mr-2 size-4" aria-hidden="true" />{props.manageLabel || 'Manage categories'}
    </Button>
  );
}
