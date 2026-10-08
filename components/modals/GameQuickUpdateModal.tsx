'use client';

import { useEffect, useState } from 'react';
import type { Game, GameStatus } from '@/lib/types';
import { FormField, ModalFooter, CancelButton, SaveButton } from '@/components/common/FormPatterns';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type GameQuickUpdateMode = 'status' | 'playtime' | 'note';

const STATUS_OPTIONS: Array<{ value: Exclude<GameStatus, 'active'>; label: string }> = [
  { value: 'playing', label: 'Playing' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'upcoming', label: 'Upcoming' },
];

export default function GameQuickUpdateModal({
  game,
  mode,
  onSave,
  onClose,
}: {
  game: Game;
  mode: GameQuickUpdateMode;
  onSave: (updates: Partial<Game>) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Exclude<GameStatus, 'active'>>(
    game.status === 'active' ? 'playing' : game.status,
  );
  const [playtime, setPlaytime] = useState('');
  const [notes, setNotes] = useState(game.notes || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setStatus(game.status === 'active' ? 'playing' : game.status);
    setPlaytime('');
    setNotes(game.notes || '');
    setError('');
  }, [game]);

  const title = mode === 'status'
    ? `Update ${game.title} status`
    : mode === 'playtime'
      ? `Add playtime to ${game.title}`
      : `Edit notes for ${game.title}`;

  const submit = () => {
    setError('');
    if (mode === 'status') {
      onSave({ status });
      return;
    }
    if (mode === 'playtime') {
      const delta = Number(playtime);
      if (!playtime.trim() || !Number.isFinite(delta) || delta <= 0) {
        setError('Enter a playtime amount greater than 0.');
        return;
      }
      onSave({ hoursPlayed: Number(game.hoursPlayed || 0) + delta });
      return;
    }
    onSave({ notes: notes.trim() || undefined });
  };

  return (
    <CaizenFormDialog eyebrow="Quick update" title={title} onClose={onClose} maxWidthClass="max-w-lg" footer={<ModalFooter><CancelButton onClick={onClose} /><SaveButton onClick={submit}>Save locally</SaveButton></ModalFooter>}>
      <div className="grid gap-4">
        {mode === 'status' ? (
          <FormField label="Status">
            <AndroidAdaptiveSelect
              autoFocus
              label="Status"
              value={status}
              onChange={value => setStatus(value as Exclude<GameStatus, 'active'>)}
              className="control-input"
              options={STATUS_OPTIONS}
            />
          </FormField>
        ) : null}

        {mode === 'playtime' ? (
          <FormField label="Add playtime" hint={`Current total: ${Number(game.hoursPlayed || 0)} hours`} error={error}>
            <Input autoFocus type="number" min="0.5" step="0.5" inputMode="decimal" value={playtime} onChange={event => setPlaytime(event.target.value)} placeholder="0.5" />
          </FormField>
        ) : null}

        {mode === 'note' ? (
          <FormField label="Notes" hint="Keep notes focused on goals, progress, or useful reminders. Avoid passwords and other credentials.">
            <Textarea autoFocus value={notes} onChange={event => setNotes(event.target.value)} className="min-h-36" placeholder="What are you working on next?" />
          </FormField>
        ) : null}

      </div>
    </CaizenFormDialog>
  );
}
