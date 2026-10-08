'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import BalanceLifeHubContext from '@/components/balance/BalanceLifeHubContext';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { CaizenTimePicker } from '@/components/ui/sleep-time-picker';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/lib/context';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNativeApp } from '@/lib/platform';
import { formatLocalDateInput, parseLocalDateInputOrUndefined } from '@/lib/date-utils';
import { resolveUpcomingMoneyRequest } from '@/lib/balance';
import {
  convertMoneyInputToBase,
  formatCurrency,
  formatPHP,
  getActiveCurrency,
  getBaseCurrency,
  getEffectiveMoneyInputCurrency,
  formatMoneyInputValue,
} from '@/lib/currency';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import type {
  UpcomingMoneyCategory,
  UpcomingMoneyDirection,
  UpcomingMoneyItem,
  CurrencyCode,
  Wallet as WalletData,
} from '@/lib/types';
import {
  applyUpcomingMoneyProgress,
  getUpcomingMoneyRemaining,
  getUpcomingMoneyStatus,
  isUpcomingMoneyComplete,
  restoreUpcomingMoneyItem,
  summarizeUpcomingMoney,
  getUpcomingMoneyReminderAt,
  isValidUpcomingMoneyReminderTime,
  normalizeUpcomingMoneyReminderDate,
} from '@/lib/upcoming-money';

const CATEGORY_OPTIONS: Array<{
  value: UpcomingMoneyCategory;
  label: string;
}> = [
  { value: 'gift', label: 'Gift' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'repayment', label: 'Repayment' },
  { value: 'reimbursement', label: 'Reimbursement' },
  { value: 'refund', label: 'Refund' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'deposit', label: 'Deposit return' },
  { value: 'repair', label: 'Repair' },
  { value: 'travel', label: 'Travel' },
  { value: 'education', label: 'Education' },
  { value: 'medical', label: 'Medical' },
  { value: 'other', label: 'Other' },
];

type MoneyDraft = {
  title: string;
  direction: UpcomingMoneyDirection;
  amount: string;
  dueDate: string;
  person: string;
  category: UpcomingMoneyCategory;
  walletId: string;
  reserveFunds: boolean;
  reminderEnabled: boolean;
  reminderDate: string;
  reminderTime: string;
  notes: string;
};

const toDateInput = (value?: Date | string | null) => {
  return formatLocalDateInput(value);
};

const createDraft = (
  item: UpcomingMoneyItem | null | undefined,
  inputCurrency?: CurrencyCode,
): MoneyDraft => ({
  title: item?.title || '',
  direction: item?.direction || 'outgoing',
  amount: item ? formatMoneyInputValue(item.amount, inputCurrency) : '',
  dueDate: toDateInput(item?.dueDate),
  person: item?.person || '',
  category: item?.category || 'other',
  walletId: item?.walletId || '',
  reserveFunds: item?.direction === 'incoming' ? false : item?.reserveFunds !== false,
  reminderEnabled: item?.reminderEnabled === true,
  reminderDate: item?.reminderDate || '',
  reminderTime: item?.reminderTime || '',
  notes: item?.notes || '',
});

function getReminderValidationMessage(draft: MoneyDraft): string | null {
  if (!draft.reminderEnabled) return null;
  if (!normalizeUpcomingMoneyReminderDate(draft.reminderDate)) {
    return 'Choose a reminder date.';
  }
  if (!isValidUpcomingMoneyReminderTime(draft.reminderTime)) {
    return 'Choose a reminder time in your local time zone.';
  }
  const at = getUpcomingMoneyReminderAt(draft.reminderDate, draft.reminderTime);
  if (!at) return 'Choose a valid local reminder date and time.';
  if (at.getTime() <= Date.now()) {
    return 'Choose a reminder date and time in the future.';
  }
  return null;
}

const statusLabel = (item: UpcomingMoneyItem) => {
  const status = getUpcomingMoneyStatus(item);
  if (status === 'partially-paid') return 'Partially recorded';
  if (status === 'overdue') return 'Overdue';
  if (status === 'received') return 'Received';
  if (status === 'paid') return 'Paid';
  if (status === 'cancelled') return 'Cancelled';
  return 'Planned';
};

