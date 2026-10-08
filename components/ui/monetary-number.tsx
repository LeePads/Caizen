'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { animate } from 'framer-motion';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';

const MonetaryMotionContext = createContext({ revision: '', ready: false });

// The section owns this visual epoch; it never enters persisted state.
export function MonetaryMotionProvider({ revision, ready, children }: {
  revision: string;
  ready: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ revision, ready }), [revision, ready]);
  return <MonetaryMotionContext.Provider value={value}>{children}</MonetaryMotionContext.Provider>;
}

// Preserve existing Money callers while other sections share the same motion.
export const MoneyMotionProvider = MonetaryMotionProvider;

function subscribeVisibility(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}

function isDocumentVisible() {
  return document.visibilityState === 'visible';
}

// These are display units parsed from the already-formatted string, never saved/base amounts.
function readDisplayAmount(formatted: string) {
  const match = /[0-9][0-9,]*(?:\.[0-9]+)?/.exec(formatted);
  if (!match) return null;
  const prefix = formatted.slice(0, match.index);
  const suffix = formatted.slice(match.index + match[0].length);
  const precision = match[0].split('.')[1]?.length ?? 0;
  const amount = Number(match[0].replaceAll(',', '')) * (/[-−]/.test(prefix) ? -1 : 1);
  if (!Number.isFinite(amount) || precision > 20) return null;
  const signIndex = prefix.search(/[+−-]/);
  return { amount, prefix: prefix.replace(/[+−-]/g, ''), suffix, precision,
    signIndex: Math.max(0, signIndex), plus: prefix.includes('+'), minus: prefix.includes('−') ? '−' : '-' };
}

/** Eased counting, as in the reference. Only the aria-hidden display is interpolated. */
export function MonetaryNumber({ formatted, hidden, revision = '' }: {
  formatted: string;
  hidden: boolean;
  revision?: string;
}) {
  const section = useContext(MonetaryMotionContext);
  const epoch = `${section.revision}:${revision}`;
  const mode = useCaizenMotionMode();
  const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, () => false);
  const root = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const visual = useRef<HTMLSpanElement>(null);
  const displayedAmount = useRef<number | null>(null);
  const previousFormat = useRef('');
  const played = useRef<{ formatted: string; epoch: string } | null>(null);
  const enabled = section.ready && !hidden && visible && inView && (mode === 'full' || mode === 'android');

  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    // Visibility arrives asynchronously; mounting a dashboard never measures each value.
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const text = visual.current;
    if (!text) return;
    const target = hidden ? null : readDisplayAmount(formatted);
    const formatKey = target ? `${target.prefix}:${target.suffix}:${target.precision}` : '';
    const settle = () => {
      text.textContent = hidden ? '••••••' : formatted;
      text.style.removeProperty('min-width');
      displayedAmount.current = target?.amount ?? null;
      previousFormat.current = formatKey;
    };
    if (hidden || !section.ready) {
      displayedAmount.current = null;
      played.current = null;
      previousFormat.current = '';
      text.textContent = hidden ? '••••••' : formatted;
      text.style.removeProperty('min-width');
      return;
    }
    if (!enabled || !target) {
      // Settle changes made in the background; do not roll stale values later.
      if (played.current) played.current = { formatted, epoch };
      settle();
      return;
    }
    if (played.current?.formatted === formatted && played.current.epoch === epoch) {
      settle();
      return;
    }
    const arrival = !played.current || played.current.epoch !== epoch || previousFormat.current !== formatKey;
    const from = arrival ? 0 : displayedAmount.current ?? target.amount;
    previousFormat.current = formatKey;
    played.current = { formatted, epoch };
    const numberFormat = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: target.precision, maximumFractionDigits: target.precision,
    });
    const renderAmount = (amount: number) => {
      displayedAmount.current = amount;
      const sign = amount < 0 ? target.minus : amount > 0 && target.plus ? '+' : '';
      const prefix = target.prefix.slice(0, target.signIndex) + sign + target.prefix.slice(target.signIndex);
      text.textContent = prefix + numberFormat.format(Math.abs(amount)) + target.suffix;
    };
    const tokens = getComputedStyle(root.current!);
    const milliseconds = (name: string) => {
      const token = tokens.getPropertyValue(name).trim();
      return parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
    };
    const easing = tokens.getPropertyValue('--ease-caizen').match(/[\d.]+/g)?.map(Number);
    // Reserve the final text width so counting from zero does not shift adjacent copy.
    text.textContent = formatted;
    text.style.removeProperty('min-width');
    text.style.minWidth = `${text.getBoundingClientRect().width}px`;
    renderAmount(from);
    const animation = animate(from, target.amount, {
      duration: (milliseconds('--motion-standard') + milliseconds('--motion-structural')) / 1000,
      ease: easing?.length === 4 ? easing as [number, number, number, number] : 'easeOut',
      onUpdate: renderAmount,
      onComplete: settle,
    });
    return () => animation.stop();
  }, [enabled, epoch, formatted, hidden, section.ready]);

  return (
    <span ref={root} className="tabular-nums">
      <span className="sr-only">{hidden ? 'Hidden' : formatted}</span>
      <span ref={visual} className="caizen-monetary-number" aria-hidden="true">{hidden ? '••••••' : formatted}</span>
    </span>
  );
}
