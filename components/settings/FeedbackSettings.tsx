'use client';

import { MessageSquareText } from 'lucide-react';

import type { FeedbackPreferences } from '@/lib/feedback/types';
import { normalizeFeedbackPreferences } from '@/lib/feedback/types';
import { Switch } from '@/components/ui/switch';

export function FeedbackSettings({
  value,
  onChange,
  compact = false,
}: {
  value: Partial<FeedbackPreferences> | null | undefined;
  onChange: (next: FeedbackPreferences) => void;
  compact?: boolean;
}) {
  const preferences = normalizeFeedbackPreferences(value);
  const update = (patch: Partial<FeedbackPreferences>) => onChange({ ...preferences, ...patch });
  return (
    <div className={compact ? 'space-y-3' : 'rounded-2xl border border-border/50 bg-card p-4'}>
      <div className="flex items-start gap-3">
        <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="text-section-title">In-app feedback</h4>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Calm confirmations for completed actions and meaningful progress.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <label className={compact ? 'flex min-h-11 items-center justify-between gap-3 border-b border-border/40 py-3 text-sm font-semibold' : 'flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/40 bg-input px-3 py-3 text-sm font-semibold'}>
          <span>Show toast notifications</span>
          <Switch checked={preferences.showToasts} onCheckedChange={showToasts => update({ showToasts })} aria-label="Show toast notifications" />
        </label>
      </div>
    </div>
  );
}
