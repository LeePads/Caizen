'use client';

import type { DragEventHandler, ReactNode } from 'react';
import { ImagePlus, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type RecordImageFieldProps = {
  preview?: ReactNode;
  hasPreview: boolean;
  alt: string;
  label?: string;
  description?: string;
  chooseLabel?: string;
  removeLabel?: string;
  onChoose: () => void;
  onRemove?: () => void;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  controls?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** Presentation-only primary image control. Callers own file selection, URLs, and media storage. */
export function RecordImageField({
  preview,
  hasPreview,
  alt,
  label,
  description,
  chooseLabel = 'Choose image',
  removeLabel = 'Remove image',
  onChoose,
  onRemove,
  onDragOver,
  onDrop,
  controls,
  disabled = false,
  className,
}: RecordImageFieldProps) {
  return (
    <div className={cn('w-full space-y-2', className)} onDragOver={onDragOver} onDrop={onDrop}>
      {label ? <p className="text-sm font-semibold">{label}</p> : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex w-full min-w-0 flex-col items-start gap-3">
        <div className="relative aspect-square w-[9rem] max-w-full sm:w-[10rem] lg:w-[12rem]">
          <button
            type="button"
            disabled={disabled}
            onClick={onChoose}
            aria-label={hasPreview ? 'Replace ' + alt : chooseLabel}
            className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-border/60 bg-background/45 text-center transition-colors hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {hasPreview && preview != null ? preview : (
              <span className="grid h-full w-full place-items-center bg-primary/[0.035] text-primary/55">
                <ImagePlus className="size-7" aria-hidden="true" />
              </span>
            )}
            {hasPreview ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-7 text-left text-xs font-semibold text-white"
              >
                Replace
              </span>
            ) : null}
          </button>
          {hasPreview && onRemove ? (
            <button
              type="button"
              disabled={disabled}
              aria-label={removeLabel}
              onClick={event => {
                event.stopPropagation();
                onRemove();
              }}
              className="android-touch-target absolute right-0.5 top-0.5 z-10 grid size-8 place-items-center rounded-full bg-black/75 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="w-full min-w-0 space-y-2">
          {controls}
        </div>
      </div>
    </div>
  );
}
