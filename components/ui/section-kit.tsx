'use client';

import { ReactNode, type Ref, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { dismissLocalSuggestionEscape } from '@/components/ui/local-suggestion-input';
import { AndroidDismissibleBackdrop } from '@/components/native/android-design';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { cn } from '@/lib/utils';

export function Toolbar({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="caizen-toolbar toolbar-surface motion-panel">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-section-title">{title}</h2>
          {description && (
            <p className="text-body-sm mt-1 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {action}
          </div>
        )}
      </div>
    </section>
  );
}

export type CaizenFormDialogSize = 'sm' | 'md' | 'lg' | 'full';

export function CaizenFormDialog({
  title,
  eyebrow,
  children,
  onClose,
  onBeforeClose,
  closeDisabled = false,
  descriptionId,
  initialFocusSelector,
  androidPresentation = false,
  description,
  size = 'md',
  footer,
  maxWidthClass,
  maxHeightClass,
  bodyClassName = '',
  bodyRef,
  panelClassName = '',
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  closeDisabled?: boolean;
  descriptionId?: string;
  initialFocusSelector?: string;
  androidPresentation?: boolean;
  description?: string;
  size?: CaizenFormDialogSize;
  footer?: ReactNode;
  maxWidthClass?: string;
  maxHeightClass?: string;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  panelClassName?: string;
}) {
  // CaizenFormDialog is only ever mounted while its modal is open (callers
  // conditionally render it), so this registers unconditionally - equivalent
  // to the previous unconditional effect, now closing only the topmost
  // overlay instead of firing regardless of what else is open.
  const panelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const generatedDescriptionId = useId();
  const dialogWidth = maxWidthClass || ({
    sm: 'max-w-md',
    md: 'max-w-[40rem]',
    lg: 'max-w-4xl',
    full: 'max-w-none',
  } satisfies Record<CaizenFormDialogSize, string>)[size];
  const panelGeometry = size === 'full'
    ? 'h-full max-h-[calc(100dvh-1.5rem)] max-w-none rounded-none sm:rounded-3xl'
    : `${maxHeightClass || 'max-h-[min(88dvh,48rem)]'} ${dialogWidth} rounded-3xl`;
  const describedBy = descriptionId || (description ? generatedDescriptionId : undefined);
  const { close, isClosing } = useAnimatedOverlayClose({
    isOpen: true,
    onClose,
  });

  const requestClose = useCallback(() => {
    if (onBeforeClose && !onBeforeClose()) return;
    close();
  }, [close, onBeforeClose]);

  useOverlayLifecycle(true, requestClose, {
    containerRef: panelRef,
    initialFocusRef: initialFocusSelector ? undefined : panelRef,
    initialFocusSelector,
    onEscapeKeyDown: dismissLocalSuggestionEscape,
  });

  return createPortal((
    <div
      className="caizen-modal-root fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4"
      data-android-presentation={androidPresentation || undefined}
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      <AndroidDismissibleBackdrop
        onClose={requestClose}
        ariaLabel={`Close ${title}`}
        className="caizen-modal-backdrop motion-modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        data-form-dialog-size={size}
        className={cn('caizen-modal-panel caizen-modal-fade-up mobile-modal-panel relative z-10 flex min-h-0 w-full flex-col overflow-hidden border border-border/70 bg-background shadow-2xl shadow-black/30 outline-none', panelGeometry, panelClassName)}
      >
        <div className="caizen-modal-header flex shrink-0 items-start justify-between gap-3 border-b border-border/60 bg-background px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-label text-label-eyebrow text-primary">
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className="text-section-title mt-0.5 break-words">
              {title}
            </h2>
            {description ? <p id={descriptionId || generatedDescriptionId} className="text-body-sm mt-1 text-muted-foreground">{description}</p> : null}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={requestClose}
            disabled={closeDisabled}
            className="shrink-0 text-muted-foreground"
            aria-label={`Close ${title}`}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* The body owns form scrolling; header and footer stay outside it. */}
        <div ref={bodyRef} className={cn('mobile-modal-body min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:px-5 sm:py-4', bodyClassName)}>{children}</div>
        {footer ? <div className="caizen-modal-footer shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 sm:px-5 sm:py-4">{footer}</div> : null}
      </section>
    </div>
  ), document.body);
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  collectionLabel = 'items',
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  collectionLabel?: string;
}) {
  const start =
    totalItems === 0 ? 0 : (page - 1) * pageSize + 1;

  const end =
    Math.min(page * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-metadata text-muted-foreground">
        Showing {start}-{end} of {totalItems}
      </p>

      <nav aria-label={`Pagination for ${collectionLabel}`} className="flex items-center gap-2">
        <Button
          type="button"
          aria-label={`Previous page of ${collectionLabel}`}
          variant="outline"
          onClick={() =>
            onPageChange(Math.max(1, page - 1))
          }
          disabled={page === 1}
          className="font-bold"
        >
          Prev
        </Button>

        <span className="min-w-20 text-center text-sm font-bold">
          {page} / {totalPages}
        </span>

        <Button
          type="button"
          aria-label={`Next page of ${collectionLabel}`}
          variant="outline"
          onClick={() =>
            onPageChange(Math.min(totalPages, page + 1))
          }
          disabled={page === totalPages}
          className="font-bold"
        >
          Next
        </Button>
      </nav>
    </div>
  );
}
