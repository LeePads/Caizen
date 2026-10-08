'use client';

import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { FileText, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';

interface NotesModalProps {
  isOpen: boolean;
  notes: string;
  onClose: () => void;
}

export default function NotesModal({
  isOpen,
  notes,
  onClose,
}: NotesModalProps) {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  useOverlayLifecycle(isOpen, close, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });

  if (!isOpen) return null;

  const lines = notes
    .split('\n')
    .map(line => {
      const trimmed =
        line.trim();

      if (
        trimmed.startsWith('- ') ||
        trimmed.startsWith('* ')
      ) {
        return {
          bullet: true,
          text:
            trimmed.substring(2),
        };
      }

      return {
        bullet: false,
        text: line,
      };
    });

  return createPortal(
    <div
      className="
        fixed
        inset-0
        z-[10000]

        flex
        items-center
        justify-center

        p-4
      "
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="
          absolute
          inset-0

          bg-black/70

          backdrop-blur-xl
        "
      />

      {/* Modal */}
      <div
        ref={modalPanelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-notes-title"
        data-caizen-overlay-panel="true"
        className="
          relative
          z-10

          w-full
          max-w-2xl

          overflow-hidden

          rounded-[2rem]

          border
          border-white/10

          bg-background/95

          shadow-2xl

          backdrop-blur-2xl
        "
      >
        {/* Glow */}
        <div
          className="
            absolute
            right-0
            top-0

            h-64
            w-64

            rounded-full

            bg-primary/10

            blur-3xl
          "
        />

        {/* Header */}
        <div
          className="
            relative

            flex
            items-start
            justify-between

            gap-4

            border-b
            border-border/50

            px-6
            py-5
          "
        >
          <div
            className="
              flex
              items-center
              gap-4
            "
          >
            <div
              className="
                flex
                h-14
                w-14

                items-center
                justify-center

                rounded-2xl

                bg-primary/10
                text-primary
              "
            >
              <FileText className="h-6 w-6" />
            </div>

            <div>
              <h2
                id="asset-notes-title"
                className="
                  text-2xl
                  font-black
                  tracking-tight
                "
              >
                Asset Notes
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >
                Detailed notes and lore
              </p>
            </div>
          </div>

          <button
            onClick={close}
            className="
              rounded-2xl

              border
              border-white/10

              bg-background/50

              p-3

              text-muted-foreground

              hover:text-foreground
            "
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          className="
            max-h-[500px]
            overflow-y-auto

            px-6
            py-5
          "
        >
          {notes.trim() ? (
            <div
              className="
                space-y-3

                text-base
                leading-relaxed
              "
            >
              {lines.map(
                (
                  line,
                  index
                ) => (
                  <div
                    key={index}
                    className="
                      flex
                      gap-2
                    "
                  >
                    {line.bullet ? (
                      <>
                        <span>
                          •
                        </span>

                        <span>
                          {
                            line.text
                          }
                        </span>
                      </>
                    ) : (
                      <span>
                        {
                          line.text
                        }
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            <p
              className="
                text-muted-foreground
              "
            >
              No notes available.
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="
            border-t
            border-border/50

            px-6
            py-5

            flex
            justify-end
          "
        >
          <Button
            onClick={close}
            className="
              h-12
              rounded-2xl
              px-6
            "
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
