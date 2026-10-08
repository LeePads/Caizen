'use client';

import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';

/**
 * Caizen's own photo-source chooser.
 *
 * Replaces CameraSource.Prompt, whose native sheet varies by OEM and gives the
 * app no control over labels, ordering, or cancellation. Every image field
 * uses this so capture and gallery are always explicit, separately reportable
 * actions.
 */
export function PhotoSourceSheet({
  open,
  title = 'Add a photo',
  canRemove = false,
  onCamera,
  onGallery,
  onRemove,
  onClose,
}: {
  open: boolean;
  title?: string;
  canRemove?: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const { close, isClosing } = useAnimatedOverlayClose({
    isOpen: open,
    onClose,
  });

  useOverlayLifecycle(open, close, { containerRef: panelRef });

  if (!open) return null;

  return createPortal((
    <div
      className="cz-sheet-root"
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      <button
        type="button"
        className="cz-sheet-backdrop"
        aria-label="Cancel"
        onClick={close}
      />

      <section
        ref={panelRef}
        tabIndex={-1}
        className="cz-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="cz-sheet-header">
          <h2>{title}</h2>
          <button
            type="button"
            onClick={close}
            className="cz-sheet-close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="cz-sheet-actions">
          <button type="button" className="cz-sheet-action" onClick={onCamera}>
            <Camera className="h-5 w-5" />
            <span>
              <strong>Take a photo</strong>
              <small>Use the camera</small>
            </span>
          </button>

          <button type="button" className="cz-sheet-action" onClick={onGallery}>
            <ImagePlus className="h-5 w-5" />
            <span>
              <strong>Choose from gallery</strong>
              <small>Pick an existing image</small>
            </span>
          </button>

          {canRemove && onRemove && (
            <button
              type="button"
              className="cz-sheet-action"
              data-destructive="true"
              onClick={onRemove}
            >
              <Trash2 className="h-5 w-5" />
              <span>
                <strong>Remove photo</strong>
                <small>Clear the current image</small>
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  ), document.body);
}
