'use client';

import { useEffect, type ReactNode } from 'react';

import { AppProvider } from '@/lib/context';
import { MusicPlayerProvider } from '@/lib/music-player';
import FeedbackHost from '@/components/feedback/FeedbackHost';
import { useCaizenCharacterPop } from '@/hooks/use-caizen-character-pop';

function findPasteTargetInput(): HTMLInputElement | null {
  const overlaySelector = '[role="dialog"], [data-caizen-overlay="open"], [data-radix-dialog-content], [data-slot="drawer-content"]';
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(overlaySelector)).filter(
    element => element.offsetParent !== null || element.getClientRects().length > 0,
  );

  // The topmost visible overlay is whichever comes last in DOM order, since
  // portaled dialogs/drawers are appended to document.body as they open.
  const scope: ParentNode = overlays.length ? overlays[overlays.length - 1] : document;

  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ).filter(input => {
    const accept = (input.getAttribute('accept') || '').toLowerCase();
    if (!accept.includes('image')) return false;
    if (accept.includes('pdf')) return false;
    return true;
  });

  return candidates.length === 1 ? candidates[0] : null;
}

function useScreenshotPaste() {
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      let imageFile: File | null = null;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFile = file;
            break;
          }
        }
      }
      if (!imageFile) return;

      const target = findPasteTargetInput();
      if (!target) return;

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(imageFile);
      target.files = dataTransfer.files;

      const changeEvent = new Event('change', { bubbles: true });
      target.dispatchEvent(changeEvent);

      event.preventDefault();
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);
}

export default function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  useScreenshotPaste();
  // Shared listener; only explicitly marked short title/name inputs animate.
  useCaizenCharacterPop();

  return (
    <AppProvider>
      <FeedbackHost>
        <MusicPlayerProvider>
          {children}
        </MusicPlayerProvider>
      </FeedbackHost>
    </AppProvider>
  );
}