const statusClass = (item: UpcomingMoneyItem) => {
  const status = getUpcomingMoneyStatus(item);
  if (status === 'overdue') {
    return 'border-red-400/25 bg-red-500/10 text-red-600 dark:text-red-300';
  }
  if (isUpcomingMoneyComplete(item)) {
    return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'partially-paid') {
    return 'border-amber-400/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-border/60 bg-muted/50 text-muted-foreground';
};

function MoneyValue({ value, hidden }: { value: number; hidden: boolean }) {
  return <span className="min-w-0 break-words tabular-nums">{hidden ? '••••••' : formatPHP(value)}</span>;
}

export function UpcomingMoneyOverview({
  items,
  hidden,
  conservativeSafeToSpend,
  projectedAfterIncoming,
  onOpen,
}: {
  items: UpcomingMoneyItem[];
  hidden: boolean;
  conservativeSafeToSpend: number;
  projectedAfterIncoming: number;
  onOpen: () => void;
}) {
  const summary = summarizeUpcomingMoney(items);

  return (
    <section className="section-surface min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title">One-time money</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.outgoing.length} to pay · {summary.incoming.length} to receive
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onOpen}>
          Open plan
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 px-1 py-2">
          <p className="text-xs text-muted-foreground">Available after payments</p>
          <p className="mt-1 break-words text-xl font-bold tabular-nums">
            <MoneyValue value={conservativeSafeToSpend} hidden={hidden} />
          </p>
        </div>
        <div className="min-w-0 px-1 py-2">
          <p className="text-xs text-muted-foreground">After expected money</p>
          <p className="mt-1 break-words text-xl font-bold tabular-nums">
            <MoneyValue value={projectedAfterIncoming} hidden={hidden} />
          </p>
        </div>
      </div>
    </section>
  );
}

