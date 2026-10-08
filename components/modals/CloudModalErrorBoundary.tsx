'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type Props = {
  children: ReactNode;
  onClose: () => void;
};

type State = { error: Error | null };

function CloudModalFailure({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="top-auto bottom-0 max-w-2xl translate-y-0 rounded-b-none rounded-t-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle>Cloud Backup couldn’t open</DialogTitle>
            <DialogDescription className="mt-2">Your local data is safe. Try opening Cloud Backup again.</DialogDescription>
          </div>
          <button type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60" aria-label="Close Cloud Backup"><X className="size-5" /></button>
        </div>
        <Button type="button" variant="outline" onClick={onRetry} className="mt-4 h-11 rounded-xl sm:h-10"><RefreshCw className="mr-2 size-4" />Retry</Button>
      </DialogContent>
    </Dialog>
  );
}

export default class CloudModalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cloud Backup modal failed to render.', error, info);
  }

  render() {
    return this.state.error
      ? <CloudModalFailure onClose={this.props.onClose} onRetry={() => this.setState({ error: null })} />
      : this.props.children;
  }
}
