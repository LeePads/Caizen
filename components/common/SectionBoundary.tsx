'use client';

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

/**
 * Offline Android builds load section chunks from the bundled assets. When a
 * chunk fails to resolve, `next/dynamic` never settles and the loading
 * placeholder animates forever with no way out. These two pieces give every
 * async section a terminal state: a watchdog that stops waiting, and a
 * boundary that catches the throw.
 */

const LOADING_WATCHDOG_MS = 8000;

function reloadApp() {
  window.location.reload();
}

export function SectionLoadingFallback({ label = 'section' }: { label?: string }) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), LOADING_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (stalled) {
    return (
      <div className="android-compact-state" data-kind="error" role="alert">
        <strong>This section did not finish loading</strong>
        <p>It may have been interrupted. Reloading usually fixes it. Your data is safe.</p>
        <button type="button" className="android-compact-state-action" onClick={reloadApp}>
          Reload Caizen
        </button>
      </div>
    );
  }

  return (
    <div
      data-caizen-section-loading="true"
      className="android-section-loading"
      role="status"
      aria-label={`Loading ${label}`}
    >
      <span className="android-section-loading-bar" />
      <span className="sr-only">Loading {label}</span>
    </div>
  );
}

type BoundaryProps = { children: ReactNode; sectionName?: string };
type BoundaryState = { error: Error | null };

export class SectionErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console for debugging; never surface it in the UI.
    console.error(`Caizen section "${this.props.sectionName ?? 'unknown'}" failed to render.`, error, info);
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    // Navigating to a different section clears a previous section's failure.
    if (this.state.error && prevProps.sectionName !== this.props.sectionName) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="android-compact-state" data-kind="error" role="alert">
        <strong>This section could not be opened</strong>
        <p>Your saved data was not affected. Try again, or reload Caizen.</p>
        <div className="android-compact-state-actions">
          <button
            type="button"
            className="android-compact-state-action"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button type="button" className="android-compact-state-action" onClick={reloadApp}>
            Reload Caizen
          </button>
        </div>
      </div>
    );
  }
}
