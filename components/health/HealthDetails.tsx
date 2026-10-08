import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep secondary Health tools nearby without competing with the daily task. */
export function HealthDetails({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group border-t border-border/50 ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
