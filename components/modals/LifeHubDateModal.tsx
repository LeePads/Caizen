'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import {
  CancelButton,
  FormField,
  ModalFooter,
  SaveButton,
} from '@/components/common/FormPatterns';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { MoneyInput } from '@/components/ui/money-input';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type {
  CurrencyCode,
  ImportantDateItem,
  ImportantDateRepeat,
  ImportantDateType,
} from '@/lib/types';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { parseLocalDateKey, toLocalDateKey } from '@/lib/lifehub/date-utils';

export type LifeHubDateDraft = {
  title: string;
  type: ImportantDateType;
  date: string;
  endDate?: string;
  repeat: ImportantDateRepeat;
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  reminder: 'same_day' | '1_day_before' | '3_days_before' | '1_week_before' | 'custom';
  customReminderDays?: number;
  reminderEnabled: boolean;
  reminderTime?: string;
  trackAsOverdue: boolean;
  amount?: number;
  link?: string;
  notes?: string;
};

type Props = {
  isOpen: boolean;
  item?: ImportantDateItem | null;
  initialDate?: string;
  androidPresentation?: boolean;
  onSave: (draft: LifeHubDateDraft) => void;
  onClose: () => void;
};

const DATE_TYPES: Array<{ value: ImportantDateType; label: string }> = [
  { value: 'personal', label: 'Personal' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'bill', label: 'Bill' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'restock', label: 'Restock' },
  { value: 'personal_travel', label: 'Personal travel' },
  { value: 'other', label: 'Other' },
];

const OVERDUE_TYPES = new Set<ImportantDateType>([
  'bill',
  'subscription',
  'renewal',
  'deadline',
  'warranty',
  'restock',
]);