export default function UpcomingMoneyPanel({
  hidden = false,
  androidPresentation = false,
  requestedItemId,
  requestedDirection,
  requestedSignal = 0,
  currency,
}: {
  hidden?: boolean;
  androidPresentation?: boolean;
  requestedItemId?: string;
  requestedDirection?: UpcomingMoneyDirection;
  requestedSignal?: number;
  currency?: CurrencyCode;
}) {
  const context = useAppContext();
  const items = useMemo(() => context.upcomingMoneyItems || [], [context.upcomingMoneyItems]);
  const wallets = context.wallets || [];
  const summary = useMemo(() => summarizeUpcomingMoney(items), [items]);

  const [editingItem, setEditingItem] = useState<UpcomingMoneyItem | null>(null);
  const [creatingDirection, setCreatingDirection] =
    useState<UpcomingMoneyDirection | null>(null);
  const [progressItem, setProgressItem] = useState<UpcomingMoneyItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<UpcomingMoneyItem | null>(null);
  const [actionItem, setActionItem] = useState<UpcomingMoneyItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const consumedRequestSignalRef = useRef(0);

  useEffect(() => {
    const resolved = resolveUpcomingMoneyRequest(
      items,
      { requestedItemId, requestedDirection, signal: requestedSignal },
      consumedRequestSignalRef.current,
    );
    if (!resolved) return;

    consumedRequestSignalRef.current = resolved.signal;
    if ('item' in resolved && resolved.item) {
      setEditingItem(resolved.item);
      setCreatingDirection(null);
    } else if ('direction' in resolved) {
      setEditingItem(null);
      setCreatingDirection(resolved.direction);
    }
  }, [items, requestedDirection, requestedItemId, requestedSignal]);

  const renderList = (
    title: string,
    description: string,
    direction: UpcomingMoneyDirection,
    directionItems: UpcomingMoneyItem[],
  ) => (
    <section className="min-w-0 rounded-2xl border border-border/55 bg-card/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-card-title">
            {direction === 'outgoing' ? (
              <ArrowUpRight className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            ) : (
              <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            )}
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCreatingDirection(direction)}
        >
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {directionItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-5 text-sm text-muted-foreground">
            No active {direction === 'outgoing' ? 'one-time payments' : 'money to receive'}.
          </div>
        ) : (
          directionItems.map(item => {
            const remaining = getUpcomingMoneyRemaining(item);
            const wallet = wallets.find(walletItem => walletItem.id === item.walletId);

            return (
              <article
                key={item.id}
                className="@container/upcoming flex min-w-0 flex-col border-b border-border/55 py-4 last:border-0"
              >
                <div className="flex flex-col items-start gap-3 @min-[28rem]/upcoming:flex-row @min-[28rem]/upcoming:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(item)}`}
                      >
                        {statusLabel(item)}
                      </span>
                      {direction === 'outgoing' && item.reserveFunds === false && (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          Not reserved
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 break-words text-card-title">{item.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.person ? `${item.person} · ` : ''}
                      {item.dueDate
                        ? new Date(item.dueDate).toLocaleDateString()
                        : 'No due date'}
                      {wallet ? ` · ${wallet.name}` : ''}
                    </p>
                  </div>

                  <div className="flex w-full min-w-0 items-start justify-between gap-2 @min-[28rem]/upcoming:w-auto">
                    <div className="min-w-0 @min-[28rem]/upcoming:text-right">
                      <p className="font-bold">
                        <MoneyValue value={remaining} hidden={hidden} />
                      </p>
                      {item.recordedAmount > 0 && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          of <MoneyValue value={item.amount} hidden={hidden} />
                        </p>
                      )}
                    </div>

                    {androidPresentation ? (
                      <button
                        type="button"
                        onClick={() => setActionItem(item)}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${item.title}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Actions for ${item.title}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="min-w-40">
                          <DropdownMenuItem onSelect={() => setEditingItem(item)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeletingItem(item)}>
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {item.notes && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {item.notes}
                  </p>
                )}

                <BalanceLifeHubContext item={item} />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {item.recordedAmount > 0
                      ? `${Math.round((item.recordedAmount / Math.max(1, item.amount)) * 100)}% recorded`
                      : direction === 'outgoing'
                        ? 'Not paid yet'
                        : 'Not received yet'}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setProgressItem(item)}
                    className="rounded-xl"
                  >
                    {direction === 'outgoing' ? 'Record payment' : 'Record receipt'}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <section className="section-surface min-w-0 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-section-title">
              One-time payments and incoming money
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Completed items leave the active list automatically and remain in
              the archive below.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreatingDirection('incoming')}
            >
              <ArrowDownLeft className="mr-2 h-4 w-4" /> To receive
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreatingDirection('outgoing')}
            >
              <Plus className="mr-2 h-4 w-4" /> To pay
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 px-1 py-2">
            <p className="text-xs text-muted-foreground">Reserved · still to pay</p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums">
              <MoneyValue value={summary.reservedOutgoing} hidden={hidden} />
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Already held back from your available balance.</p>
          </div>
          {summary.unreservedOutgoing > 0 && (
            <div className="min-w-0 px-1 py-2">
              <p className="text-xs text-muted-foreground">Planned · not reserved</p>
              <p className="mt-1 break-words text-xl font-bold tabular-nums">
                <MoneyValue value={summary.unreservedOutgoing} hidden={hidden} />
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Won't reduce your available balance until you reserve it.</p>
            </div>
          )}
          <div className="min-w-0 px-1 py-2">
            <p className="text-xs text-muted-foreground">Expected later</p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums">
              <MoneyValue value={summary.incomingRemaining} hidden={hidden} />
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Incoming money not yet received.</p>
          </div>
          <div className="min-w-0 px-1 py-2">
            <p className="text-xs text-muted-foreground">Needs attention</p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums">{summary.overdueCount}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {renderList(
          'To pay',
          'Gifts, purchases, repairs, travel, and other one-time costs.',
          'outgoing',
          summary.outgoing,
        )}
        {renderList(
          'To receive',
          'Refunds, reimbursements, repayments, and freelance payments.',
          'incoming',
          summary.incoming,
        )}
      </div>

      <section className="rounded-[1.35rem] border border-border/55 bg-card/70">
        <button
          type="button"
          onClick={() => setShowCompleted(current => !current)}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <span className="flex items-center gap-2 font-bold">
            <History className="h-4 w-4 text-muted-foreground" /> Completed archive
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {summary.completedCount}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
          />
        </button>

        {showCompleted && (
          <div className="space-y-2 border-t border-border/55 p-4 sm:p-5">
            {summary.completed.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-5 text-sm text-muted-foreground">
                Fully paid or received one-time items will appear here.
              </p>
            ) : (
              summary.completed.map(item => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 min-w-0 px-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {statusLabel(item)}
                      {item.completedAt
                        ? ` · ${new Date(item.completedAt).toLocaleDateString()}`
                        : ''}
                    </p>
                    <BalanceLifeHubContext item={item} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">
                      <MoneyValue value={item.recordedAmount || item.amount} hidden={hidden} />
                    </span>
                    {item.status !== 'cancelled' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          context.updateUpcomingMoneyItem(
                            item.id,
                            restoreUpcomingMoneyItem(item),
                          )
                        }
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {actionItem ? (
        <CaizenBottomSheet
          open
          title={actionItem.title}
          description="Manage this one-time payment or incoming money."
          onClose={() => setActionItem(null)}
        >
          <div className="android-balance-action-list">
            <button
              type="button"
              className="android-balance-action"
              onClick={() => {
                setActionItem(null);
                setEditingItem(actionItem);
              }}
            >
              <Pencil className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-left font-bold">Edit</span>
            </button>
            <button
              type="button"
              className="android-balance-action android-balance-action-destructive"
              onClick={() => {
                setActionItem(null);
                setDeletingItem(actionItem);
              }}
            >
              <Trash2 className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-left font-bold">Delete</span>
            </button>
          </div>
        </CaizenBottomSheet>
      ) : null}

      {(creatingDirection || editingItem) && (
        <MoneyItemModal
          item={editingItem}
          initialDirection={creatingDirection || editingItem?.direction || 'outgoing'}
          wallets={wallets}
          hidden={hidden}
          currency={currency}
          onClose={() => {
            setCreatingDirection(null);
            setEditingItem(null);
          }}
          onSave={draft => {
            if (!context.profiles.some(profile => profile.id === context.currentProfileId) ||
              (editingItem && !items.some(item => item.id === editingItem.id))) {
              throw new Error('This money item is no longer available. Close this form and review the current profile.');
            }
            const reminderWasEnabled = editingItem?.reminderEnabled === true;
            const payload = {
              title: draft.title.trim(),
              direction: draft.direction,
              amount: Math.max(0, Number(draft.amount || 0)),
              dueDate: draft.dueDate
                ? parseLocalDateInputOrUndefined(draft.dueDate)
                : undefined,
              person: draft.person.trim() || undefined,
              category: draft.category,
              walletId: draft.walletId || undefined,
              status: editingItem?.status || ('planned' as const),
              recordedAmount: editingItem?.recordedAmount || 0,
              reserveFunds:
                draft.direction === 'outgoing' ? draft.reserveFunds : false,
              reminderEnabled: draft.reminderEnabled,
              reminderDate: draft.reminderEnabled ? draft.reminderDate : undefined,
              reminderTime: draft.reminderEnabled ? draft.reminderTime : undefined,
              linkedWishlistItemId: editingItem?.linkedWishlistItemId,
              linkedInventoryItemId: editingItem?.linkedInventoryItemId,
              notes: draft.notes.trim() || undefined,
              archived: editingItem?.archived || false,
              completedAt: editingItem?.completedAt,
            };

            if (editingItem) {
              context.updateUpcomingMoneyItem(editingItem.id, payload);
            } else {
              if (!context.addUpcomingMoneyItem(payload)) {
                throw new Error('The money item could not be added. Review the current profile, then try again.');
              }
            }

            if (draft.reminderEnabled) {
              toast({
                actionId: `money-reminder:${editingItem?.id || 'new'}:${draft.reminderDate}:${draft.reminderTime}`,
                title: reminderWasEnabled ? 'Money reminder updated' : 'Money reminder saved',
                description: isNativeApp()
                  ? 'It will reconcile on this device while notifications and deadline reminders are enabled.'
                  : 'The reminder intent is saved with this profile for supported local notifications.',
                variant: 'success',
              });
              if (isNativeApp()) {
                void ensureNotificationPermission().then(granted => {
                  if (!granted) {
                    toast({
                      actionId: `money-reminder-permission:${editingItem?.id || 'new'}`,
                      title: 'Reminder permission is off',
                      description: 'The money item was saved, but this device will not show its reminder until notification permission is enabled.',
                      variant: 'warning',
                    });
                  }
                }).catch(() => {
                  toast({
                    actionId: `money-reminder-permission-error:${editingItem?.id || 'new'}`,
                    title: 'Reminder permission could not be checked',
                    description: 'The money item was saved. Check notification settings before relying on its reminder.',
                    variant: 'warning',
                  });
                });
              }
            } else if (reminderWasEnabled) {
              toast({
                actionId: `money-reminder-removed:${editingItem?.id || 'new'}`,
                title: 'Money reminder removed',
                description: 'No notification will be scheduled for this item.',
                variant: 'default',
              });
            }

            setCreatingDirection(null);
            setEditingItem(null);
          }}
        />
      )}

      {progressItem && (
        <RecordProgressModal
          hidden={hidden}
          item={progressItem}
          wallets={wallets}
          currency={currency}
          onClose={() => setProgressItem(null)}
          onConfirm={({ amount, adjustWallet }) => {
            const increment = Math.min(
              getUpcomingMoneyRemaining(progressItem),
              Math.max(0, amount),
            );
            if (increment <= 0) return;

            if (adjustWallet && progressItem.walletId) {
              const wallet = wallets.find(item => item.id === progressItem.walletId);
              if (!wallet) return false;
              if (wallet) {
                const transactionId = context.addTransaction({
                  type: progressItem.direction === 'outgoing' ? 'expense' : 'income',
                  amount: increment,
                  walletId: wallet.id,
                  date: progressItem.dueDate || new Date(),
                  notes: progressItem.title,
                  source: 'upcoming-money',
                  sourceKey: `upcoming-money:${progressItem.id}:${progressItem.recordedAmount + increment}`,
                });
                if (!transactionId) return false;
              }
            }

            const next = applyUpcomingMoneyProgress(progressItem, increment);
            context.updateUpcomingMoneyItem(progressItem.id, next);

            setProgressItem(null);
            return true;
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deletingItem)}
        title="Delete one-time money item?"
        message={
          deletingItem
            ? `Delete “${deletingItem.title}”? This removes its active and archived history.`
            : 'Delete this item?'
        }
        confirmText="Delete money item"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deletingItem) context.deleteUpcomingMoneyItem(deletingItem.id);
          setDeletingItem(null);
        }}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
}

function MoneyItemModal({
  item,
  initialDirection,
  wallets,
  hidden,
  currency,
  onClose,
  onSave,
}: {
  item: UpcomingMoneyItem | null;
  initialDirection: UpcomingMoneyDirection;
  wallets: WalletData[];
  hidden: boolean;
  currency?: CurrencyCode;
  onClose: () => void;
  onSave: (draft: MoneyDraft) => void;
}) {
  const modalPanelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const initialDraft = useMemo(
    () => createDraft(item || ({ direction: initialDirection } as UpcomingMoneyItem), moneyInputCurrency),
    [item, initialDirection, moneyInputCurrency],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [showDiscard, setShowDiscard] = useState(false);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: true, onClose });
  const initialSnapshot = useRef(JSON.stringify(initialDraft));
  const changed = JSON.stringify(draft) !== initialSnapshot.current;
  const reminderValidation = getReminderValidationMessage(draft);
  const [saveError, setSaveError] = useState('');
  const submittedRef = useRef(false);
  const baseCurrency = getBaseCurrency();
  const displayCurrency = moneyInputCurrency;

  const requestClose = () => {
    if (changed) {
      setShowDiscard(true);
      return;
    }
    close();
  };

  useOverlayLifecycle(true, requestClose, { containerRef: modalPanelRef });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1100] overflow-y-auto" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
        <button
          type="button"
          data-caizen-overlay-backdrop="true"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={requestClose}
          aria-label="Close one-time money editor"
        />
        <div className="relative flex min-h-full items-end justify-center p-2 sm:items-center sm:p-5">
          <section ref={modalPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-caizen-overlay-panel="true" className="balance-form @container/balance-form relative flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 p-5">
              <div>
                <h2 id={titleId} className="text-section-title">
                  {item ? 'Edit item' : 'Add item'}
                </h2>
                <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">One-time money</p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-5 @min-[30rem]/balance-form:grid-cols-2">
              <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
                <span className="text-label text-muted-foreground">
                  Name
                </span>
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={event =>
                    setDraft(current => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Father's mattress, Shopee refund…"
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Direction
                </span>
                <AndroidAdaptiveSelect
                  label="Money direction"
                  value={draft.direction}
                  onChange={value =>
                    setDraft(current => ({
                      ...current,
                      direction: value as UpcomingMoneyDirection,
                      reserveFunds:
                        value === 'outgoing' ? current.reserveFunds : false,
                    }))
                  }
                  options={[
                    { value: 'outgoing', label: 'To pay' },
                    { value: 'incoming', label: 'To receive' },
                  ]}
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Amount ({displayCurrency})
                </span>
                <MoneyInput
                  currency={displayCurrency}
                  type={hidden ? 'password' : 'number'}
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={event =>
                    setDraft(current => ({ ...current, amount: event.target.value }))
                  }
                />
                {!hidden && displayCurrency !== baseCurrency && Number(draft.amount) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Stored as {formatCurrency(convertMoneyInputToBase(draft.amount, moneyInputCurrency))}
                  </span>
                )}
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Due date
                </span>
                <AdaptiveDatePicker
                  label="Due date"
                  value={draft.dueDate}
                  onChange={value =>
                    setDraft(current => ({ ...current, dueDate: value }))
                  }
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Person or source
                </span>
                <Input
                  value={draft.person}
                  onChange={event =>
                    setDraft(current => ({ ...current, person: event.target.value }))
                  }
                  placeholder="Cousin, employer, Shopee…"
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Category
                </span>
                <Combobox
                  value={draft.category}
                  onChange={value =>
                    setDraft(current => ({
                      ...current,
                      category: value as UpcomingMoneyCategory,
                    }))
                  }
                  options={CATEGORY_OPTIONS}
                  ariaLabel="One-time money category"
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Linked wallet
                </span>
                <Combobox
                  value={draft.walletId || 'none'}
                  onChange={value =>
                    setDraft(current => ({
                      ...current,
                      walletId: value === 'none' ? '' : value,
                    }))
                  }
                  options={[
                    { value: 'none', label: 'No linked wallet' },
                    ...wallets.map(wallet => ({
                      value: wallet.id,
                      label: wallet.name,
                    })),
                  ]}
                  ariaLabel="Linked wallet"
                  className="control-input"
                />
              </label>

              {draft.direction === 'outgoing' && (
                <label className="flex items-start gap-3 min-w-0 px-1 py-2 @min-[30rem]/balance-form:col-span-2">
                  <Checkbox
                    checked={draft.reserveFunds}
                    onCheckedChange={checked =>
                      setDraft(current => ({
                        ...current,
                        reserveFunds: checked === true,
                      }))
                    }
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      Reserve this payment
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Include the unpaid amount in “Still to pay” and subtract it
                      from “Available after payments”. Your wallet balance stays unchanged.
                    </span>
                  </span>
                </label>
              )}

              <fieldset className="space-y-3 min-w-0 px-1 py-2 @min-[30rem]/balance-form:col-span-2">
                <legend className="px-1 text-label text-muted-foreground">
                  Manual reminder
                </legend>
                <label className="flex items-start gap-3">
                  <Checkbox
                    id="money-reminder-enabled"
                    checked={draft.reminderEnabled}
                    onCheckedChange={checked =>
                      setDraft(current => ({
                        ...current,
                        reminderEnabled: checked === true,
                      }))
                    }
                    aria-describedby="money-reminder-help"
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-bold">Remind me</span>
                    <span id="money-reminder-help" className="mt-1 block text-xs text-muted-foreground">
                      This creates one local notification only when you turn it on. Due dates, amounts, and planned status never create reminders automatically.
                    </span>
                  </span>
                </label>

                {draft.reminderEnabled && (
                  <div className="grid gap-3 @min-[30rem]/balance-form:grid-cols-2">
                    <div className="space-y-2">
                      <span className="text-label text-muted-foreground">
                        Reminder date
                      </span>
                      <AdaptiveDatePicker
                        id="money-reminder-date"
                        label="Reminder date"
                        value={draft.reminderDate}
                        onChange={value =>
                          setDraft(current => ({ ...current, reminderDate: value }))
                        }
                        required
                        ariaDescribedBy="money-reminder-validation"
                        className="control-input"
                      />
                    </div>
                    <label className="space-y-2">
                      <span className="text-label text-muted-foreground">
                        Reminder time
                      </span>
                      <CaizenTimePicker
                        label="Reminder time"
                        value={draft.reminderTime}
                        onChange={value =>
                          setDraft(current => ({ ...current, reminderTime: value }))
                        }
                        required
                        className="control-input"
                      />
                    </label>
                  </div>
                )}

                {reminderValidation && (
                  <p
                    id="money-reminder-validation"
                    role="alert"
                    aria-live="assertive"
                    className="text-sm font-semibold text-destructive"
                  >
                    {reminderValidation}
                  </p>
                )}
              </fieldset>

              <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
                <span className="text-label text-muted-foreground">
                  Notes
                </span>
                <Textarea
                  value={draft.notes}
                  onChange={event =>
                    setDraft(current => ({ ...current, notes: event.target.value }))
                  }
                  className="min-h-24 w-full rounded-2xl border border-border/55 bg-background/55 px-4 py-3 text-sm outline-none focus:border-primary/40"
                />
              </label>
            </div>

            {saveError ? <p className="shrink-0 px-5 py-2 text-sm text-destructive" role="alert">{saveError}</p> : null}
            <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/60 p-4 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end sm:px-5">
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!draft.title.trim() || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) <= 0 || Boolean(reminderValidation)}
                onClick={() => {
                  if (submittedRef.current) return;
                  const baseAmount = convertMoneyInputToBase(draft.amount, moneyInputCurrency);
                  if (baseAmount === undefined || baseAmount <= 0) {
                    setSaveError('Enter an amount of at least 0.01 in your base currency.');
                    return;
                  }
                  if (draft.dueDate && !parseLocalDateInputOrUndefined(draft.dueDate)) {
                    setSaveError('Choose a valid due date or clear the date.');
                    return;
                  }
                  if (draft.walletId && !wallets.some(wallet => wallet.id === draft.walletId)) {
                    setSaveError('Choose an available wallet or clear the wallet selection.');
                    return;
                  }
                  submittedRef.current = true;
                  try {
                    onSave({ ...draft, amount: String(baseAmount) });
                  } catch (error) {
                    submittedRef.current = false;
                    setSaveError(error instanceof Error ? error.message : 'The money item could not be saved. Your input is kept; review it and try again.');
                  }
                }}
              >
                Save item
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard one-time money changes?"
        message="Your unsaved changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={close}
        onCancel={() => setShowDiscard(false)}
      />
    </>,
    document.body,
  );
}

function RecordProgressModal({
  hidden,
  item,
  wallets,
  currency,
  onClose,
  onConfirm,
}: {
  hidden: boolean;
  item: UpcomingMoneyItem;
  wallets: WalletData[];
  currency?: CurrencyCode;
  onClose: () => void;
  onConfirm: (value: { amount: number; adjustWallet: boolean }) => void | boolean;
}) {
  const modalPanelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const remaining = getUpcomingMoneyRemaining(item);
  const wallet = wallets.find(walletItem => walletItem.id === item.walletId);
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const [amount, setAmount] = useState(
    formatMoneyInputValue(remaining, moneyInputCurrency),
  );
  const [adjustWallet, setAdjustWallet] = useState(Boolean(wallet));
  const [error, setError] = useState('');
  const submittedRef = useRef(false);
  const baseAmount = convertMoneyInputToBase(amount, moneyInputCurrency);
  const validAmount = baseAmount !== undefined && baseAmount > 0 && baseAmount <= remaining;
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: true, onClose });

  useOverlayLifecycle(true, close, { containerRef: modalPanelRef });

  return createPortal(
    <div className="fixed inset-0 z-[1150] overflow-y-auto" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <button
        type="button"
        data-caizen-overlay-backdrop="true"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
        aria-label="Close progress recorder"
      />
      <div className="relative flex min-h-full items-end justify-center p-2 sm:items-center sm:p-5">
        <section ref={modalPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-caizen-overlay-panel="true" className="balance-form @container/balance-form relative w-full max-w-lg rounded-[2rem] border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="mt-1 break-words text-section-title">{item.title}</h2>
              <p className="text-label text-muted-foreground">
                {item.direction === 'outgoing' ? 'Record payment' : 'Record receipt'}
              </p>
              <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                <MoneyValue value={remaining} hidden={hidden} /> remaining
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="mt-5 block space-y-2">
            <span className="text-label text-muted-foreground">
              {item.direction === 'outgoing' ? 'Amount paid' : 'Amount received'}
            </span>
            <MoneyInput
              currency={moneyInputCurrency}
              type={hidden ? 'password' : 'number'}
              min="0"
              max={formatMoneyInputValue(remaining, moneyInputCurrency)}
              step="0.01"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
          </label>

          {amount.trim() && !validAmount ? (
            <p className="mt-2 text-sm text-destructive" role="alert">Enter a positive amount up to the remaining balance, with at least 0.01 in your base currency.</p>
          ) : null}
          {wallet && (
            <label className="mt-4 flex items-start gap-3 min-w-0 px-1 py-2">
              <Checkbox
                checked={adjustWallet}
                onCheckedChange={checked => setAdjustWallet(checked === true)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Wallet className="h-4 w-4" /> Update {wallet.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.direction === 'outgoing' ? 'Subtract this amount from' : 'Add this amount to'} the linked wallet
                  and record a transaction. Turn this off if you already updated the balance.
                </span>
              </span>
            </label>
          )}

          {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-3 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!validAmount}
              onClick={() =>
                (() => {
                  if (submittedRef.current) return;
                  if (!validAmount || baseAmount === undefined) return;
                  if (adjustWallet && !wallet) {
                    setError('The linked wallet is no longer available. Close this form and review the money item.');
                    return;
                  }
                  submittedRef.current = true;
                  try {
                    const recorded = onConfirm({
                      amount: Math.min(remaining, Math.max(0, baseAmount)),
                      adjustWallet,
                    });
                    if (recorded === false) {
                      submittedRef.current = false;
                      setError('The payment could not be recorded. Review the wallet and amount, then try again.');
                    }
                  } catch {
                    submittedRef.current = false;
                    setError('The payment could not be recorded. Your input is kept; review the money item before retrying.');
                  }
                })()
              }
            >
              <Check className="mr-2 h-4 w-4" />
              {baseAmount !== undefined && baseAmount >= remaining
                ? item.direction === 'outgoing'
                  ? 'Mark paid'
                  : 'Mark received'
                : item.direction === 'outgoing' ? 'Record partial payment' : 'Record partial receipt'}
            </Button>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
