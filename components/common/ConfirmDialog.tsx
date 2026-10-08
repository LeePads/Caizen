
'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';

interface ConfirmDialogProps {
  title: string;
  message: string;
  details?: ReactNode;

  confirmText?: string;
  cancelText?: string;
  confirmationKeyword?: string;
  confirmationLabel?: string;
  confirmDisabled?: boolean;

  isDangerous?: boolean;
  tone?: 'danger' | 'warning' | 'primary';
  size?: 'compact' | 'comfortable';

  isOpen: boolean;

  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  details,

  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmationKeyword,
  confirmationLabel = 'Type the confirmation word to continue',
  confirmDisabled = false,

  isDangerous = true,
  tone,
  size = 'compact',

  isOpen,

  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const [confirmationValue, setConfirmationValue] = useState('');

  const panelRef = useRef<HTMLElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({
    isOpen,
    onClose: onCancel,
  });

  useEffect(() => {
    if (isOpen) setConfirmationValue('');
  }, [isOpen, confirmationKeyword]);

  useOverlayLifecycle(isOpen, close, {
    containerRef: panelRef,
    initialFocusRef: cancelButtonRef,
  });

  if (!isOpen) return null;

  const resolvedTone = tone || (isDangerous ? 'danger' : 'primary');

  return createPortal(
    (
      <div
        className="android-compact-dialog pointer-events-auto fixed inset-0 z-[14000] flex items-center justify-center p-3"
        data-caizen-overlay={isClosing ? 'closing' : 'open'}
        data-state={isClosing ? 'closed' : 'open'}
      >
        <button
          type="button"
          onClick={close}
          className="caizen-confirm-backdrop motion-modal-backdrop absolute inset-0"
          aria-label={`Cancel ${title}`}
        />
        <section
          ref={panelRef}
          tabIndex={-1}
          className={`caizen-confirm-panel caizen-confirm-panel-${size} motion-pop relative z-10 w-full caizen-confirm-tone-${resolvedTone} outline-none`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
        >
          <div className="caizen-confirm-body">
            <div className="caizen-confirm-copy">
              <div>
                <h2 id={titleId}>{title}</h2>
                <p id={messageId}>{message}</p>
              </div>
            </div>

            {details ? <div className="mt-4">{details}</div> : null}
            {confirmationKeyword ? (
              <label className="mt-4 block text-sm font-bold">
                {confirmationLabel}
                <input
                  value={confirmationValue}
                  onChange={event => setConfirmationValue(event.target.value)}
                  className="control-input mt-2"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={confirmationLabel}
                />
              </label>
            ) : null}
          </div>
          <div className="caizen-confirm-actions">
            <Button
              type="button"
              ref={cancelButtonRef}
              onClick={close}
              variant="outline"
              size="sm"
              className="caizen-confirm-cancel"
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onConfirm}
              disabled={confirmDisabled || Boolean(confirmationKeyword && confirmationValue.trim().toUpperCase() !== confirmationKeyword.toUpperCase())}
              className={resolvedTone === 'danger' ? 'caizen-confirm-danger' : resolvedTone === 'warning' ? 'caizen-confirm-warning' : 'caizen-confirm-primary'}
            >
              {confirmText}
            </Button>
          </div>
        </section>
      </div>
    ),
    document.body
  );
}
