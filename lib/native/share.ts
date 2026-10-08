import { Share } from '@capacitor/share';
import { isNativeApp } from '../platform';

export type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
  dialogTitle?: string;
};

export async function shareContent(input: ShareInput): Promise<'shared' | 'cancelled'> {
  if (isNativeApp()) {
    try {
      await Share.share(input);
      return 'shared';
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('cancel')) return 'cancelled';
      throw error;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url: input.url,
      });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  throw new Error('Sharing is not supported in this browser. Download the file instead.');
}
