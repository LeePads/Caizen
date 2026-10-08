'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useState, type ComponentType } from 'react';
import { MoreHorizontal, MoreVertical } from 'lucide-react';

import { CaizenBottomSheet } from '@/components/native/android-design';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type HealthOverflowAction = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  destructive?: boolean;
  onSelect: () => void;
};

type HealthOverflowMenuProps = {
  title: string;
  actions: HealthOverflowAction[];
  androidPresentation?: boolean;
  ariaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
};

export function HealthOverflowMenu({
  title,
  actions,
  androidPresentation = false,
  ariaLabel = 'More actions',
  onOpenChange,
  triggerClassName = '',
}: HealthOverflowMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const changeSheetOpen = (open: boolean) => {
    setSheetOpen(open);
    onOpenChange?.(open);
  };

  if (androidPresentation) {
    return (
      <>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={event => {
            event.stopPropagation();
            changeSheetOpen(true);
          }}
          className={`health-overflow-trigger inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${triggerClassName}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
        <CaizenBottomSheet
          open={sheetOpen}
          title={title}
          dismissOnBackdrop
          onClose={() => changeSheetOpen(false)}
        >
          <div className={healthResponsive.dialog + " android-health-action-list"}>
            {actions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    changeSheetOpen(false);
                    action.onSelect();
                  }}
                  className={`android-health-action ${action.destructive ? 'android-health-action--destructive' : ''}`}
                >
                  {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </CaizenBottomSheet>
      </>
    );
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={event => event.stopPropagation()}
          aria-label={ariaLabel}
          className={`health-overflow-trigger inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${triggerClassName}`}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={healthResponsive.menu + " w-44"}>
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              onSelect={action.onSelect}
              variant={action.destructive ? 'destructive' : 'default'}
              className="min-h-11"
            >
              {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
