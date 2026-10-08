'use client';

import { useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ListPlus,
  Pencil,
  Pin,
  RotateCcw,
  ShoppingBag,
  SquareCheckBig,
  Trash2,
  X,
} from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CaizenBottomSheet } from '@/components/native/android-design';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';

export type EntryActionId =
  | 'open'
  | 'edit'
  | 'edit-finish'
  | 'duplicate'
  | 'archive'
  | 'complete'
  | 'queue'
  | 'source'
  | 'log'
  | 'finish'
  | 'repurchase'
  | 'restore'
  | 'link'
  | 'download'
  | 'pin'
  | 'delete';

export interface EntryAction {
  id: EntryActionId;
  label: string;
  description?: string;
  /** Delete is confirmed by this sheet unless the owner handles confirmation. */
  destructive?: boolean;
  confirm?: boolean;
  onSelect: () => void;
}

const ICONS: Record<EntryActionId, ComponentType<{ className?: string }>> = {
  open: ExternalLink,
  edit: Pencil,
  'edit-finish': Pencil,
  duplicate: Copy,
  archive: Archive,
  complete: SquareCheckBig,
  queue: ListPlus,
  source: ExternalLink,
  log: CheckCircle2,
  finish: CheckCircle2,
  repurchase: ShoppingBag,
  restore: RotateCcw,
  link: ExternalLink,
  download: Download,
  pin: Pin,
  delete: Trash2,
};

/**
 * Shared action sheet for a list or grid entry.
 *
 * Opened by long-press (see useLongPress) or by a visible overflow button.
 * Both routes exist by design: long-press is an accelerator, never the only
 * way to reach an action.
 *
 * Deletion always routes through a confirmation, regardless of how the sheet
 * was opened.
 */
export function EntryActionSheet({
  open,
  title,
  subtitle,
  actions,
  deleteMessage,
  onClose,
  androidPresentation = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  actions: EntryAction[];
  deleteMessage?: string;
  onClose: () => void;
  androidPresentation?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState<EntryAction | null>(
    null,
  );

  const panelRef = useRef<HTMLElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({
    isOpen: open,
    onClose,
  });

  useOverlayLifecycle(androidPresentation ? false : open, close, { containerRef: panelRef });

  if (!open && !confirmingDelete) return null;

  const renderActions = () => (
    <div className="cz-sheet-actions">
      {actions.map((action) => {
        const Icon = ICONS[action.id];
        const destructive = action.destructive || action.id === 'delete';

        return (
          <button
            key={action.id}
            type="button"
            className="cz-sheet-action"
            data-destructive={destructive ? 'true' : undefined}
            onClick={() => {
              if (action.id === 'delete' && action.confirm !== false) {
                setConfirmingDelete(action);
                close();
                return;
              }
              close();
              action.onSelect();
            }}
          >
            <Icon className="h-5 w-5" />
            <span>
              <strong>{action.label}</strong>
              {action.description && <small>{action.description}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );

  const sheet = open && androidPresentation ? (
    <CaizenBottomSheet
      open={open}
      title={title}
      description={subtitle}
      onClose={onClose}
    >
      {renderActions()}
    </CaizenBottomSheet>
  ) : open ? (
    <div
      className="cz-sheet-root"
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
      data-presentation="context"
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="cz-sheet-backdrop"
        aria-label="Close actions"
        onClick={close}
      />

      <section
        ref={panelRef}
        tabIndex={-1}
        className="cz-sheet cz-sheet-context"
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${title}`}
      >
        <header className="cz-sheet-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            className="cz-sheet-close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {renderActions()}
      </section>
    </div>
  ) : null;

  return (
    <>
      {sheet && typeof document !== 'undefined' ? createPortal(sheet, document.body) : null}

      <ConfirmDialog
        isOpen={Boolean(confirmingDelete)}
        title="Delete this entry?"
        message={
          deleteMessage ??
          `"${title}" will be deleted. This cannot be undone from here.`
        }
        confirmText="Delete"
        cancelText="Keep"
        isDangerous
        onCancel={() => setConfirmingDelete(null)}
        onConfirm={() => {
          confirmingDelete?.onSelect();
          setConfirmingDelete(null);
        }}
      />
    </>
  );
}