export default function LifeHubDateModal({ isOpen, item, initialDate, androidPresentation = false, onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ImportantDateType>('personal');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repeat, setRepeat] = useState<ImportantDateRepeat>('none');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high' | 'urgent'>('none');
  const [reminder, setReminder] = useState<'same_day' | '1_day_before' | '3_days_before' | '1_week_before' | 'custom'>('same_day');
  const [customReminderDays, setCustomReminderDays] = useState('1');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [trackAsOverdue, setTrackAsOverdue] = useState(false);
  const [amount, setAmount] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  useEffect(() => {
    if (!isOpen) return;
    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(getActiveCurrency());
    const nextMoneyCurrency = moneyInputCurrencyRef.current;
    const nextType = item?.type || 'personal';
    const next = {
      title: item?.title || '',
      type: nextType,
      date: item?.date ? toLocalDateKey(item.date) : initialDate || '',
      endDate: item?.endDate ? toLocalDateKey(item.endDate) : '',
      repeat: item?.repeat || 'none',
      priority: item?.priority || 'none',
      reminder: item?.reminder || 'same_day',
      customReminderDays: String(item?.customReminderDays || 1),
      reminderEnabled: Boolean(item?.reminderEnabled),
      reminderTime: item?.reminderTime || '09:00',
      trackAsOverdue: item?.trackAsOverdue ?? OVERDUE_TYPES.has(nextType),
      amount: formatMoneyInputValue(item?.amount, nextMoneyCurrency),
      link: item?.link || '',
      notes: item?.notes || '',
    };
    setTitle(next.title);
    setType(next.type);
    setDate(next.date);
    setEndDate(next.endDate);
    setRepeat(next.repeat);
    setPriority(next.priority);
    setReminder(next.reminder);
    setCustomReminderDays(next.customReminderDays);
    setReminderEnabled(next.reminderEnabled);
    setReminderTime(next.reminderTime);
    setTrackAsOverdue(next.trackAsOverdue);
    setAmount(next.amount);
    setLink(next.link);
    setNotes(next.notes);
    setShowMore(Boolean(next.amount || next.link || next.notes || next.endDate));
    setError('');
    setInitialSnapshot(JSON.stringify(next));
    setShowUnsaved(false);
  }, [initialDate, isOpen, item]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({
      title,
      type,
      date,
      endDate,
      repeat,
      priority,
      reminder,
      customReminderDays,
      reminderEnabled,
      reminderTime,
      trackAsOverdue,
      amount,
      link,
      notes,
    }),
    [amount, customReminderDays, date, endDate, link, notes, priority, reminder, reminderEnabled, reminderTime, repeat, title, trackAsOverdue, type],
  );

  const canClose = () => {
    if (initialSnapshot && currentSnapshot !== initialSnapshot) {
      setShowUnsaved(true);
      return false;
    }
    return true;
  };

  const requestClose = () => {
    if (canClose()) onClose();
  };

  const submit = () => {
    setError('');
    if (!title.trim()) {
      setError('Enter a title.');
      return;
    }
    const start = parseLocalDateKey(date);
    const end = parseLocalDateKey(endDate);
    if (!start) {
      setError('Choose a valid date.');
      return;
    }
    if (end && end < start) {
      setError('End date cannot be before the start date.');
      return;
    }
    const numericAmount = amount === '' ? undefined : Number(amount);
    if (numericAmount != null && (!Number.isFinite(numericAmount) || numericAmount < 0)) {
      setError('Amount must be zero or greater.');
      return;
    }
    const baseAmount = convertMoneyInputToBase(amount, moneyInputCurrency);
    if (amount !== '' && baseAmount === undefined) {
      setError('Enter a valid amount.');
      return;
    }
    if (link && !/^(https?:\/\/)?[^\s]+$/i.test(link)) {
      setError('Enter a valid link or leave it blank.');
      return;
    }

    onSave({
      title: title.trim(),
      type,
      date,
      endDate: endDate || undefined,
      repeat,
      priority,
      reminder,
      customReminderDays:
        reminder === 'custom'
          ? Math.max(0, Number(customReminderDays || 0))
          : undefined,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : undefined,
      trackAsOverdue,
      amount: amount === '' ? undefined : baseAmount,
      link: link.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <CaizenFormDialog
        eyebrow={item ? 'Edit date' : 'New date'}
        title={item ? 'Update calendar item' : 'Add to your calendar'}
        onClose={onClose}
        onBeforeClose={canClose}
        maxWidthClass="max-w-2xl"
        panelClassName={androidPresentation ? 'android-lifehub-modal' : undefined}
        footer={(
          <ModalFooter>
            <CancelButton onClick={requestClose} />
            <SaveButton onClick={submit}>{item ? 'Save Changes' : 'Add Event'}</SaveButton>
          </ModalFooter>
        )}
      >
        <div className="grid gap-4">
          <FormField label="Title">
            <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="What is happening?" autoFocus />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              <AndroidAdaptiveSelect
                label="Type"
                value={type}
                onChange={value => {
                  const next = value as ImportantDateType;
                  setType(next);
                  if (!item) setTrackAsOverdue(OVERDUE_TYPES.has(next));
                }}
                className="control-input"
                options={DATE_TYPES}
              />
            </FormField>
            <FormField label="Priority">
              <AndroidAdaptiveSelect label="Priority" value={priority} onChange={value => setPriority(value as typeof priority)} className="control-input" options={[{ value: 'none', label: 'None' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date">
              <AdaptiveDatePicker label="Date" value={date} onChange={setDate} className="control-input" required />
            </FormField>
            <FormField label="Repeat">
              <AndroidAdaptiveSelect label="Repeat" value={repeat} onChange={value => setRepeat(value as ImportantDateRepeat)} className="control-input" options={[{ value: 'none', label: 'Does not repeat' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
            </FormField>
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Reminder lead">
                <AndroidAdaptiveSelect label="Reminder lead" value={reminder} onChange={value => setReminder(value as typeof reminder)} className="control-input" options={[{ value: 'same_day', label: 'Same day' }, { value: '1_day_before', label: '1 day before' }, { value: '3_days_before', label: '3 days before' }, { value: '1_week_before', label: '1 week before' }, { value: 'custom', label: 'Custom' }]} />
              </FormField>
              {reminder === 'custom' ? (
                <FormField label="Days before">
                  <Input type="number" min="0" value={customReminderDays} onChange={event => setCustomReminderDays(event.target.value)} />
                </FormField>
              ) : (
                <div className="flex min-h-11 items-center justify-between gap-3 px-1">
                  <span className="text-sm font-semibold">Send notification</span>
                  <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} aria-label="Send notification" />
                </div>
              )}
            </div>
            {reminder === 'custom' ? (
              <div className="mt-3 flex min-h-11 items-center justify-between gap-3 px-1">
                <span className="text-sm font-semibold">Send notification</span>
                <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} aria-label="Send notification" />
              </div>
            ) : null}
            {reminderEnabled ? (
              <div className="mt-3">
                <SleepTimePicker label="Reminder time" value={reminderTime} onChange={setReminderTime} className="control-input" />
              </div>
            ) : null}
          </div>

          <div className="flex min-h-11 items-center justify-between gap-4 border-t border-border/50 px-1 pt-3">
            <span>
              <span className="block text-sm font-semibold">Keep visible until resolved</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Useful for bills, renewals, deadlines, warranties, and restocks.</span>
            </span>
            <Switch checked={trackAsOverdue} onCheckedChange={setTrackAsOverdue} aria-label="Keep visible until resolved" />
          </div>

          <button
            type="button"
            onClick={() => setShowMore(current => !current)}
            className="min-h-11 rounded-xl border border-border/60 px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            {showMore ? 'Hide optional details' : 'Add end date, amount, link, or notes'}
          </button>

          {showMore ? (
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/10 p-3 sm:grid-cols-2">
              <FormField label="End date">
                <AdaptiveDatePicker label="End date" value={endDate} onChange={setEndDate} className="control-input" />
              </FormField>
              <FormField label={`Amount (${moneyInputCurrency})`}>
                <MoneyInput type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} currency={moneyInputCurrency} placeholder="Optional" />
              </FormField>
              <FormField label="Link">
                <Input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="Optional URL" />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Notes">
                  <FormattedTextarea value={notes} onChange={setNotes} placeholder="Details, account reference, preparation notes..." minRows={4} showToolbar={!androidPresentation} />
                </FormField>
              </div>
            </div>
          ) : null}

          {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{error}</p> : null}

        </div>
      </CaizenFormDialog>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard calendar changes?"
        message="You have unsaved calendar inputs. Close without saving?"
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsaved(false)}
        onConfirm={() => {
          setShowUnsaved(false);
          onClose();
        }}
      />
    </>
  );
}
