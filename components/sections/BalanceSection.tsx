'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  History,
  Link2,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCcw,
  Repeat,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

import UpcomingMoneyPanel from '@/components/balance/UpcomingMoneyPanel';
import WishlistSection from '@/components/sections/WishlistSection';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import WalletIdentity from '@/components/balance/WalletIdentity';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import BalanceCheckInModal from '@/components/modals/BalanceCheckInModal';
import TransactionModal from '@/components/balance/TransactionModal';
import { linkedRecordModuleLabel, navigateToLinkedRecord, resolveLinkedRecordName } from '@/lib/balance/linked-record';
import ConnectTransactionWalletModal from '@/components/balance/ConnectTransactionWalletModal';
import TransactionCsvImportModal from '@/components/balance/TransactionCsvImportModal';
import ReportsPanel from '@/components/balance/ReportsPanel';
import ReportExportModal from '@/components/balance/ReportExportModal';
import type { TransactionCsvImportSummary } from '@/lib/finance/transaction-csv-import';
import type { FinancialExportFormat } from '@/lib/finance/exports';
import {
  calculateBudgetMetrics,
  calculateBudgetSummary,
  getBudgetScopeKey,
  getBudgetScopeValidationError,
  materializeRecurringBudgetsForMonth,
  normalizeBudgets,
  shiftBudgetMonth,
} from '@/lib/finance/budgets';
import WalletModal from '@/components/modals/WalletModal';
import { CaizenBottomSheet } from '@/components/native/android-design';
import { ArrowFlyThrough, Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { FilterBar, FilterChip, SegmentedControl } from '@/components/ui/collection-controls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { MoneyInput } from '@/components/ui/money-input';
import { DatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { Combobox } from '@/components/ui/combobox';
import { SectionTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { MoneyMotionProvider, MonetaryNumber } from '@/components/ui/monetary-number';
import { cn } from '@/lib/utils';
import {
  getCurrentAllocation,
  getBalanceCheckInInputErrors,
  getMonthKey,
  getUnifiedPlanTotals,
  getWeekKey,
  normalizeBalanceProjectionRow,
  isReservedFinancialFallbackName,
  upsertCheckIn,
} from '@/lib/balance';
import { openTaxonomyHub } from '@/components/common/taxonomy-hub-events';
import { useAppContext } from '@/lib/context';
import { mediaStorage } from '@/lib/storage/media-storage';
import { scheduleMediaCleanup } from '@/lib/storage/media-cleanup';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import {
  filterTransactionsByHistoryScope,
  transactionMatchesListFilter,
  transactionMatchesReportingStatus,
  getTransactionCategoryLabel,
  getTransactionSignedAmount,
  groupTransactionsByLocalDate,
  paginateTransactionHistory,
  summarizeTransactionHistory,
  type TransactionHistoryScope,
  type TransactionListFilter,
  type TransactionReportingStatus,
} from '@/lib/transactions';
import { isValidLocalDateKey, parseLocalDateKey, toLocalDateKey } from '@/lib/date-utils';
import {
  BALANCE_VIEW_OPTIONS,
  buildBalanceViewHash,
  isMoneyView,
  parseBalanceViewHash,
  type MoneyView,
} from '@/lib/balance-navigation';
import type { ReportPeriod } from '@/lib/finance/reports';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  formatPHP,
  getCurrencySelectOptions,
  getEffectiveMoneyInputCurrency,
  refreshCurrencyRate,
  useCurrencyState,
} from '@/lib/currency';
import type {
  BalanceCheckIn,
  BalanceProjectionRow,
  Budget,
  CurrencyCode,
  FinancialCategory,
  Profile,
  Transaction,
  Wallet as WalletData,
  WalletType,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

interface BalanceSectionProps {
  onAddClick?: () => void;
  androidPresentation?: boolean;
  initialView?: MoneyView;
  onViewChange?: (view: MoneyView) => void;
  requestedView?: MoneyView;
  requestedViewSignal?: number;
  requestedFeature?: string;
  requestedRecordId?: string;
}

type ProjectionRow = BalanceProjectionRow;

type BalanceViewHistoryMode = 'push' | 'replace' | 'silent';

type ProjectionDraft = {
  label: string;
  type: ProjectionRow['type'];
  amount: string;
  dueDay: string;
  active: boolean;
};

type BalanceAction = {
  label: string;
  description?: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type BalanceActionSheetState = {
  title: string;
  description?: string;
  actions: BalanceAction[];
};

function AndroidBalanceActionSheet({
  state,
  onClose,
}: {
  state: BalanceActionSheetState | null;
  onClose: () => void;
}) {
  if (!state) return null;

  return (
    <CaizenBottomSheet
      open
      title={state.title}
      description={state.description}
      onClose={onClose}
    >
      <div className="android-balance-action-list">
        {state.actions.map(action => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            className={cn('android-balance-action', action.destructive && 'android-balance-action-destructive')}
            onClick={() => {
              if (action.disabled) return;
              onClose();
              action.onSelect();
            }}
          >
            {action.icon}
            <span className="min-w-0 text-left">
              <strong className="block truncate">{action.label}</strong>
              {action.description ? <small className="mt-0.5 block text-xs font-medium text-muted-foreground">{action.description}</small> : null}
            </span>
          </button>
        ))}
      </div>
    </CaizenBottomSheet>
  );
}

const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  cash_on_hand: 'Cash on hand',
  free_spending: 'Free spending',
  savings: 'Savings',
  investment: 'Investment',
};

const UNCATEGORIZED_CATEGORY_FILTER = '__uncategorized__';
const MONEY_PRIVACY_EVENT = 'caizen:money-privacy-change';
const TRANSACTION_SCOPE_OPTIONS: Array<{ value: TransactionHistoryScope; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'range', label: 'Date range' },
  { value: 'all', label: 'All' },
];
const TRANSACTION_REPORTING_STATUS_OPTIONS: Array<{ value: TransactionReportingStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'included', label: 'Included in reports' },
  { value: 'excluded', label: 'Excluded from reports' },
];

function subscribeToMoneyPrivacy(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(MONEY_PRIVACY_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(MONEY_PRIVACY_EVENT, onStoreChange);
  };
}

function getServerMoneyPrivacySnapshot() {
  return false;
}

function getWalletType(wallet: WalletData): WalletType {
  return wallet.type || 'free_spending';
}

function isProtectedWallet(wallet: WalletData) {
  if (wallet.isProtected !== undefined) return wallet.isProtected;
  return ['savings', 'investment'].includes(getWalletType(wallet));
}

function isSpendableWallet(wallet: WalletData) {
  if (wallet.includeInSpendable !== undefined) {
    return wallet.includeInSpendable;
  }
  return ['free_spending', 'cash_on_hand'].includes(getWalletType(wallet));
}

function projectionRemovedFromForecast(row: ProjectionRow, monthKey: string) {
  const amount = toNumber(row.amount);
  return amount > 0 && getCurrentAllocation(row, monthKey) >= amount;
}

function writeBalanceViewHistory(
  view: MoneyView,
  mode: BalanceViewHistoryMode,
  androidPresentation: boolean,
) {
  if (
    mode === 'silent' ||
    androidPresentation ||
    typeof window === 'undefined'
  ) {
    return;
  }

  const nextHash = buildBalanceViewHash(view);
  if (window.location.hash === nextHash) return;

  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', nextUrl);
  } else {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

function createProjectionRow(type: ProjectionRow['type']): ProjectionRow {
  return {
    id: `budget-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: '',
    amount: '',
    allocated: '',
    type,
    dueDay: undefined,
    active: true,
    cycleKey: getMonthKey(),
  };
}

function toNumber(value: string | number | undefined | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function shiftTransactionScopeAnchor(anchorDateKey: string, scope: Exclude<TransactionHistoryScope, 'range' | 'all'>, delta: number) {
  const date = parseLocalDateKey(anchorDateKey) || new Date();
  if (scope === 'day') date.setDate(date.getDate() + delta);
  if (scope === 'month') date.setMonth(date.getMonth() + delta, 1);
  if (scope === 'year') date.setFullYear(date.getFullYear() + delta, 0, 1);
  return toLocalDateKey(date);
}

function transactionScopeIsCurrent(scope: TransactionHistoryScope, anchorDateKey: string) {
  const today = toLocalDateKey();
  if (scope === 'day') return anchorDateKey === today;
  if (scope === 'month') return anchorDateKey.slice(0, 7) === today.slice(0, 7);
  if (scope === 'year') return anchorDateKey.slice(0, 4) === today.slice(0, 4);
  return false;
}

function formatRelativeDate(value?: Date | string | null) {
  if (!value) return 'No snapshot yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Snapshot date unavailable';

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  if (days < 14) return 'Updated 1 week ago';
  return `Updated ${Math.floor(days / 7)} weeks ago`;
}

function formatDueDay(value?: number) {
  if (!value) return 'No due day';
  return `Due on day ${value}`;
}

function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`section-surface @container min-w-0 ${className}`}
    >
      {children}
    </section>
  );
}

// Restrained semantic coloring for money values: green reads as incoming/
// positive, red as outgoing/still owed, blue matches the existing
// "Protected" wallet accent. Applied only to the number itself, never to
// whole cards, so the UI stays calm and readable.
type MoneyTone = 'positive' | 'destructive' | 'protected';

const MONEY_TONE_CLASSES: Record<MoneyTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-300',
  destructive: 'text-destructive',
  protected: 'text-blue-700 dark:text-blue-300',
};

function MoneyValue({
  value,
  hidden,
  className = '',
  tone,
  animate = false,
}: {
  value: number;
  hidden: boolean;
  className?: string;
  tone?: MoneyTone;
  animate?: boolean;
}) {
  return (
    <span className={cn('min-w-0 break-words tabular-nums', !hidden && tone && MONEY_TONE_CLASSES[tone], className)}>
      {animate ? <MonetaryNumber formatted={hidden ? '' : formatPHP(value)} hidden={hidden} /> : hidden ? '••••••' : formatPHP(value)}
    </span>
  );
}

function SummaryValue({
  label,
  value,
  detail,
  hidden,
  emphasis = false,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  hidden: boolean;
  emphasis?: boolean;
  tone?: MoneyTone;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl p-3 sm:p-4 ${
        emphasis
          ? 'border border-primary/30 bg-primary/[0.08]'
          : 'bg-transparent'
      }`}
    >
      <p
        className={`text-label ${
          emphasis ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {label}
      </p>
      <span className={cn(!hidden && tone && MONEY_TONE_CLASSES[tone], 'mt-2 block break-words text-xl font-bold tabular-nums sm:text-2xl')}>
        <MonetaryNumber formatted={hidden ? '' : formatPHP(value)} hidden={hidden} />
      </span>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function WalletCard({
  wallet,
  profileId,
  hidden,
  menuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
  androidPresentation,
  onOpenActions,
}: {
  wallet: WalletData;
  profileId?: string;
  hidden: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  androidPresentation: boolean;
  onOpenActions: () => void;
}) {
  const protectedWallet = isProtectedWallet(wallet);
  const spendableWallet = isSpendableWallet(wallet);

  return (
    <article
      className="motion-pop @container/wallet relative min-w-0 rounded-2xl border border-border/55 bg-background/45 p-4 transition-colors hover:border-primary/25 hover:bg-background/65"
    >
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit wallet ${wallet.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="sr-only">Edit wallet {wallet.name}</span>
      </button>
      <div className="relative z-10 pointer-events-none grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-3 @min-[26rem]/wallet:flex">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border/45 bg-card"
          style={{ color: wallet.color || undefined }}
        >
          <WalletIdentity wallet={wallet} profileId={profileId} size="md" />
        </span>

        <div className="contents @min-[26rem]/wallet:block @min-[26rem]/wallet:min-w-0 @min-[26rem]/wallet:flex-1">
          <div className="contents @min-[26rem]/wallet:flex @min-[26rem]/wallet:items-start @min-[26rem]/wallet:gap-3 @min-[26rem]/wallet:justify-between">
            <div className="min-w-0 @min-[26rem]/wallet:flex-1">
              <h3 className="break-words text-card-title">{wallet.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {WALLET_TYPE_LABELS[getWalletType(wallet)]}
                {wallet.purpose ? ` · ${wallet.purpose}` : ''}
              </p>
            </div>

            <div className="col-span-2 flex w-full min-w-0 items-start justify-between gap-2 @min-[26rem]/wallet:w-auto">
              <MoneyValue
                value={toNumber(wallet.balance)}
                hidden={hidden}
                className="text-right text-lg font-bold"
              />
              <div className="relative pointer-events-auto" data-balance-menu>
                {androidPresentation ? (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onOpenActions();
                    }}
                    className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Actions for ${wallet.name}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                ) : (
                  <DropdownMenu
                    open={menuOpen}
                    onOpenChange={open => {
                      if (open !== menuOpen) onToggleMenu();
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={event => event.stopPropagation()}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${wallet.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem onSelect={onEdit}>
                        <RefreshCcw className="h-4 w-4" /> Edit wallet
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-2 flex flex-wrap gap-1.5 @min-[26rem]/wallet:mt-3">
            {spendableWallet && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                Available money
              </span>
            )}
            {protectedWallet && (
              <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                Protected
              </span>
            )}
          </div>

        </div>
      </div>
    </article>
  );
}

function ProjectionRowCard({
  row,
  monthKey,
  hidden,
  menuOpen,
  onToggleMenu,
  onToggleHandled,
  onEdit,
  onDelete,
  onConvert,
  androidPresentation,
  onOpenActions,
}: {
  row: ProjectionRow;
  monthKey: string;
  hidden: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onToggleHandled: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvert?: () => void;
  androidPresentation: boolean;
  onOpenActions: () => void;
}) {
  const amount = toNumber(row.amount);
  const allocated = getCurrentAllocation(row, monthKey);
  const removedFromForecast = projectionRemovedFromForecast(row, monthKey);
  const isIncome = row.type === 'income';

  return (
    <article
      className={`@container/forecast min-w-0 rounded-2xl border border-border/55 bg-background/45 p-4 ${
        row.active === false ? 'opacity-55' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${
            isIncome
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          }`}
        >
          {isIncome ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <CalendarDays className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-start gap-3 @min-[26rem]/forecast:flex-row @min-[26rem]/forecast:justify-between">
            <div className="min-w-0">
              <h3 className="break-words text-card-title">
                {row.label || (isIncome ? 'Untitled income' : 'Untitled cost')}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Monthly forecast estimate · {formatDueDay(row.dueDay)}
                {row.active === false ? ' · Paused' : ''}
              </p>
            </div>

            <div className="flex w-full min-w-0 items-start justify-between gap-2 @min-[26rem]/forecast:w-auto">
              <MoneyValue
                value={amount}
                hidden={hidden}
                className="font-bold"
              />
              <div className="relative" data-balance-menu>
                {androidPresentation ? (
                  <button
                    type="button"
                    onClick={onOpenActions}
                    className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Actions for ${row.label || 'forecast item'}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                ) : (
                  <DropdownMenu
                    open={menuOpen}
                    onOpenChange={open => {
                      if (open !== menuOpen) onToggleMenu();
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${row.label || 'forecast item'}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem onSelect={onEdit}>Edit details</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                      {onConvert ? <DropdownMenuItem onSelect={onConvert}>Convert to recurring</DropdownMenuItem> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col items-start justify-between gap-3 @min-[30rem]/forecast:flex-row @min-[30rem]/forecast:items-center">
            <p className="text-xs text-muted-foreground">
              {removedFromForecast
                  ? "Removed from this month's forecast"
                : allocated > 0
                  ? `${Math.round((allocated / Math.max(1, amount)) * 100)}% removed from this month's forecast`
                  : "Included in this month's forecast"}
            </p>
            {!androidPresentation ? (
              <button
                type="button"
                disabled={row.active === false || amount <= 0}
                onClick={onToggleHandled}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 @min-[30rem]/forecast:w-auto ${
                  removedFromForecast
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-border/60 bg-card hover:border-primary/30 hover:text-primary'
                }`}
              >
                {removedFromForecast && <Check className="h-3.5 w-3.5" />}
                {removedFromForecast
                  ? "Restore to this month's forecast"
                  : "Remove from this month's forecast"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProjectionItemModal({
  row,
  hideBalances,
  currency,
  androidPresentation,
  onSave,
  onClose,
}: {
  row: ProjectionRow;
  hideBalances: boolean;
  currency: CurrencyCode;
  androidPresentation: boolean;
  onSave: (row: ProjectionRow) => void;
  onClose: () => void;
}) {
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const initialDraft = useMemo<ProjectionDraft>(
    () => ({
      label: row.label || '',
      type: row.type,
      amount: formatMoneyInputValue(
        row.amount !== undefined && row.amount !== null && row.amount !== ''
          ? Number(row.amount)
          : undefined,
        moneyInputCurrency,
      ),
      dueDay: row.dueDay ? String(row.dueDay) : '',
      active: row.active !== false,
    }),
    [row, moneyInputCurrency],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [saveError, setSaveError] = useState('');
  const submittedRef = useRef(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const modalPanelRef = useRef<HTMLElement | null>(null);
  const initialSnapshot = useRef(JSON.stringify(initialDraft));
  const changed = JSON.stringify(draft) !== initialSnapshot.current;
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: true, onClose });

  const save = () => {
    if (submittedRef.current) return;
    const baseAmount = convertMoneyInputToBase(draft.amount, moneyInputCurrency);
    if (!draft.label.trim() || baseAmount === undefined || baseAmount <= 0) {
      setSaveError('Enter a name and an amount of at least 0.01 in your base currency.');
      return;
    }
    const dueDay = draft.dueDay.trim() ? Number(draft.dueDay) : undefined;
    if (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
      setSaveError('Enter a whole-number due day from 1 to 31 or leave it blank.');
      return;
    }
    submittedRef.current = true;
    try {
      onSave({
        ...row,
        label: draft.label.trim(),
        type: draft.type,
        amount: String(Math.max(0, baseAmount)),
        dueDay,
        active: draft.active,
        allocated: row.allocated || '',
        cycleKey: row.cycleKey || getMonthKey(),
      });
    } catch {
      submittedRef.current = false;
      setSaveError('The forecast item could not be saved. Your input is kept; review it and try again.');
    }
  };

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
      <div className={cn('fixed inset-0 z-[1050] overflow-y-auto', androidPresentation && 'android-balance-modal-root')} data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
        <button
          type="button"
          data-caizen-overlay-backdrop="true"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={requestClose}
          aria-label="Close forecast item editor"
        />
        <div className="relative flex min-h-full items-end justify-center p-2 sm:items-center sm:p-5">
          <section
            ref={modalPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forecast-item-modal-title"
            aria-describedby="forecast-item-modal-description"
            data-caizen-overlay-panel="true"
            className={cn('balance-form @container/balance-form relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl', androidPresentation && 'android-balance-modal-panel')}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id="forecast-item-modal-title" className="text-section-title">
                  {row.label ? 'Edit forecast item' : 'Add forecast item'}
                </h2>
                <p id="forecast-item-modal-description" className="mt-1 text-sm text-muted-foreground">
                  This is an estimate for planning only. It changes the forecast and does not record an actual transaction.
                </p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4 @min-[30rem]/balance-form:grid-cols-2 sm:p-5">
              <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
                <span className="text-label text-muted-foreground">
                  Name
                </span>
                <input
                  autoFocus
                  value={draft.label}
                  onChange={event =>
                    setDraft(current => ({ ...current, label: event.target.value }))
                  }
                  placeholder={
                    draft.type === 'income'
                      ? 'Salary, regular freelance income…'
                      : 'Internet, food budget, electricity…'
                  }
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Type
                </span>
                <Combobox
                  value={draft.type}
                  onChange={value =>
                    setDraft(current => ({
                      ...current,
                      type: value as ProjectionRow['type'],
                    }))
                  }
                  options={[
                    { value: 'income', label: 'Monthly income estimate' },
                    { value: 'expense', label: 'Monthly cost estimate' },
                  ]}
                  ariaLabel="Monthly forecast item type"
                  className="control-input"
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Amount
                </span>
                <MoneyInput
                  currency={moneyInputCurrency}
                  type={hideBalances ? 'password' : 'number'}
                  inputMode="decimal"
                  autoComplete="off"
                  min="0"
                  step="0.01"
                  value={draft.amount}
                  onChange={event =>
                    setDraft(current => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>

              <label className="space-y-2">
                <span className="text-label text-muted-foreground">
                  Due day (1–31, optional)
                </span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={draft.dueDay}
                  onChange={event =>
                    setDraft(current => ({ ...current, dueDay: event.target.value }))
                  }
                  placeholder="Optional"
                  className="control-input"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-border/55 bg-background/45 p-4">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-bold">Active</span>
                  <span className="text-xs text-muted-foreground">
                    Paused items do not affect totals.
                  </span>
                </span>
              </label>
            </div>

            {saveError ? <p className="px-5 py-2 text-sm text-destructive" role="alert">{saveError}</p> : null}
            <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/60 p-4 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end sm:px-5">
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!draft.label.trim() || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) <= 0}
                onClick={save}
              >
                Save forecast item
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard forecast changes?"
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

type BudgetModalProps = {
  budget: Budget | null;
  selectedMonth: string;
  categories: FinancialCategory[];
  budgets: Budget[];
  hideBalances: boolean;
  currency: CurrencyCode;
  androidPresentation: boolean;
  onSave: (budget: Budget) => boolean;
  onClose: () => void;
};

function BudgetModal({
  budget,
  selectedMonth,
  categories,
  budgets,
  hideBalances,
  currency,
  androidPresentation,
  onSave,
  onClose,
}: BudgetModalProps) {
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const initialAllocated = formatMoneyInputValue(budget?.allocated, moneyInputCurrency);
  const [month, setMonth] = useState(budget?.month || selectedMonth);
  const [categoryId, setCategoryId] = useState(budget?.categoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(budget?.subcategoryId || '');
  const [allocated, setAllocated] = useState(initialAllocated);
  const [recurring, setRecurring] = useState(budget?.recurring === true);
  const [error, setError] = useState('');
  const submittedRef = useRef(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const initialSnapshot = useRef(JSON.stringify({
    month: budget?.month || selectedMonth,
    categoryId: budget?.categoryId || '',
    subcategoryId: budget?.subcategoryId || '',
    allocated: initialAllocated,
    recurring: budget?.recurring === true,
  }));
  const selectedCategory = categories.find(category => category.id === categoryId);
  const subcategories = selectedCategory?.subcategories || [];
  const validationError = getBudgetScopeValidationError(
    {
      month,
      categoryId,
      subcategoryId: subcategoryId || undefined,
      allocated: Number(allocated),
    },
    categories,
    budgets,
    budget?.id,
  );
  const changed = JSON.stringify({ month, categoryId, subcategoryId, allocated, recurring }) !== initialSnapshot.current;
  const canClose = () => {
    if (changed) {
      setShowDiscard(true);
      return false;
    }
    return true;
  };

  const errorMessage = (value: ReturnType<typeof getBudgetScopeValidationError>) => {
    switch (value) {
      case 'invalid-month': return 'Choose a valid month.';
      case 'invalid-allocation': return 'Enter an allocation greater than zero.';
      case 'missing-category': return 'Choose an expense category.';
      case 'income-category': return 'Budgets can only use expense categories.';
      case 'missing-subcategory': return 'Choose a valid subcategory.';
      case 'duplicate': return 'A budget already exists for this month and scope.';
      case 'overlapping-category-scope': return 'Use either a category budget or subcategory budgets for this month, not both.';
      default: return '';
    }
  };

  const save = () => {
    if (submittedRef.current) return;
    const message = errorMessage(validationError);
    if (message) {
      setError(message);
      return;
    }
    const baseAllocated = convertMoneyInputToBase(allocated, moneyInputCurrency);
    if (baseAllocated === undefined || baseAllocated <= 0) {
      setError('Enter an allocation of at least 0.01 in your base currency.');
      return;
    }
    const now = new Date();
    submittedRef.current = true;
    try {
      const saved = onSave({
        id: budget?.id || `budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        month,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        allocated: baseAllocated,
        recurring,
        createdAt: budget?.createdAt || now,
        updatedAt: now,
      });
      if (!saved) {
        submittedRef.current = false;
        setError('The budget changed before it could be saved. Review it, then try again.');
      }
    } catch {
      submittedRef.current = false;
      setError('The budget could not be saved. Your input is kept; review it and try again.');
    }
  };

  return (
    <>
      <CaizenFormDialog
        title={budget ? 'Edit budget' : 'Add budget'}
        description="Monthly spending allocation"
        onClose={onClose}
        onBeforeClose={canClose}
        maxWidthClass="max-w-lg"
        panelClassName={cn('balance-form @container/balance-form', androidPresentation && 'android-balance-modal-panel')}
        footer={(
          <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
            <Button type="button" variant="outline" onClick={() => { if (canClose()) onClose(); }}>Cancel</Button>
            <Button type="button" onClick={save}>Save budget</Button>
          </div>
        )}
      >
      <div className="space-y-4 p-1">
        <label className="block space-y-2">
          <span className="text-label text-muted-foreground">Month</span>
          <DatePicker
            label="Month"
            value={month ? `${month}-01` : ''}
            onChange={value => setMonth(value.slice(0, 7))}
            placeholder="Choose a month"
            monthOnly
          />
        </label>

        <AndroidAdaptiveSelect
          label="Expense category"
          value={categoryId}
          onChange={value => {
            setCategoryId(value);
            setSubcategoryId('');
            setError('');
          }}
          options={[
            { value: '', label: 'Choose an expense category' },
            ...categories
              .filter(category => category.type === 'expense')
              .map(category => ({
                value: category.id,
                label: category.name,
                icon: <CategoryIcon iconId={category.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
              })),
          ]}
          searchable={categories.length > 8}
        />

        <AndroidAdaptiveSelect
          label="Subcategory (optional)"
          value={subcategoryId}
          onChange={value => {
            setSubcategoryId(value);
            setError('');
          }}
          disabled={!selectedCategory || subcategories.length === 0}
          options={[
            { value: '', label: selectedCategory ? 'Entire category' : 'Choose a category first' },
            ...subcategories.map(subcategory => ({
              value: subcategory.id,
              label: subcategory.name,
              icon: <CategoryIcon iconId={subcategory.icon || selectedCategory?.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
            })),
          ]}
        />

        <label className="block space-y-2">
          <span className="text-label text-muted-foreground">Allocation</span>
          <MoneyInput
            currency={moneyInputCurrency}
            type={hideBalances ? 'password' : 'number'}
            inputMode="decimal"
            autoComplete="off"
            min="0"
            step="0.01"
            value={allocated}
            onChange={event => {
              setAllocated(event.target.value);
              setError('');
            }}
            aria-label="Budget allocation"
          />
        </label>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/55 bg-background/45 p-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Repeats monthly</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Carries this allocation into future months until turned off.</p>
          </div>
          <Switch checked={recurring} onCheckedChange={setRecurring} aria-label="Repeats monthly" />
        </div>

        {error ? <p className="text-xs font-semibold text-destructive" role="alert">{error}</p> : null}

      </div>
      </CaizenFormDialog>
      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard budget changes?"
        message="Your unsaved budget changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setShowDiscard(false);
          onClose();
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </>
  );
}

export default function BalanceSection({
  androidPresentation = false,
  initialView = 'overview',
  onViewChange,
  requestedView,
  requestedViewSignal = 0,
  requestedFeature,
  requestedRecordId,
}: BalanceSectionProps) {
  const context = useAppContext();
  const {
    wallets = [],
    transactions = [],
    upcomingMoneyItems = [],
    addWallet,
    deleteWallet,
    updateWallet,
    addTransaction,
    updateTransaction,
    connectTransactionWallet,
    deleteTransaction,
    deleteTransactions,
    clearTransactions,
    updateTransactionReportingStatus,
    reconcileWalletBalances,
    updateProfile,
    profiles,
    currentProfileId,
  } = context;

  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const baseCurrency =
    currentProfile?.baseCurrency || currentProfile?.currency || 'PHP';
  const displayCurrency = currentProfile?.currency || baseCurrency;
  const currencyState = useCurrencyState();

  const [activeView, setActiveView] = useState<MoneyView>(initialView);
  const pendingTabScrollRef = useRef<{ view: MoneyView; left: number; top: number } | null>(null);
  const moneyEntryId = useId();
  const [planSurface, setPlanSurface] = useState<'forecast' | 'budgets'>('forecast');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [resumeCheckInAfterWallet, setResumeCheckInAfterWallet] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isTransactionCsvImportOpen, setIsTransactionCsvImportOpen] = useState(false);
  const [exportRequest, setExportRequest] = useState<{
    format: FinancialExportFormat;
    period: ReportPeriod;
    allowAll: boolean;
  } | null>(null);
  const [isClearTransactionsOpen, setIsClearTransactionsOpen] = useState(false);
  const [isSelectingTransactions, setIsSelectingTransactions] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [connectingTransactionId, setConnectingTransactionId] = useState<string | null>(null);
  const [transactionInitialType, setTransactionInitialType] = useState<'income' | 'expense' | 'transfer' | 'adjustment'>('expense');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<TransactionListFilter>('all');
  const [transactionScope, setTransactionScope] = useState<TransactionHistoryScope>('day');
  const [selectedTransactionDate, setSelectedTransactionDate] = useState(() => toLocalDateKey());
  const [transactionRangeStart, setTransactionRangeStart] = useState(() => {
    const today = toLocalDateKey();
    const date = parseLocalDateKey(today) || new Date();
    return toLocalDateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  });
  const [transactionRangeEnd, setTransactionRangeEnd] = useState(() => {
    const today = toLocalDateKey();
    const date = parseLocalDateKey(today) || new Date();
    return toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  });
  const [transactionRangeError, setTransactionRangeError] = useState('');
  const [transactionReportingStatus, setTransactionReportingStatus] = useState<TransactionReportingStatus>('all');
  const [transactionFiltersOpen, setTransactionFiltersOpen] = useState(false);
  const [transactionHistoryPage, setTransactionHistoryPage] = useState(1);
  const [transactionHistoryPageSize, setTransactionHistoryPageSize] = useState(50);
  const [transactionWalletFilter, setTransactionWalletFilter] = useState('all');
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState('all');
  const [transactionSubcategoryFilter, setTransactionSubcategoryFilter] = useState('all');
  const [projectionEditorRow, setProjectionEditorRow] = useState<ProjectionRow | null>(null);
  const [projectionRowToDelete, setProjectionRowToDelete] = useState<ProjectionRow | null>(null);
  const [budgetMonth, setBudgetMonth] = useState(getMonthKey());
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [balanceActionSheet, setBalanceActionSheet] = useState<BalanceActionSheetState | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const moneyPrivacyKey = `money-hide-balances-${currentProfileId}`;
  const getMoneyPrivacySnapshot = useCallback(
    () => {
      if (typeof window === 'undefined') return false;
      try {
        return window.localStorage.getItem(moneyPrivacyKey) === 'true';
      } catch {
        return false;
      }
    },
    [moneyPrivacyKey],
  );
  const hideBalances = useSyncExternalStore(
    subscribeToMoneyPrivacy,
    getMoneyPrivacySnapshot,
    getServerMoneyPrivacySnapshot,
  );
  const [currencyChanging, setCurrencyChanging] = useState(false);
  const previousDisplayCurrencyRef = useRef(displayCurrency);
  const [projectionRows, setProjectionRows] = useState<ProjectionRow[]>(
    currentProfile?.balanceProjectionRows || [],
  );

  const selectView = useCallback((view: MoneyView, historyMode: BalanceViewHistoryMode = 'push', preserveTabScroll = false) => {
    pendingTabScrollRef.current = preserveTabScroll && !androidPresentation
      ? { view, left: window.scrollX, top: window.scrollY }
      : null;
    setActiveView(view);
    onViewChange?.(view);
    writeBalanceViewHistory(view, historyMode, androidPresentation);
  }, [androidPresentation, onViewChange]);

  useLayoutEffect(() => {
    const scroll = pendingTabScrollRef.current;
    if (!scroll || scroll.view !== activeView) return;
    // Radix swaps panel presence during layout effects. Restore after the new
    // content has committed, when its height can support the captured offset.
    const frame = window.requestAnimationFrame(() => {
      if (pendingTabScrollRef.current !== scroll) return;
      pendingTabScrollRef.current = null;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      try {
        window.scrollTo({ left: scroll.left, top: scroll.top, behavior: 'auto' });
      } finally {
        root.style.scrollBehavior = previousBehavior;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

  useEffect(() => {
    const hashView =
      !androidPresentation && typeof window !== 'undefined'
        ? parseBalanceViewHash(window.location.hash)
        : null;
    const nextView = hashView || initialView;

    if (pendingTabScrollRef.current?.view !== nextView) pendingTabScrollRef.current = null;
    setActiveView(nextView);
    onViewChange?.(nextView);
    if (!hashView) {
      writeBalanceViewHistory(nextView, 'replace', androidPresentation);
    }
  }, [androidPresentation, initialView, onViewChange]);

  useEffect(() => {
    if (androidPresentation || typeof window === 'undefined') return;

    const syncViewFromLocation = () => {
      pendingTabScrollRef.current = null;
      const nextView = parseBalanceViewHash(window.location.hash);
      if (!nextView) return;
      setActiveView(nextView);
      onViewChange?.(nextView);
    };

    window.addEventListener('hashchange', syncViewFromLocation);
    window.addEventListener('popstate', syncViewFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncViewFromLocation);
      window.removeEventListener('popstate', syncViewFromLocation);
    };
  }, [androidPresentation, onViewChange]);

  useEffect(() => {
    if (!requestedViewSignal || !requestedView) return;
    selectView(requestedView, 'replace');
  }, [requestedView, requestedViewSignal, selectView]);

  useEffect(() => {
    if (!requestedViewSignal || !requestedFeature) return;
    if (requestedFeature === 'add-wallet') {
      selectView('wallets', 'replace');
      setEditingWalletId(null);
      setIsWalletModalOpen(true);
      return;
    }
    if (requestedFeature === 'wallet' && requestedRecordId) {
      const wallet = wallets.find(item => item.id === requestedRecordId);
      if (wallet) {
        selectView('wallets', 'replace');
        setEditingWalletId(wallet.id);
        setIsWalletModalOpen(true);
      }
      return;
    }
    if (requestedFeature === 'add-plan' || requestedFeature === 'plan-item') {
      selectView('plans', 'replace');
      return;
    }
    if (requestedFeature === 'money-item') {
      selectView('plan', 'replace');
      return;
    }
    if (requestedFeature === 'new-expense') {
      selectView('transactions', 'replace');
      setTransactionInitialType('expense');
      setEditingTransactionId(null);
      setIsTransactionModalOpen(true);
      return;
    }
    // Reverse navigation from a linked record's "Transaction" tag opens the
    // existing transaction here, reusing the same edit flow as clicking it
    // directly in the list.
    if (requestedFeature === 'transaction' && requestedRecordId) {
      const target = (transactions as Transaction[]).find(item => item.id === requestedRecordId);
      if (target) {
        selectView('transactions', 'replace');
        setEditingTransactionId(target.id);
        setTransactionInitialType(target.type);
        setIsTransactionModalOpen(true);
      }
      return;
    }
  }, [requestedFeature, requestedRecordId, requestedViewSignal, selectView, transactions, wallets]);

  useEffect(() => {
    if (previousDisplayCurrencyRef.current === displayCurrency) return;
    previousDisplayCurrencyRef.current = displayCurrency;
    setCurrencyChanging(true);
    const timer = window.setTimeout(() => setCurrencyChanging(false), 360);
    return () => window.clearTimeout(timer);
  }, [displayCurrency]);

  useEffect(() => {
    setProjectionRows(currentProfile?.balanceProjectionRows || []);
  }, [currentProfileId, currentProfile?.balanceProjectionRows]);

  const monthKey = getMonthKey();
  const weekKey = getWeekKey();
  const monthLabel = new Date().toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const checkIns: BalanceCheckIn[] = currentProfile?.balanceCheckIns || [];
  const currentCheckIn = checkIns.find(item => item.weekKey === weekKey);
  const latestCheckIn = [...checkIns].sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  )[0];
  const snapshotLabel = formatRelativeDate(latestCheckIn?.completedAt);

  const planTotals = useMemo(
    () =>
      getUnifiedPlanTotals(
        wallets as WalletData[],
        projectionRows,
        upcomingMoneyItems,
        monthKey,
      ),
    [wallets, projectionRows, upcomingMoneyItems, monthKey],
  );

  const activeRows = projectionRows.filter(row => row.active !== false && !row.recurrence);
  const incomeRows = activeRows.filter(row => row.type === 'income');
  const expenseRows = activeRows.filter(row => row.type === 'expense');
  const sortedWallets = [...(wallets as WalletData[])].sort(
    (a, b) => toNumber(b.balance) - toNumber(a.balance),
  );
  const profileCategories = currentProfile?.financialCategories;
  const categories: FinancialCategory[] = useMemo(
    () => profileCategories || [],
    [profileCategories],
  );
  const walletById = useMemo(
    () => new Map((wallets as WalletData[]).map(wallet => [wallet.id, wallet])),
    [wallets],
  );
  const categoryById = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories],
  );
  const searchableTransactionTextById = useMemo(() => {
    const index = new Map<string, string>();
    (transactions as Transaction[]).forEach(transaction => {
      const category = categoryById.get(transaction.categoryId || '');
      const subcategory = category?.subcategories.find(item => item.id === transaction.subcategoryId);
      const categoryText = [category?.name, subcategory?.name].filter(Boolean).join(' ');
      const routeText = transaction.type === 'transfer'
        ? [walletById.get(transaction.walletId)?.name, walletById.get(transaction.destinationWalletId || '')?.name].filter(Boolean).join(' ')
        : walletById.get(transaction.walletId)?.name || '';
      index.set(transaction.id, [
        transaction.notes,
        transaction.payee,
        categoryText,
        routeText,
      ].filter(Boolean).join(' ').toLocaleLowerCase());
    });
    return index;
  }, [transactions, categoryById, walletById]);
  const budgets = useMemo(() => currentProfile?.budgets || [], [currentProfile?.budgets]);
  const budgetMonthLabel = (parseLocalDateKey(`${budgetMonth}-01`) || new Date()).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const visibleBudgets = useMemo(
    () => budgets
      .filter(budget => budget.month === budgetMonth)
      .map(budget => calculateBudgetMetrics(budget, transactions as Transaction[])),
    [budgets, budgetMonth, transactions],
  );
  const budgetSummary = useMemo(
    () => calculateBudgetSummary(budgets, transactions as Transaction[], budgetMonth),
    [budgets, transactions, budgetMonth],
  );
  const transactionCategoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All categories', icon: <CategoryIcon iconId="folder" size="xs" containerClassName="h-6 w-6 rounded-md" /> },
      { value: UNCATEGORIZED_CATEGORY_FILTER, label: 'Uncategorized', icon: <CategoryIcon iconId="folder" size="xs" containerClassName="h-6 w-6 rounded-md" /> },
      ...categories
        .filter(category => category.name.trim())
        .map(category => ({
          value: category.id,
          label: isReservedFinancialFallbackName(category.name) ? 'Uncategorized (saved category)' : category.name,
          icon: <CategoryIcon iconId={category.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
        })),
    ],
    [categories],
  );
  const selectedTransactionFilterCategory = categories.find(
    category => category.id === transactionCategoryFilter,
  );
  const transactionSubcategoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All subcategories' },
      ...(selectedTransactionFilterCategory?.subcategories || [])
        .filter(subcategory => subcategory.name.trim())
        .map(subcategory => ({
          value: subcategory.id,
          label: subcategory.name,
          icon: <CategoryIcon categoryIconId={selectedTransactionFilterCategory?.icon} subcategoryIconId={subcategory.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
        })),
    ],
    [selectedTransactionFilterCategory],
  );

  useEffect(() => {
    if (
      transactionCategoryFilter !== 'all' &&
      transactionCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER &&
      !transactionCategoryFilterOptions.some(option => option.value === transactionCategoryFilter)
    ) {
      setTransactionCategoryFilter('all');
    }
  }, [transactionCategoryFilter, transactionCategoryFilterOptions]);

  useEffect(() => {
    if (!transactionSubcategoryFilterOptions.some(option => option.value === transactionSubcategoryFilter)) {
      setTransactionSubcategoryFilter('all');
    }
  }, [transactionSubcategoryFilter, transactionSubcategoryFilterOptions]);

  const transactionYearOptions = useMemo(() => {
    const currentYear = Number(toLocalDateKey().slice(0, 4));
    const selectedYear = Number(selectedTransactionDate.slice(0, 4));
    const years = new Set<number>([currentYear - 10, currentYear + 1, selectedYear]);
    (transactions as Transaction[]).forEach(transaction => {
      const year = Number(toLocalDateKey(transaction.date).slice(0, 4));
      if (Number.isFinite(year) && year > 0) years.add(year);
    });
    return [...years]
      .sort((left, right) => right - left)
      .map(year => ({ value: String(year), label: String(year) }));
  }, [transactions, selectedTransactionDate]);

  const transactionScopeRows = useMemo(
    () => filterTransactionsByHistoryScope(
      transactions as Transaction[],
      transactionScope,
      selectedTransactionDate,
      { startDateKey: transactionRangeStart, endDateKey: transactionRangeEnd },
    ),
    [transactions, transactionScope, selectedTransactionDate, transactionRangeStart, transactionRangeEnd],
  );
  const transactionRows = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    return [...transactionScopeRows]
      .filter(transaction => transactionMatchesListFilter(transaction, transactionTypeFilter))
      .filter(transaction => transactionMatchesReportingStatus(transaction, transactionReportingStatus))
      .filter(transaction => transactionWalletFilter === 'all' || transaction.walletId === transactionWalletFilter || transaction.destinationWalletId === transactionWalletFilter)
      .filter(transaction => {
        if (transactionCategoryFilter === 'all') return true;
        if (transactionCategoryFilter === UNCATEGORIZED_CATEGORY_FILTER) return !transaction.categoryId;
        return transaction.categoryId === transactionCategoryFilter;
      })
      .filter(transaction => transactionSubcategoryFilter === 'all' || transaction.subcategoryId === transactionSubcategoryFilter)
      .filter(transaction => {
        if (!query) return true;
        return searchableTransactionTextById.get(transaction.id)?.includes(query) || false;
      })
      .sort((a, b) => {
        const dateDifference = new Date(b.date).getTime() - new Date(a.date).getTime();
        return dateDifference || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [transactionScopeRows, transactionSearch, transactionTypeFilter, transactionReportingStatus, transactionWalletFilter, transactionCategoryFilter, transactionSubcategoryFilter, searchableTransactionTextById]);
  const uncategorizedTransactionCount = useMemo(
    () => (transactions as Transaction[]).filter(transaction =>
      (transaction.type === 'income' || transaction.type === 'expense') && !transaction.categoryId,
    ).length,
    [transactions],
  );
  const transactionPage = useMemo(
    () => paginateTransactionHistory(transactionRows, transactionHistoryPage, transactionHistoryPageSize),
    [transactionRows, transactionHistoryPage, transactionHistoryPageSize],
  );
  useEffect(() => {
    if (transactionHistoryPage !== transactionPage.page) setTransactionHistoryPage(transactionPage.page);
  }, [transactionHistoryPage, transactionPage.page]);
  useEffect(() => {
    setTransactionHistoryPage(1);
    setSelectedTransactionIds(new Set());
  }, [transactionScope, selectedTransactionDate, transactionRangeStart, transactionRangeEnd, transactionSearch, transactionTypeFilter, transactionReportingStatus, transactionWalletFilter, transactionCategoryFilter, transactionSubcategoryFilter, transactionHistoryPageSize]);
  const transactionHistorySummary = useMemo(
    () => summarizeTransactionHistory(transactionRows),
    [transactionRows],
  );
  const transactionHistoryGroups = useMemo(
    () => groupTransactionsByLocalDate(transactionRows),
    [transactionRows],
  );
  const transactionHistoryGroupByDate = useMemo(
    () => new Map(transactionHistoryGroups.map(group => [group.dateKey, group])),
    [transactionHistoryGroups],
  );
  const transactionPageGroups = useMemo(
    () => groupTransactionsByLocalDate(transactionPage.items),
    [transactionPage.items],
  );
  const selectedTransactionCount = selectedTransactionIds.size;
  const selectedReportingTransactions = transactionRows.filter(transaction =>
    selectedTransactionIds.has(transaction.id) &&
    (transaction.type === 'income' || transaction.type === 'expense'),
  );
  const includedSelectedCount = selectedReportingTransactions.filter(transaction => !transaction.excludeFromReports).length;
  const excludedSelectedCount = selectedReportingTransactions.filter(transaction => transaction.excludeFromReports).length;
  const protectedWallets = sortedWallets.filter(isProtectedWallet);
  const editingWallet = editingWalletId
    ? sortedWallets.find(wallet => wallet.id === editingWalletId) || null
    : null;

  const persistProjection = (nextRows: ProjectionRow[]) => {
    if (!currentProfile) return;
    const normalizedRows = nextRows.map((row, index) =>
      normalizeBalanceProjectionRow(row, row.id || `projection-${index}`),
    );
    setProjectionRows(normalizedRows);
    updateProfile(currentProfile.id, { balanceProjectionRows: normalizedRows });
  };

  const saveProjectionRow = (savedRow: ProjectionRow) => {
    const exists = projectionRows.some(row => row.id === savedRow.id);
    const nextRows = exists
      ? projectionRows.map(row => (row.id === savedRow.id ? savedRow : row))
      : [...projectionRows, savedRow];
    persistProjection(nextRows);

    setProjectionEditorRow(null);
  };

  const persistBudgets = (nextBudgets: Budget[]) => {
    if (!currentProfile) return;
    const normalized = normalizeBudgets(nextBudgets, categories);
    updateProfile(currentProfile.id, { budgets: normalized });
  };

  const saveBudget = (savedBudget: Budget) => {
    const validationError = getBudgetScopeValidationError(
      savedBudget,
      categories,
      budgets,
      savedBudget.id,
    );
    if (validationError || !currentProfile) return false;
    const exists = budgets.some(item => item.id === savedBudget.id);
    persistBudgets(
      exists
        ? budgets.map(item => item.id === savedBudget.id ? savedBudget : item)
        : [...budgets, savedBudget],
    );
    setIsBudgetModalOpen(false);
    setEditingBudgetId(null);
    return true;
  };

  const skippedRecurringBudgetScopes = currentProfile?.skippedRecurringBudgetScopes || [];
  const skippedRecurringBudgetScopesKey = skippedRecurringBudgetScopes.join('|');

  useEffect(() => {
    const materialized = materializeRecurringBudgetsForMonth(
      budgets,
      budgetMonth,
      new Date(),
      new Set(skippedRecurringBudgetScopes),
    );
    if (materialized !== budgets) persistBudgets(materialized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, budgetMonth, skippedRecurringBudgetScopesKey]);

  const editingTransaction = editingTransactionId
    ? (transactions as Transaction[]).find(item => item.id === editingTransactionId) || null
    : null;
  const connectingTransaction = connectingTransactionId
    ? (transactions as Transaction[]).find(item => item.id === connectingTransactionId) || null
    : null;

  const openNewTransaction = (type: 'income' | 'expense' | 'transfer' | 'adjustment') => {
    setTransactionInitialType(type);
    setEditingTransactionId(null);
    setIsTransactionModalOpen(true);
  };

  const showBalanceActionSheet = (state: BalanceActionSheetState) => {
    setOpenMenuId(null);
    setBalanceActionSheet(state);
  };

  const openTransactionTools = () => {
    showBalanceActionSheet({
      title: 'Transaction actions',
      description: 'Manage the current transaction history',
      actions: [
        {
          label: 'Select transactions',
          icon: <Check className="size-5 shrink-0" aria-hidden="true" />,
          disabled: !transactionRows.length,
          onSelect: () => setIsSelectingTransactions(true),
        },
        {
          label: 'Manage categories',
          icon: <SlidersHorizontal className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: () => openTaxonomyHub({ area: 'money', panel: 'categories' }),
        },
        {
          label: 'Import transactions',
          icon: <Download className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: () => setIsTransactionCsvImportOpen(true),
        },
        {
          label: 'Export transactions',
          icon: <Download className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: () => setExportRequest({ format: 'csv', period: { kind: 'month', anchorDateKey: toLocalDateKey() }, allowAll: true }),
        },
        {
          label: 'Clear transaction history…',
          icon: <Trash2 className="size-5 shrink-0" aria-hidden="true" />,
          destructive: true,
          disabled: !transactions.length,
          onSelect: () => setIsClearTransactionsOpen(true),
        },
      ],
    });
  };

  const openTransactionActions = (transaction: Transaction, rowLabel: string) => {
    const openEditor = () => {
      setEditingTransactionId(transaction.id);
      setTransactionInitialType(transaction.type);
      setIsTransactionModalOpen(true);
    };
    showBalanceActionSheet({
      title: rowLabel,
      description: 'Transaction actions',
      actions: [
        {
          label: 'Edit',
          icon: <Pencil className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: openEditor,
        },
        ...((transaction.type === 'income' || transaction.type === 'expense') && !transaction.categoryId ? [{
          label: 'Categorize',
          icon: <SlidersHorizontal className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: openEditor,
        }] : []),
        ...(transaction.type !== 'transfer' && !transaction.walletId ? [{
          label: 'Connect wallet',
          icon: <Wallet className="size-5 shrink-0" aria-hidden="true" />,
          onSelect: () => setConnectingTransactionId(transaction.id),
        }] : []),
        {
          label: 'Delete',
          icon: <Trash2 className="size-5 shrink-0" aria-hidden="true" />,
          destructive: true,
          onSelect: () => setDeletingTransactionId(transaction.id),
        },
      ],
    });
  };

  const saveTransaction = (draft: Parameters<typeof addTransaction>[0]) => {
    let saved = true;
    if (draft.id) {
      saved = updateTransaction(draft.id, draft);
    } else {
      saved = Boolean(addTransaction(draft));
    }
    if (!saved) return false;
    setIsTransactionModalOpen(false);
    setEditingTransactionId(null);
    return true;
  };

  const toggleProjectionHandled = (row: ProjectionRow) => {
    const amount = toNumber(row.amount);
    const removedFromForecast = amount > 0 && getCurrentAllocation(row, monthKey) >= amount;
    persistProjection(
      projectionRows.map(item =>
        item.id === row.id
          ? {
              ...item,
              allocated: removedFromForecast ? '0' : String(amount),
              cycleKey: monthKey,
            }
          : item,
      ),
    );
  };

  const completeBalanceRefresh = (payload: {
    walletBalances: Record<string, string>;
    openingWalletBalances: Record<string, number>;
  }) => {
    if (!currentProfile) return false;
    const inputErrors = getBalanceCheckInInputErrors(wallets as WalletData[], payload.walletBalances);
    if (Object.keys(inputErrors).length > 0) {
      toast({
        title: 'Balance check-in not saved',
        description: 'Enter a valid current balance for every wallet before saving.',
        variant: 'destructive',
      });
      return false;
    }

    const nextWallets = (wallets as WalletData[]).map(wallet => ({
      ...wallet,
      balance: toNumber(payload.walletBalances[wallet.id]),
    }));
    const reconciled = reconcileWalletBalances(
      Object.fromEntries(nextWallets.map(wallet => [wallet.id, wallet.balance])),
      {
        notes: 'Balance check-in reconciliation',
        source: 'balance-check-in',
        sourceKeyPrefix: `balance-check-in:${currentProfileId}:${weekKey}`,
        expectedWalletBalances: payload.openingWalletBalances,
      },
    );
    if (!reconciled) {
      toast({
        title: 'Balance check-in not saved',
        description: 'A wallet changed while this check-in was open. Review the current balances, then close and reopen the check-in before saving.',
        variant: 'destructive',
      });
      return false;
    }
    const nextPlanTotals = getUnifiedPlanTotals(
      nextWallets,
      projectionRows,
      upcomingMoneyItems,
      monthKey,
    );
    const snapshot: BalanceCheckIn = {
      id: currentCheckIn?.id || `balance-check-in-${Date.now()}`,
      weekKey,
      completedAt: new Date(),
      walletBalances: nextWallets.map(wallet => ({
        walletId: wallet.id,
        name: wallet.name,
        balance: wallet.balance,
      })),
      totalWalletBalance: nextPlanTotals.totalWalletBalance,
      spendableBalance: nextPlanTotals.spendableBalance,
      protectedBalance: nextPlanTotals.protectedBalance,
      remainingCommitments: nextPlanTotals.stillToPay,
      safeToSpend: nextPlanTotals.availableAfterPlans,
    };

    updateProfile(currentProfile.id, { balanceCheckIns: upsertCheckIn(checkIns, snapshot) });
    setIsCheckInOpen(false);
    return true;
  };

  const openAddWallet = () => {
    setEditingWalletId(null);
    setIsWalletModalOpen(true);
  };

  const togglePrivacy = () => {
    const next = !hideBalances;
    try {
      localStorage.setItem(moneyPrivacyKey, String(next));
      window.dispatchEvent(new Event(MONEY_PRIVACY_EVENT));
    } catch {
      toast({
        title: 'Privacy setting unavailable',
        description: 'This browser did not allow the balance visibility preference to be saved.',
        variant: 'destructive',
      });
    }
  };

  const currencyDetail = (() => {
    if (baseCurrency === displayCurrency) {
      return `Saved and displayed in ${baseCurrency}.`;
    }
    if (currencyState.status === 'loading') {
      return `Loading ${baseCurrency} → ${displayCurrency} conversion…`;
    }
    if (currencyState.status === 'error') {
      return `Conversion unavailable. Amounts remain safely stored in ${baseCurrency}.`;
    }

    const rateText = `1 ${baseCurrency} = ${currencyState.rate.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })} ${displayCurrency}`;
    return currencyState.status === 'stale'
      ? `${rateText} · using cached rate`
      : `${rateText}${currencyState.rateDate ? ` · ${currencyState.rateDate}` : ''}`;
  })();

  const renderPlanList = (
    title: string,
    description: string,
    rows: ProjectionRow[],
    type: ProjectionRow['type'],
  ) => (
    <Surface className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-section-title">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setProjectionEditorRow(createProjectionRow(type))}
        >
          <Plus className="mr-2 h-4 w-4" /> Add estimate
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-5 text-sm text-muted-foreground">
            No monthly {type === 'income' ? 'income' : 'cost'} estimates yet. Add an estimate to include it in your forecast.
          </p>
        ) : (
          rows.map(row => (
            <ProjectionRowCard
              key={row.id}
              row={row}
              monthKey={monthKey}
              hidden={hideBalances}
              androidPresentation={Boolean(androidPresentation)}
              onOpenActions={() => {
                setOpenMenuId(null);
                setBalanceActionSheet({
                  title: row.label || 'Forecast item',
                  description: 'Forecast actions',
                  actions: [
                    {
                      label: 'Edit details',
                      icon: <Pencil className="size-5 shrink-0" aria-hidden="true" />,
                      onSelect: () => setProjectionEditorRow(row),
                    },
                    {
                      label: projectionRemovedFromForecast(row, monthKey) ? "Restore to this month's forecast" : "Remove from this month's forecast",
                      description: row.active === false || toNumber(row.amount) <= 0 ? 'Unavailable while this item is paused or has no amount.' : undefined,
                      icon: <CalendarDays className="size-5 shrink-0" aria-hidden="true" />,
                      disabled: row.active === false || toNumber(row.amount) <= 0,
                      onSelect: () => toggleProjectionHandled(row),
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 className="size-5 shrink-0" aria-hidden="true" />,
                      destructive: true,
                      onSelect: () => setProjectionRowToDelete(row),
                    },
                  ],
                });
              }}
              menuOpen={openMenuId === `budget-${row.id}`}
              onToggleMenu={() =>
                setOpenMenuId(current =>
                  current === `budget-${row.id}` ? null : `budget-${row.id}`,
                )
              }
              onToggleHandled={() => toggleProjectionHandled(row)}
              onEdit={() => {
                setOpenMenuId(null);
                setProjectionEditorRow(row);
              }}
              onDelete={() => {
                setOpenMenuId(null);
                setProjectionRowToDelete(row);
              }}
            />
          ))
        )}
      </div>
    </Surface>
  );

  const renderOverview = () => wallets.length === 0 ? (
    <Surface className="p-5 sm:p-6">
      <h2 className="text-section-title">Start with a wallet</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Add where you keep your money and its current balance. Caizen will show what remains after upcoming payments.
      </p>
      <Button type="button" onClick={openAddWallet} className="mt-4">
        <Plus className="mr-2 h-4 w-4" /> Add wallet
      </Button>
    </Surface>
  ) : (
    <div className="space-y-4">
      <Surface className="overflow-hidden p-5 sm:p-6">
        <div className="grid min-w-0 gap-6 @min-[56rem]:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] @min-[56rem]:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                {snapshotLabel}
              </span>
              {planTotals.oneTime.overdueCount > 0 && (
                <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-600 dark:text-red-300">
                  {planTotals.oneTime.overdueCount} overdue
                </span>
              )}
            </div>

            <p className="mt-5 text-sm font-semibold text-muted-foreground">
              Available after payments
            </p>
            <MoneyValue
              value={planTotals.availableAfterPlans}
              animate
              hidden={hideBalances}
              tone={planTotals.availableAfterPlans >= 0 ? 'positive' : 'destructive'}
              className="mt-1 block text-4xl font-bold tracking-tight sm:text-5xl"
            />
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Your available money after recurring costs and reserved one-time
              payments. Expected income is shown separately until it is received.
            </p>
          </div>

          <div className="grid min-w-0 gap-x-4 gap-y-2 border-t border-border/55 pt-4 @min-[28rem]:grid-cols-2 @min-[56rem]:border-t-0 @min-[56rem]:border-l @min-[56rem]:pt-0 @min-[56rem]:pl-4">
            <SummaryValue
              label="Available now"
              value={planTotals.availableNow}
              detail="Wallets marked as available money"
              hidden={hideBalances}
              tone="positive"
            />
            <SummaryValue
              label="Still to pay"
              value={planTotals.stillToPay}
              detail="Monthly costs and reserved payments"
              hidden={hideBalances}
              tone="destructive"
            />
            <SummaryValue
              label="Expected later"
              value={planTotals.expectedLater}
              detail="Not spendable yet"
              hidden={hideBalances}
              tone="positive"
            />
            <SummaryValue
              label="Protected"
              value={planTotals.protectedBalance}
              detail="Savings and investments"
              hidden={hideBalances}
              tone="protected"
            />
          </div>
        </div>

        <details className="group mt-5 rounded-2xl border border-border/55 bg-background/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold">
            Show full breakdown
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-border/55 p-4 sm:grid-cols-2">
            <BreakdownRow
              label="Recurring costs left"
              value={planTotals.recurringStillToPay}
              hidden={hideBalances}
              negative
            />
            <BreakdownRow
              label="One-time payments reserved"
              value={planTotals.oneTimeStillToPay}
              hidden={hideBalances}
              negative
            />
            <BreakdownRow
              label="Recurring income expected"
              value={planTotals.recurringExpectedLater}
              hidden={hideBalances}
              positive
            />
            <BreakdownRow
              label="One-time money expected"
              value={planTotals.oneTimeExpectedLater}
              hidden={hideBalances}
              positive
            />
            <BreakdownRow
              label="Projected after incoming"
              value={planTotals.projectedAfterIncoming}
              hidden={hideBalances}
              strong
            />
            <BreakdownRow
              label="All wallet balances"
              value={planTotals.totalWalletBalance}
              hidden={hideBalances}
            />
          </div>
        </details>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-section-title">Wallets</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {wallets.length} wallet{wallets.length === 1 ? '' : 's'} ·{' '}
                {snapshotLabel}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectView('wallets')}
              className="min-h-11"
            >
              View all
            </Button>
          </div>
          <div className="mt-4 divide-y divide-border/50">
            {sortedWallets.length === 0 ? (
              <button
                type="button"
                onClick={openAddWallet}
                className="w-full rounded-2xl border border-dashed border-border/60 bg-background/35 p-5 text-left text-sm text-muted-foreground"
              >
                 Add a wallet to see your available money here.
              </button>
            ) : (
              sortedWallets.slice(0, 4).map(wallet => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => {
                    setEditingWalletId(wallet.id);
                    setIsWalletModalOpen(true);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring first:pt-0 last:pb-0"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: wallet.color }}
                  />
                  <OverflowTooltip text={wallet.name}><span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {wallet.name}
                  </span></OverflowTooltip>
                  <MoneyValue
                    value={toNumber(wallet.balance)}
                    hidden={hideBalances}
                    className="min-w-0 break-words text-right text-sm font-bold tabular-nums"
                  />
                </button>
              ))
            )}
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-section-title">{monthLabel} cash flow</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Recurring and one-time money in one place.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => selectView('plan')}
              className="min-h-11"
            >
              View cash flow
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryValue
              label="Recurring costs"
              value={planTotals.recurringStillToPay}
              detail={`${expenseRows.length} active`}
              hidden={hideBalances}
              tone="destructive"
            />
            <SummaryValue
              label="One-time costs"
              value={planTotals.oneTimeStillToPay}
              detail={`${planTotals.oneTime.outgoing.length} active`}
              hidden={hideBalances}
              tone="destructive"
            />
            <SummaryValue
              label="Recurring income"
              value={planTotals.recurringExpectedLater}
              detail={`${incomeRows.length} active`}
              hidden={hideBalances}
              tone="positive"
            />
            <SummaryValue
              label="One-time incoming"
              value={planTotals.oneTimeExpectedLater}
              detail={`${planTotals.oneTime.incoming.length} active`}
              hidden={hideBalances}
              tone="positive"
            />
          </div>
        </Surface>
      </div>

      <Surface className="p-5">
        <button
          type="button"
          onClick={() => setShowHistory(current => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showHistory}
          aria-controls="balance-history-content"
        >
          <span>
            <span className="flex items-center gap-2 font-bold">
              <History className="h-4 w-4 text-muted-foreground" /> Balance history
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {checkIns.length} snapshot{checkIns.length === 1 ? '' : 's'}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
          />
        </button>
        {showHistory && (
          <div id="balance-history-content" className="mt-4 space-y-2 border-t border-border/55 pt-4">
            {checkIns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Run a balance check-in to save your first balance snapshot.
              </p>
            ) : (
              [...checkIns]
                .sort(
                  (a, b) =>
                    new Date(b.completedAt).getTime() -
                    new Date(a.completedAt).getTime(),
                )
                .slice(0, 8)
                .map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/55 bg-background/40 px-4 py-3"
                  >
                    <span>
                      <span className="block text-sm font-bold">
                        {new Date(item.completedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Available after payments
                      </span>
                    </span>
                    <MoneyValue
                      value={item.safeToSpend}
                      hidden={hideBalances}
                      tone={item.safeToSpend >= 0 ? 'positive' : 'destructive'}
                      className="font-bold"
                    />
                  </div>
                ))
            )}
          </div>
        )}
      </Surface>
    </div>
  );

  const renderTransactions = () => {
    const walletName = (id?: string) => id ? walletById.get(id)?.name || 'Unknown wallet' : 'Wallet not connected';
    const historySummary = transactionHistorySummary;
    const fullHistoryGroupByDate = transactionHistoryGroupByDate;
    const historyGroups = transactionPageGroups;
    const activeTransactionFilterCount = [
      transactionTypeFilter !== 'all',
      transactionWalletFilter !== 'all',
      transactionCategoryFilter !== 'all',
      transactionSubcategoryFilter !== 'all',
      transactionReportingStatus !== 'all',
    ].filter(Boolean).length;
    const hasActiveFilters = Boolean(
      transactionSearch.trim() ||
      transactionTypeFilter !== 'all' ||
      transactionReportingStatus !== 'all' ||
      transactionWalletFilter !== 'all' ||
      transactionCategoryFilter !== 'all' ||
      transactionSubcategoryFilter !== 'all',
    );
    const clearFilters = () => {
      setTransactionSearch('');
      setTransactionTypeFilter('all');
      setTransactionReportingStatus('all');
      setTransactionWalletFilter('all');
      setTransactionCategoryFilter('all');
      setTransactionSubcategoryFilter('all');
    };
    const transactionTypeOptions = [
      { value: 'all', label: 'All' },
      { value: 'income', label: 'Income' },
      { value: 'expense', label: 'Expense' },
    ];
    const transactionWalletOptions = [
      { value: 'all', label: 'All wallets' },
      ...wallets.map(wallet => ({
        value: wallet.id,
        label: wallet.name,
        icon: <WalletIdentity wallet={wallet} profileId={currentProfileId} size="xs" />,
      })),
    ];
    const transactionFilterFields = (
      <div className="grid gap-2">
        <AndroidAdaptiveSelect label="Filter transactions by type" value={transactionTypeFilter} onChange={value => setTransactionTypeFilter(value as TransactionListFilter)} options={transactionTypeOptions} className="control-input" />
        <AndroidAdaptiveSelect label="Filter transactions by wallet" value={transactionWalletFilter} onChange={setTransactionWalletFilter} options={transactionWalletOptions} searchable={wallets.length > 8} className="control-input" />
        <AndroidAdaptiveSelect label="Filter transactions by category" value={transactionCategoryFilter} onChange={value => { setTransactionCategoryFilter(value); setTransactionSubcategoryFilter('all'); }} options={transactionCategoryFilterOptions} searchable={transactionCategoryFilterOptions.length > 8} className="control-input" />
        {selectedTransactionFilterCategory ? <AndroidAdaptiveSelect label="Filter transactions by subcategory" value={transactionSubcategoryFilter} onChange={setTransactionSubcategoryFilter} options={transactionSubcategoryFilterOptions} searchable={transactionSubcategoryFilterOptions.length > 8} disabled={transactionSubcategoryFilterOptions.length <= 1} className="control-input" /> : null}
        <AndroidAdaptiveSelect label="Reporting status" value={transactionReportingStatus} onChange={value => setTransactionReportingStatus(value as TransactionReportingStatus)} options={TRANSACTION_REPORTING_STATUS_OPTIONS} className="control-input" />
      </div>
    );
    const toggleTransactionSelection = (id: string) => {
      setSelectedTransactionIds(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
    const selectAllShown = () => {
      setSelectedTransactionIds(current => {
        const next = new Set(current);
        transactionRows.forEach(transaction => next.add(transaction.id));
        return next;
      });
    };
    const updateSelectedReportingStatus = (excluded: boolean) => {
      const changedCount = updateTransactionReportingStatus([...selectedTransactionIds], excluded);
      setSelectedTransactionIds(new Set());
      toast({
        actionId: `finance-transactions-reporting-status:${currentProfileId}:${excluded ? 'exclude' : 'include'}:${Date.now()}`,
        title: excluded ? 'Selected transactions excluded from reports' : 'Selected transactions included in reports',
        description: `${changedCount.toLocaleString()} transaction${changedCount === 1 ? '' : 's'} updated. Wallet balances were unchanged.`,
        variant: 'success',
      });
    };
    const exitSelectionMode = () => {
      setSelectedTransactionIds(new Set());
      setIsSelectingTransactions(false);
    };
    const formatSignedMoney = (value: number) => {
      if (hideBalances) return '••••••';
      if (value === 0) return formatPHP(0);
      return `${value > 0 ? '+' : '−'}${formatPHP(Math.abs(value))}`;
    };
    const formatHistoryDate = (dateKey: string) => {
      const date = parseLocalDateKey(dateKey);
      if (!date) return { day: dateKey.slice(-2), weekday: 'Date', monthYear: '' };
      return {
        day: String(date.getDate()),
        weekday: date.toLocaleDateString(undefined, { weekday: 'long' }),
        monthYear: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      };
    };
    const renderSummaryValue = (label: string, value: number, tone: MoneyTone, detail: string) => (
      <div className="min-w-0 px-1 py-2">
        <p className="text-label text-muted-foreground">{label}</p>
        <span className={cn('mt-2 block break-words text-xl font-bold tabular-nums', !hideBalances && MONEY_TONE_CLASSES[tone])}>
          <MonetaryNumber formatted={hideBalances ? '' : label === 'Expense' ? formatSignedMoney(-value) : formatSignedMoney(value)} hidden={hideBalances} revision={`${transactionScope}:${selectedTransactionDate}:${transactionRangeStart}:${transactionRangeEnd}`} />
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    );

    return (
      <div className="space-y-4">
        <Surface className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-section-title">Transactions</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Record actual money movement. Upcoming plans remain separate until you record them.</p>
            </div>
            {isSelectingTransactions ? (
              <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="Selected transaction actions">
                <span className="mr-1 text-sm font-bold" aria-live="polite">{selectedTransactionCount.toLocaleString()} selected</span>
                <Button type="button" size="sm" variant="outline" onClick={selectAllShown} disabled={!transactionRows.length || selectedTransactionCount === transactionRows.length}>Select all shown</Button>
                {includedSelectedCount > 0 ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => updateSelectedReportingStatus(true)} aria-label="Exclude selected from reports">
                    Exclude from reports
                  </Button>
                ) : null}
                {excludedSelectedCount > 0 ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => updateSelectedReportingStatus(false)} aria-label="Include selected in reports">
                    Include in reports
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="destructive" onClick={() => setIsBulkDeleteOpen(true)} disabled={!selectedTransactionCount} aria-label="Delete selected transactions">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={exitSelectionMode} aria-label="Exit selection mode">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" onClick={() => openNewTransaction('expense')} disabled={!wallets.length}><Plus className="mr-2 h-4 w-4" /> Add transaction</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => openNewTransaction('transfer')} disabled={wallets.length < 2}>Transfer</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => openNewTransaction('adjustment')} disabled={!wallets.length}>Adjust balance</Button>
                {androidPresentation ? (
                  <Button type="button" size="sm" variant="outline" aria-label="More transaction actions" onClick={openTransactionTools}>
                    More
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" variant="outline" aria-label="More transaction actions">
                        More
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
                      <DropdownMenuItem onSelect={() => setIsSelectingTransactions(true)} disabled={!transactionRows.length}>
                        <Check className="h-4 w-4" /> Select transactions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openTaxonomyHub({ area: 'money', panel: 'categories' })}>Manage categories</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setIsTransactionCsvImportOpen(true)}>Import transactions</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setExportRequest({ format: 'csv', period: { kind: 'month', anchorDateKey: toLocalDateKey() }, allowAll: true })}>
                        <Download className="h-4 w-4" /> Export transactions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setIsClearTransactionsOpen(true)} disabled={!transactions.length}>
                        <Trash2 className="h-4 w-4" /> Clear transaction history…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>

          {!isSelectingTransactions && uncategorizedTransactionCount > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-border/40 pt-2">
              {uncategorizedTransactionCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs font-bold"
                  onClick={() => {
                    setTransactionCategoryFilter(UNCATEGORIZED_CATEGORY_FILTER);
                    setTransactionSubcategoryFilter('all');
                  }}
                >
                  Uncategorized · {uncategorizedTransactionCount.toLocaleString()}
                </Button>
              ) : null}
            </div>
          ) : null}

        </Surface>

        <div className="grid gap-4">
          <Surface className="p-5">
            <div className="@container/transaction-toolbar">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchField
                  wrapperClassName="min-w-0 flex-1 sm:max-w-lg"
                  className="combobox-trigger-transparent"
                  value={transactionSearch}
                  onChange={setTransactionSearch}
                  placeholder="Search transactions"
                  aria-label="Search transactions"
                />
                {androidPresentation ? <Button type="button" size="sm" variant={activeTransactionFilterCount ? 'secondary' : 'outline'} aria-expanded={transactionFiltersOpen} aria-haspopup="dialog" onClick={() => setTransactionFiltersOpen(true)}><SlidersHorizontal className="mr-2 h-4 w-4" />Filters{activeTransactionFilterCount ? ` · ${activeTransactionFilterCount}` : ''}</Button> : null}
                {!androidPresentation ? <Popover open={transactionFiltersOpen} onOpenChange={setTransactionFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant={activeTransactionFilterCount ? 'secondary' : 'outline'} aria-expanded={transactionFiltersOpen} aria-haspopup="dialog">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Filters{activeTransactionFilterCount ? ` · ${activeTransactionFilterCount}` : ''}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={8} className="w-[min(26rem,calc(100vw-1rem))] rounded-2xl border-border/60 bg-background p-3 shadow-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2">
                      <div>
                        <p className="text-sm font-bold">Filter transactions</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Narrow the selected period.</p>
                      </div>
                      {activeTransactionFilterCount ? (
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={clearFilters}>Clear</Button>
                      ) : null}
                    </div>
                    <div className="mt-3">{transactionFilterFields}</div>
                  </PopoverContent>
                </Popover> : null}
                {androidPresentation ? <CaizenBottomSheet open={transactionFiltersOpen} title="Filter transactions" description="Narrow the selected period." onClose={() => setTransactionFiltersOpen(false)}>
                  <div className="space-y-3 pb-2">
                    {transactionFilterFields}
                    <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                      <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
                      <Button type="button" onClick={() => setTransactionFiltersOpen(false)}>Apply</Button>
                    </div>
                  </div>
                </CaizenBottomSheet> : null}
              </div>
              {hasActiveFilters ? (
                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active transaction filters">
                  {transactionSearch.trim() ? <FilterChip selected className="max-w-full" aria-label="Clear transaction search" onSelectedChange={() => setTransactionSearch('')}><span className="min-w-0 truncate">Search: {transactionSearch}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" /></FilterChip> : null}
                  {transactionTypeFilter !== 'all' ? <FilterChip selected aria-label="Remove transaction type filter" onSelectedChange={() => setTransactionTypeFilter('all')}>{transactionTypeOptions.find(option => option.value === transactionTypeFilter)?.label} <X className="h-3 w-3" aria-hidden="true" /></FilterChip> : null}
                  {transactionWalletFilter !== 'all' ? <FilterChip selected className="max-w-full" aria-label="Remove wallet filter" onSelectedChange={() => setTransactionWalletFilter('all')}><span className="min-w-0 truncate">{transactionWalletOptions.find(option => option.value === transactionWalletFilter)?.label}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" /></FilterChip> : null}
                  {transactionCategoryFilter !== 'all' ? <FilterChip selected className="max-w-full" aria-label="Remove category filter" onSelectedChange={() => { setTransactionCategoryFilter('all'); setTransactionSubcategoryFilter('all'); }}><span className="min-w-0 truncate">{transactionCategoryFilterOptions.find(option => option.value === transactionCategoryFilter)?.label}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" /></FilterChip> : null}
                  {transactionSubcategoryFilter !== 'all' ? <FilterChip selected className="max-w-full" aria-label="Remove subcategory filter" onSelectedChange={() => setTransactionSubcategoryFilter('all')}><span className="min-w-0 truncate">{transactionSubcategoryFilterOptions.find(option => option.value === transactionSubcategoryFilter)?.label}</span> <X className="h-3 w-3 shrink-0" aria-hidden="true" /></FilterChip> : null}
                  {transactionReportingStatus !== 'all' ? <FilterChip selected aria-label="Remove reporting filter" onSelectedChange={() => setTransactionReportingStatus('all')}>{TRANSACTION_REPORTING_STATUS_OPTIONS.find(option => option.value === transactionReportingStatus)?.label} <X className="h-3 w-3" aria-hidden="true" /></FilterChip> : null}
                  <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/40 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label text-muted-foreground">View by</span>
                <FilterBar label="Transaction period scope" className="flex-wrap">
                  {TRANSACTION_SCOPE_OPTIONS.map(option => (
                    <FilterChip
                      key={option.value}
                      selected={transactionScope === option.value}
                      onSelectedChange={selected => {
                        if (!selected) return;
                        setTransactionScope(option.value);
                        setTransactionRangeError('');
                      }}
                      className="min-h-11 rounded-lg px-3 text-xs font-bold"
                    >
                      {option.label}
                    </FilterChip>
                  ))}
                </FilterBar>
              </div>

              {transactionScope !== 'all' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {transactionScope === 'range' ? (
                    <>
                      <DatePicker
                        label="From"
                        value={transactionRangeStart}
                        max={transactionRangeEnd}
                        onChange={value => {
                          if (!isValidLocalDateKey(value)) return;
                          if (value > transactionRangeEnd) {
                            setTransactionRangeError('From must be on or before To.');
                            return;
                          }
                          setTransactionRangeStart(value);
                          setTransactionRangeError('');
                        }}
                        className="w-40"
                        clearable={false}
                      />
                      <span className="px-0.5 text-sm text-muted-foreground" aria-hidden="true">to</span>
                      <DatePicker
                        label="To"
                        value={transactionRangeEnd}
                        min={transactionRangeStart}
                        onChange={value => {
                          if (!isValidLocalDateKey(value)) return;
                          if (value < transactionRangeStart) {
                            setTransactionRangeError('To must be on or after From.');
                            return;
                          }
                          setTransactionRangeEnd(value);
                          setTransactionRangeError('');
                        }}
                        className="w-40"
                        clearable={false}
                      />
                      {transactionRangeError ? <p className="basis-full text-xs font-semibold text-destructive" role="alert">{transactionRangeError}</p> : null}
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className={`caizen-arrow-fly-through-trigger ${androidPresentation ? 'caizen-arrow-fly-through-static' : ''}`}
                        aria-label={`Previous ${transactionScope}`}
                        onClick={() => setSelectedTransactionDate(shiftTransactionScopeAnchor(selectedTransactionDate, transactionScope, -1))}
                      >
                        <ArrowFlyThrough direction="left"><ChevronLeft className="h-4 w-4" /></ArrowFlyThrough>
                      </Button>
                      {transactionScope === 'day' ? (
                        <DatePicker
                          label="Selected day"
                          value={selectedTransactionDate}
                          onChange={value => {
                            if (isValidLocalDateKey(value)) setSelectedTransactionDate(value);
                          }}
                          className="w-44"
                          clearable={false}
                        />
                      ) : transactionScope === 'month' ? (
                        <DatePicker
                          label="Selected month"
                          value={`${selectedTransactionDate.slice(0, 7)}-01`}
                          onChange={value => {
                            const monthDateKey = `${value.slice(0, 7)}-01`;
                            if (isValidLocalDateKey(monthDateKey)) setSelectedTransactionDate(monthDateKey);
                          }}
                          className="w-44"
                          clearable={false}
                          monthOnly
                        />
                      ) : (
                        <AndroidAdaptiveSelect
                          label="Selected year"
                          value={selectedTransactionDate.slice(0, 4)}
                          onChange={value => {
                            const yearDateKey = `${value}-01-01`;
                            if (isValidLocalDateKey(yearDateKey)) setSelectedTransactionDate(yearDateKey);
                          }}
                          options={transactionYearOptions}
                          className="w-32"
                          searchable={transactionYearOptions.length > 12}
                        />
                      )}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className={`caizen-arrow-fly-through-trigger ${androidPresentation ? 'caizen-arrow-fly-through-static' : ''}`}
                        aria-label={`Next ${transactionScope}`}
                        onClick={() => setSelectedTransactionDate(shiftTransactionScopeAnchor(selectedTransactionDate, transactionScope, 1))}
                      >
                        <ArrowFlyThrough direction="right"><ChevronRight className="h-4 w-4" /></ArrowFlyThrough>
                      </Button>
                      {!transactionScopeIsCurrent(transactionScope, selectedTransactionDate) ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTransactionDate(toLocalDateKey())}>
                          {transactionScope === 'day' ? 'Today' : 'Current'}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {renderSummaryValue('Income', historySummary.income, 'positive', 'Reportable inflow')}
              {renderSummaryValue('Expense', historySummary.expense, 'destructive', 'Reportable outflow')}
              {renderSummaryValue('Net', historySummary.net, historySummary.net >= 0 ? 'positive' : 'destructive', 'Income minus expense')}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-card-title">
                  {transactionScope === 'day'
                    ? 'Transactions for selected day'
                    : transactionScope === 'month'
                      ? 'Transactions for selected month'
                      : transactionScope === 'year'
                        ? 'Transactions for selected year'
                        : transactionScope === 'range'
                          ? 'Transactions for selected range'
                          : 'All transactions'}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{transactionRows.length} shown · {transactions.length} total</p>
              </div>
            </div>
            <div className="mt-4">
              {transactionRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-6 text-center">
                  {!wallets.length ? (
                    <>
                      <Wallet className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <h4 className="mt-3 text-card-title">Add a wallet first</h4>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">A wallet is required before you can record a transaction.</p>
                      <Button type="button" size="sm" className="mt-4" onClick={() => { selectView('wallets'); setIsWalletModalOpen(true); }}>Add wallet</Button>
                    </>
                  ) : !transactions.length ? (
                    <>
                      <History className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <h4 className="mt-3 text-card-title">No transactions yet</h4>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Record an income or expense to start tracking your money.</p>
                      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                        <Button type="button" size="sm" onClick={() => openNewTransaction('expense')}>Add transaction</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setIsTransactionCsvImportOpen(true)}>Import transactions</Button>
                      </div>
                    </>
                  ) : transactionScopeRows.length === 0 ? (
                    <>
                      <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <h4 className="mt-3 text-card-title">
                        {transactionScope === 'day' ? 'No transactions for this day.' : `No transactions in this ${transactionScope}.`}
                      </h4>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Choose another period or record a transaction for this date.</p>
                    </>
                  ) : hasActiveFilters ? (
                    <>
                      <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <h4 className="mt-3 text-card-title">No matching transactions</h4>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Try a different search or clear the active filters.</p>
                      <Button type="button" size="sm" variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
                    </>
                  ) : (
                    <>
                      <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <h4 className="mt-3 text-card-title">No matching transactions</h4>
                      <Button type="button" size="sm" variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {historyGroups.map(group => {
                    const date = formatHistoryDate(group.dateKey);
                    const completeGroup = fullHistoryGroupByDate.get(group.dateKey);
                    const completeSummary = completeGroup?.summary || group.summary;
                    const isContinued = Boolean(completeGroup && group.transactions[0]?.id !== completeGroup.transactions[0]?.id);
                    const hasReportableMovement = completeSummary.income !== 0 || completeSummary.expense !== 0;
                    const dayNetTone = hideBalances ? 'text-foreground' : completeSummary.net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive';
                    return (
                      <section key={group.dateKey} aria-labelledby={`transaction-day-${group.dateKey}`}>
                        <header className="flex items-end justify-between gap-3 border-b border-border/55 pb-2">
                          <div className="flex min-w-0 items-end gap-3">
                            <span className="text-3xl font-bold leading-none tabular-nums">{date.day}</span>
                            <div className="min-w-0 pb-0.5">
                              <h4 id={`transaction-day-${group.dateKey}`} className="text-card-title">{date.weekday}</h4>
                              <p className="text-xs text-muted-foreground">{date.monthYear}</p>
                            </div>
                          </div>
                          <span className={cn('shrink-0 text-sm font-bold tabular-nums', hasReportableMovement ? dayNetTone : 'text-muted-foreground')}>
                            {hideBalances || hasReportableMovement ? formatSignedMoney(completeSummary.net) : '—'}
                            {isContinued ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Continued</span> : null}
                          </span>
                        </header>
                        <div className="divide-y divide-border/50">
                          {group.transactions.map(transaction => {
                            const isTransferRow = transaction.type === 'transfer';
                            const signedAmount = getTransactionSignedAmount(transaction);
                            const isPositive = signedAmount === null || signedAmount >= 0;
                            const transferRoute = `${walletName(transaction.walletId)} → ${walletName(transaction.destinationWalletId)}`;
                            const categoryLabel = getTransactionCategoryLabel(transaction, categories);
                            const title = isTransferRow
                              ? transferRoute
                              : transaction.type === 'adjustment'
                                ? 'Balance adjustment'
                                : transaction.title || categoryLabel;
                            const secondaryContext = isTransferRow
                              ? `Transfer${transaction.fee ? ` · Fee: ${hideBalances ? '••••••' : formatPHP(transaction.fee)}` : ''}`
                              : transaction.type === 'adjustment'
                                ? [walletName(transaction.walletId), transaction.source].filter(Boolean).join(' · ')
                                : [
                                    transaction.title ? categoryLabel : null,
                                    walletName(transaction.walletId),
                                    transaction.payee !== transaction.title ? transaction.payee : null,
                                  ].filter(Boolean).join(' · ');
                            const rowLabel = `${title} on ${date.weekday}, ${date.monthYear} ${date.day}`;
                            const marker = transaction.type === 'income'
                              ? <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                              : transaction.type === 'expense'
                                ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                                : transaction.type === 'transfer'
                                  ? <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                                  : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />;
                            const markerClass = transaction.type === 'income'
                              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
                              : transaction.type === 'expense'
                                ? 'text-destructive bg-destructive/10'
                                : transaction.type === 'adjustment'
                                  ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10'
                                  : 'text-primary bg-primary/10';
                            const amountText = hideBalances
                              ? '••••••'
                              : isTransferRow
                                ? formatPHP(Math.abs(transaction.amount))
                                : formatSignedMoney(signedAmount || 0);
                            const category = categories.find(item => item.id === transaction.categoryId);
                            const subcategory = category?.subcategories.find(item => item.id === transaction.subcategoryId);
                            const identityIcon = isTransferRow
                              ? <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                              : transaction.type === 'adjustment'
                                ? <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                                : <CategoryIcon
                                    categoryIconId={category?.icon}
                                    subcategoryIconId={subcategory?.icon}
                                    size="sm"
                                    containerClassName="h-8 w-8 rounded-xl"
                                  />;
                            return (
                              <article key={transaction.id} className="grid gap-3 py-4 first:pt-3 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="flex min-w-0 items-start gap-3">
                                  {isSelectingTransactions ? (
                                    <label className="android-finance-row-selection mt-0.5 grid shrink-0 place-items-center rounded-xl">
                                      <input
                                        type="checkbox"
                                        checked={selectedTransactionIds.has(transaction.id)}
                                        onChange={() => toggleTransactionSelection(transaction.id)}
                                        aria-label={`Select ${rowLabel}`}
                                        className="size-4 accent-primary"
                                      />
                                    </label>
                                  ) : null}
                                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isTransferRow ? 'bg-primary/10 text-primary' : transaction.type === 'adjustment' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : ''}`} aria-hidden="true">
                                    {identityIcon}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h5 className="break-words text-card-title">{title}</h5>
                                      {isTransferRow ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Transfer · not spending</span> : null}
                                      {transaction.excludeFromReports && !isTransferRow ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Excluded</span> : null}
                                    </div>
                                    <p className="mt-1 flex items-center gap-1.5 break-words text-xs text-muted-foreground" aria-label={secondaryContext}>
                                      <span className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-md ${markerClass}`} aria-hidden="true">{marker}</span>
                                      {isTransferRow ? (
                                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                          <WalletIdentity wallet={walletById.get(transaction.walletId)} profileId={currentProfileId} size="xs" showName />
                                          <span aria-hidden="true">→</span>
                                          <WalletIdentity wallet={walletById.get(transaction.destinationWalletId || '')} profileId={currentProfileId} size="xs" showName />
                                          {transaction.fee ? <span>· Fee: {hideBalances ? '••••••' : formatPHP(transaction.fee)}</span> : null}
                                        </span>
                                      ) : (
                                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                          {transaction.title ? <span>{categoryLabel} ·</span> : null}
                                          <WalletIdentity wallet={walletById.get(transaction.walletId)} profileId={currentProfileId} size="xs" showName />
                                          {transaction.payee && transaction.payee !== transaction.title ? <span>· {transaction.payee}</span> : null}
                                          {transaction.type === 'adjustment' && transaction.source ? <span>· {transaction.source}</span> : null}
                                        </span>
                                      )}
                                    </p>
                                    {!isTransferRow && transaction.notes ? <p className="mt-1 break-words text-xs text-muted-foreground">{transaction.notes}</p> : null}
                                    {!isTransferRow && transaction.linkedRecord ? (() => {
                                      const linkedName = resolveLinkedRecordName(transaction.linkedRecord, {
                                        inventoryItems: context.inventoryItems,
                                        skincareProducts: context.skincareProducts,
                                        supplements: context.supplements,
                                        books: context.books,
                                        games: context.games,
                                      });
                                      if (!linkedName || !transaction.linkedRecord) return null;
                                      const linkedRecord = transaction.linkedRecord;
                                      return (
                                        <button
                                          type="button"
                                          onClick={event => { event.stopPropagation(); navigateToLinkedRecord(linkedRecord.module, linkedRecord.recordId); }}
                                          className="mt-1 inline-flex min-h-11 min-w-0 items-center gap-1 break-words text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          aria-label={`Open linked ${linkedRecordModuleLabel(linkedRecord.module)} record: ${linkedName}`}
                                        >
                                          <Link2 className="h-3 w-3" aria-hidden="true" /> {linkedRecordModuleLabel(linkedRecord.module)} · {linkedName}
                                        </button>
                                      );
                                    })() : null}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-3 pl-11 sm:justify-end sm:pl-4">
                                  <span className={cn(
                                    'font-bold tabular-nums',
                                    hideBalances || isTransferRow ? 'text-foreground' : transaction.type === 'adjustment' ? 'text-amber-700 dark:text-amber-300' : isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive',
                                  )}>{amountText}</span>
                                  {androidPresentation ? (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="android-finance-row-action size-11"
                                      aria-label={`More actions for ${rowLabel}`}
                                      onClick={() => openTransactionActions(transaction, rowLabel)}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          className="android-finance-row-action size-11"
                                          aria-label={`More actions for ${rowLabel}`}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="min-w-36">
                                        <DropdownMenuItem onSelect={() => {
                                          setEditingTransactionId(transaction.id);
                                          setTransactionInitialType(transaction.type);
                                          setIsTransactionModalOpen(true);
                                        }}>
                                          Edit
                                        </DropdownMenuItem>
                                        {(transaction.type === 'income' || transaction.type === 'expense') && !transaction.categoryId ? (
                                          <DropdownMenuItem onSelect={() => {
                                          setEditingTransactionId(transaction.id);
                                          setTransactionInitialType(transaction.type);
                                          setIsTransactionModalOpen(true);
                                        }}>
                                            Categorize
                                          </DropdownMenuItem>
                                        ) : null}
                                        {transaction.type !== 'transfer' && !transaction.walletId ? (
                                          <DropdownMenuItem onSelect={() => setConnectingTransactionId(transaction.id)}>
                                            Connect wallet
                                          </DropdownMenuItem>
                                        ) : null}
                                        <DropdownMenuItem variant="destructive" onSelect={() => setDeletingTransactionId(transaction.id)}>
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              {transactionRows.length > 0 ? (
                <div className="mt-5 flex flex-col gap-3 border-t border-border/55 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Showing {transactionPage.startIndex + 1}–{transactionPage.endIndex} of {transactionPage.totalItems.toLocaleString()}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <AndroidAdaptiveSelect
                      label="Rows per page"
                      value={String(transactionHistoryPageSize)}
                      onChange={value => setTransactionHistoryPageSize(Number(value))}
                      options={[25, 50, 100].map(value => ({ value: String(value), label: `${value} rows` }))}
                      className="control-input min-w-28"
                    />
                    {transactionPage.totalPages > 1 ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTransactionHistoryPage(1)} disabled={transactionPage.page === 1} aria-label="First transaction history page">First</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTransactionHistoryPage(page => Math.max(1, page - 1))} disabled={transactionPage.page === 1} aria-label="Previous transaction history page">Previous</Button>
                        <span className="min-w-24 text-center font-semibold">Page {transactionPage.page} of {transactionPage.totalPages}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTransactionHistoryPage(page => Math.min(transactionPage.totalPages, page + 1))} disabled={transactionPage.page === transactionPage.totalPages} aria-label="Next transaction history page">Next</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTransactionHistoryPage(transactionPage.totalPages)} disabled={transactionPage.page === transactionPage.totalPages} aria-label="Last transaction history page">Last</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </Surface>

        </div>
      </div>
    );
  };

  const renderWallets = () => (
    <div className="space-y-4">
      <Surface className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-section-title">Wallets</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Update a single wallet here, or run a balance check-in for all wallets.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCheckInOpen(true)}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Balance check-in
            </Button>
            <Button type="button" onClick={openAddWallet}>
              <Plus className="mr-2 h-4 w-4" /> Add wallet
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryValue
            label="Available money"
            value={planTotals.availableNow}
            detail="Wallets marked as available money"
            hidden={hideBalances}
            emphasis
            tone="positive"
          />
          <SummaryValue
            label="Protected money"
            value={planTotals.protectedBalance}
            detail={`${protectedWallets.length} protected wallet${protectedWallets.length === 1 ? '' : 's'}`}
            hidden={hideBalances}
            tone="protected"
          />
          <SummaryValue
            label="All wallets"
            value={planTotals.totalWalletBalance}
            detail={snapshotLabel}
            hidden={hideBalances}
          />
        </div>
      </Surface>

      {sortedWallets.length === 0 ? (
        <Surface className="p-6 text-center">
          <Wallet className="mx-auto h-6 w-6 text-muted-foreground" />
          <h3 className="mt-3 text-card-title">Start with a wallet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add cash, spending money, savings, or investments.
          </p>
          <Button type="button" onClick={openAddWallet} className="mt-4">
            <Plus className="mr-2 h-4 w-4" /> Add wallet
          </Button>
        </Surface>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedWallets.map(wallet => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              profileId={currentProfileId}
              hidden={hideBalances}
              androidPresentation={Boolean(androidPresentation)}
              onOpenActions={() => {
                setOpenMenuId(null);
                setBalanceActionSheet({
                  title: wallet.name,
                  description: 'Wallet actions',
                  actions: [
                    {
                      label: 'Edit wallet',
                      icon: <Pencil className="size-5 shrink-0" aria-hidden="true" />,
                      onSelect: () => {
                        setEditingWalletId(wallet.id);
                        setIsWalletModalOpen(true);
                      },
                    },
                    {
                      label: 'Delete wallet',
                      icon: <Trash2 className="size-5 shrink-0" aria-hidden="true" />,
                      destructive: true,
                      onSelect: () => setDeletingWalletId(wallet.id),
                    },
                  ],
                });
              }}
              menuOpen={openMenuId === `wallet-${wallet.id}`}
              onToggleMenu={() =>
                setOpenMenuId(current =>
                  current === `wallet-${wallet.id}`
                    ? null
                    : `wallet-${wallet.id}`,
                )
              }
              onEdit={() => {
                setOpenMenuId(null);
                setEditingWalletId(wallet.id);
                setIsWalletModalOpen(true);
              }}
              onDelete={() => {
                setOpenMenuId(null);
                setDeletingWalletId(wallet.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderBudgets = () => (
    <div className="space-y-4">
      <Surface className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="mt-1 text-section-title">Budgets</h2>
          <p className="mt-1 text-metadata text-muted-foreground">Monthly allocations</p>
            <p className="mt-1 text-sm text-muted-foreground">Compare monthly spending limits with expenses included in reports.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingBudgetId(null);
              setIsBudgetModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add budget
          </Button>
        </div>

        {androidPresentation ? (
          <div className="android-balance-month-navigation mt-5 rounded-2xl border border-border/55 bg-background/40 p-2">
            <Button type="button" size="icon" variant="ghost" className="caizen-arrow-fly-through-trigger caizen-arrow-fly-through-static" onClick={() => setBudgetMonth(shiftBudgetMonth(budgetMonth, -1))} aria-label="Previous budget month">
              <ArrowFlyThrough direction="left"><ChevronLeft className="size-5" /></ArrowFlyThrough>
            </Button>
            <span className="min-w-0 text-center text-sm font-bold">{budgetMonthLabel}</span>
            <Button type="button" size="icon" variant="ghost" className="caizen-arrow-fly-through-trigger caizen-arrow-fly-through-static" onClick={() => setBudgetMonth(shiftBudgetMonth(budgetMonth, 1))} aria-label="Next budget month">
              <ArrowFlyThrough direction="right"><ChevronRight className="size-5" /></ArrowFlyThrough>
            </Button>
            <Button type="button" size="sm" variant="ghost" className="android-balance-month-current" onClick={() => setBudgetMonth(monthKey)} disabled={budgetMonth === monthKey} aria-label="Go to current budget month">Current</Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-border/55 bg-background/40 p-2">
            <Button type="button" size="sm" variant="ghost" className="caizen-arrow-fly-through-trigger shrink-0" onClick={() => setBudgetMonth(shiftBudgetMonth(budgetMonth, -1))} aria-label="Previous budget month">
              <ArrowFlyThrough direction="left" className="mr-1"><ChevronLeft className="h-4 w-4" /></ArrowFlyThrough> Previous
            </Button>
            <span className="min-w-[10rem] flex-1 text-center text-sm font-bold">{budgetMonthLabel}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setBudgetMonth(monthKey)} disabled={budgetMonth === monthKey} aria-label="Go to current budget month">Current</Button>
            <Button type="button" size="sm" variant="ghost" className="caizen-arrow-fly-through-trigger shrink-0" onClick={() => setBudgetMonth(shiftBudgetMonth(budgetMonth, 1))} aria-label="Next budget month">
              Next <ArrowFlyThrough direction="right" className="ml-1"><ChevronRight className="h-4 w-4" /></ArrowFlyThrough>
            </Button>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryValue label="Allocated" value={budgetSummary.allocated} detail="Monthly limits" hidden={hideBalances} />
          <SummaryValue label="Spent" value={budgetSummary.spent} detail="Reportable expenses" hidden={hideBalances} tone="destructive" />
          <SummaryValue
            label="Remaining"
            value={budgetSummary.remaining}
            detail={hideBalances ? 'Hidden' : budgetSummary.overBy > 0 ? `Over by ${formatPHP(budgetSummary.overBy)}` : 'Available in budgets'}
            hidden={hideBalances}
            emphasis
            tone={budgetSummary.remaining >= 0 ? 'positive' : 'destructive'}
          />
        </div>
      </Surface>

      {visibleBudgets.length === 0 ? (
        <Surface className="p-8 text-center">
          <PiggyBank className="mx-auto h-7 w-7 text-muted-foreground/65" />
          <h3 className="mt-3 text-card-title">No budgets for {budgetMonthLabel}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Set a spending limit for a category to compare it with your recorded expenses.</p>
          <Button type="button" className="mt-4" onClick={() => setIsBudgetModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add budget
          </Button>
        </Surface>
      ) : (
        <div className="space-y-3">
          {visibleBudgets.map(metrics => {
            const category = categories.find(item => item.id === metrics.budget.categoryId);
            const subcategory = category?.subcategories.find(item => item.id === metrics.budget.subcategoryId);
            const label = subcategory ? `${category?.name || 'Category'} › ${subcategory.name}` : category?.name || 'Category';
            return (
              <Surface key={metrics.budget.id} className="p-4 sm:p-5">
                <div className="flex min-w-0 flex-col items-start justify-between gap-3 @min-[30rem]:flex-row">
                  <div className="flex min-w-0 items-start gap-2">
                    <CategoryIcon categoryIconId={category?.icon} subcategoryIconId={subcategory?.icon} size="sm" containerClassName="h-8 w-8 rounded-lg" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="break-words text-card-title">{label}</h3>
                        {metrics.budget.recurring ? (
                          <Tooltip><TooltipTrigger asChild><span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            <Repeat className="h-3 w-3" aria-hidden="true" /> Monthly
                          </span></TooltipTrigger><TooltipContent>{"Repeats monthly"}</TooltipContent></Tooltip>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <MoneyValue value={metrics.spent} hidden={hideBalances} /> of <MoneyValue value={metrics.allocated} hidden={hideBalances} /> spent
                      </p>
                    </div>
                  </div>
                  {androidPresentation ? (
                    <button
                      type="button"
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setBalanceActionSheet({
                          title: label,
                          description: 'Budget actions',
                          actions: [
                            {
                              label: 'Edit budget',
                              icon: <Pencil className="size-5 shrink-0" aria-hidden="true" />,
                              onSelect: () => {
                                setEditingBudgetId(metrics.budget.id);
                                setIsBudgetModalOpen(true);
                              },
                            },
                            {
                              label: 'Delete budget',
                              icon: <Trash2 className="size-5 shrink-0" aria-hidden="true" />,
                              destructive: true,
                              onSelect: () => setBudgetToDelete(metrics.budget),
                            },
                          ],
                        });
                      }}
                      aria-label={`Actions for budget ${label}`}
                    >
                      <MoreVertical className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => {
                        setEditingBudgetId(metrics.budget.id);
                        setIsBudgetModalOpen(true);
                      }} aria-label={`Edit budget ${label}`}>Edit</Button>
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setBudgetToDelete(metrics.budget)} aria-label={`Delete budget ${label}`}>Delete</Button>
                    </div>
                  )}
                </div>
                {hideBalances ? (
                  <p className="mt-3 text-xs text-muted-foreground">Amounts hidden</p>
                ) : (
                  <>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/70" role="progressbar" aria-label="Budget spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.displayProgressPercent} aria-valuetext={`${Math.round(metrics.progressPercent)} percent spent`}>
                      <div className={cn('h-full rounded-full transition-[width]', metrics.status === 'over-budget' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${metrics.displayProgressPercent}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{metrics.status === 'over-budget' ? `Over by ${formatPHP(metrics.overBy)}` : `${formatPHP(metrics.remaining)} remaining`}</span>
                      <span className={cn('font-bold', metrics.status === 'over-budget' ? 'text-destructive' : 'text-muted-foreground')}>
                        {Math.round(metrics.progressPercent)}%
                      </span>
                    </div>
                  </>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPlan = () => (
    <div className="space-y-4">
      <Surface className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-section-title">Cash flow</h2>
            <p className="mt-1 text-sm text-muted-foreground">Forecast upcoming income and payments, or set category spending limits with budgets.</p>
          </div>
          <SegmentedControl
            label="Cash flow views"
            value={planSurface}
            onValueChange={value => setPlanSurface(value as 'forecast' | 'budgets')}
            options={[{ value: 'forecast', label: 'Forecast' }, { value: 'budgets', label: 'Budgets' }]}
          />
        </div>
      </Surface>
      {planSurface === 'budgets' ? renderBudgets() : null}
      {planSurface === 'forecast' ? <>
      <Surface className="p-5 sm:p-6">
        <div>
          <h2 className="mt-1 text-section-title">Upcoming income and payments</h2>
          <p className="mt-1 text-metadata text-muted-foreground">
            {monthLabel}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Recurring items stay for future months. One-time items disappear from
            the active list when paid or received and remain archived.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryValue
              label="Available now"
              value={planTotals.availableNow}
              detail="Wallets marked as available money"
              hidden={hideBalances}
              tone="positive"
            />
          <SummaryValue
              label="Still to pay"
              value={planTotals.stillToPay}
              detail="Monthly costs and reserved payments"
              hidden={hideBalances}
              tone="destructive"
            />
          <SummaryValue
            label="Available after payments"
            value={planTotals.availableAfterPlans}
            detail="Available now minus still to pay"
            hidden={hideBalances}
            emphasis
            tone={planTotals.availableAfterPlans >= 0 ? 'positive' : 'destructive'}
          />
          <SummaryValue
            label="Expected later"
            value={planTotals.expectedLater}
            detail="Incoming money not yet received"
            hidden={hideBalances}
            tone="positive"
          />
        </div>

        <p className="mt-4 rounded-2xl border border-border/55 bg-background/40 p-4 text-sm text-muted-foreground">
          After all expected incoming money arrives, the projection becomes{' '}
          <strong className="text-foreground">
            <MoneyValue
              value={planTotals.projectedAfterIncoming}
              hidden={hideBalances}
              tone={planTotals.projectedAfterIncoming >= 0 ? 'positive' : 'destructive'}
            />
          </strong>
          . Incoming money is never treated as available before it is received.
        </p>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-2">
        {renderPlanList(
          'Monthly forecast income',
          'Salary and other income expected every month.',
          incomeRows,
          'income',
        )}
        {renderPlanList(
          'Monthly forecast costs',
            'Bills and recurring costs expected every month.',
          expenseRows,
          'expense',
        )}
      </div>

      <UpcomingMoneyPanel
        hidden={hideBalances}
        currency={displayCurrency}
        androidPresentation={Boolean(androidPresentation)}
        requestedItemId={requestedFeature === 'money-item' ? requestedRecordId : undefined}
        requestedDirection={requestedFeature === 'new-expense' ? 'outgoing' : undefined}
        requestedSignal={requestedViewSignal}
      />
      </> : null}
    </div>
  );

  const renderReports = () => (
    <ReportsPanel
      transactions={transactions as Transaction[]}
      categories={categories}
      wallets={wallets as WalletData[]}
      budgets={budgets}
      hidden={hideBalances}
      androidPresentation={Boolean(androidPresentation)}
      onAddTransaction={() => openNewTransaction('expense')}
      onExport={period => setExportRequest({ format: 'xlsx', period, allowAll: false })}
    />
  );

  const renderPlans = () => (
    <WishlistSection
      embedded
      androidPresentation={androidPresentation}
      availableFunds={planTotals.availableForPurchases}
      eligibleWalletBalance={planTotals.purchaseWalletBalance}
      reservedPayments={planTotals.stillToPay}
      fundsDescription="Wallets enabled for purchase plans, minus upcoming payments. Expected income is not included."
      hideBalances={hideBalances}
      currency={displayCurrency}
      requestedFeature={requestedFeature}
      requestedRecordId={requestedFeature === 'plan-item' ? requestedRecordId : undefined}
      requestedRecordSignal={requestedViewSignal}
    />
  );

  const clearHistoryDetails = (
    <div className="caizen-clear-history-details space-y-3 text-sm">
      <div className="caizen-clear-history-row">
        <span className="font-bold">Stays in place</span>
        <span className="text-muted-foreground">Wallets, current balances, categories, subcategories, budgets, and recurring templates.</span>
      </div>
      <div className="caizen-clear-history-row">
        <span className="font-bold">Will be removed</span>
        <span className="flex items-center gap-2 text-muted-foreground"><X className="size-4 shrink-0 text-destructive" aria-hidden="true" />Every transaction in this profile.</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Your source CSV files are not changed, so you can import them again later if needed.</p>
    </div>
  );

  return (
    <MoneyMotionProvider
      revision={`${moneyEntryId}:${currentProfileId}:${activeView}:${planSurface}:${budgetMonth}:${displayCurrency}`}
      ready={context.isHydrated}
    >
    <section
      className={androidPresentation ? 'balance-workspace android-finance-section space-y-4' : 'balance-workspace workspace-wide space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'finance-details' : undefined}
    >
      <SectionTabs
        mode="panels"
        value={activeView}
        orientation="horizontal"
        onValueChange={value => {
          if (!isMoneyView(value)) return;
          selectView(value, 'push', true);
        }}
        className="gap-5"
      >
        <header className="border-b border-border/50 px-1 pb-4 sm:px-2">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-page-title">Balance</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              See what is available, what still needs to be paid, and what money
              is expected later.
            </p>
          </div>

          <div className="balance-header-actions">
            <div className={`w-full min-w-0 rounded-xl border border-border/60 bg-background/55 px-3 py-2 sm:w-60 ${currencyChanging ? 'caizen-currency-change' : ''}`}>
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                {androidPresentation ? (
                  <AndroidAdaptiveSelect
                    label="Display currency"
                    value={displayCurrency}
                    onChange={value => {
                      if (!currentProfile) return;
                      const next = value as CurrencyCode;
                      updateProfile(currentProfile.id, { currency: next });
                    }}
                    options={getCurrencySelectOptions()}
                    searchable
                    sheetFullHeight={false}
                  />
                ) : (
                  <>
                    Display currency
                    <Combobox
                      value={displayCurrency}
                      onChange={value => {
                      if (!currentProfile) return;
                      const next = value as CurrencyCode;
                      updateProfile(currentProfile.id, { currency: next });
                    }}
                      options={getCurrencySelectOptions()}
                      ariaLabel="Display currency"
                      searchPlaceholder="Search currencies…"
                      className="min-h-11 flex-1 border-0 px-1 shadow-none"
                    />
                  </>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p key={`${displayCurrency}-${currencyState.status}`} className="caizen-currency-detail text-[11px] text-muted-foreground">
                  {currencyDetail}
                </p>
                {baseCurrency !== displayCurrency && (
                  <button
                    type="button"
                    onClick={() => void refreshCurrencyRate(true)}
                    className="-mx-2 inline-flex min-h-11 shrink-0 items-center px-2 text-[11px] font-bold text-primary"
                  >
                    Refresh rate
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={togglePrivacy}
              aria-pressed={hideBalances}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/55 px-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {hideBalances ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              {hideBalances ? 'Show balances' : 'Hide balances'}
            </button>

            <Button type="button" onClick={() => setIsCheckInOpen(true)} className="min-h-11">
              <RefreshCcw className="mr-2 h-4 w-4" /> Balance check-in
            </Button>
          </div>
        </div>

        </header>

      <div
        className="balance-subnav-sticky"
      >
        <TabsList className="balance-view-tabs" aria-label="Balance views">
          {BALANCE_VIEW_OPTIONS.map(view => (
            <TabsTrigger
              key={view.id}
              value={view.id}
              className="caizen-tab min-h-11 min-w-0 rounded-xl px-2 py-2.5 text-nav-label transition-colors sm:min-w-[7.5rem] sm:px-4"
            >
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0">
        {activeView === 'overview' ? renderOverview() : null}
      </TabsContent>
      <TabsContent value="wallets" className="mt-0">
        {activeView === 'wallets' ? renderWallets() : null}
      </TabsContent>
      <TabsContent value="transactions" className="mt-0">
        {activeView === 'transactions' ? renderTransactions() : null}
      </TabsContent>
      <TabsContent value="reports" className="mt-0">
        {activeView === 'reports' ? renderReports() : null}
      </TabsContent>
      <TabsContent value="plan" className="mt-0">
        {activeView === 'plan' ? renderPlan() : null}
      </TabsContent>
      <TabsContent value="plans" className="mt-0">
        {activeView === 'plans' ? renderPlans() : null}
      </TabsContent>

      </SectionTabs>

      <AndroidBalanceActionSheet
        state={androidPresentation ? balanceActionSheet : null}
        onClose={() => setBalanceActionSheet(null)}
      />

      <BalanceCheckInModal
        isOpen={isCheckInOpen}
        wallets={wallets as WalletData[]}
        existingCheckIn={currentCheckIn}
        hideBalances={hideBalances}
        androidPresentation={Boolean(androidPresentation)}
        onClose={() => setIsCheckInOpen(false)}
        onAddWallet={() => {
          setIsCheckInOpen(false);
          setResumeCheckInAfterWallet(true);
          openAddWallet();
        }}
        onSave={completeBalanceRefresh}
      />

      {isTransactionModalOpen && (
        <TransactionModal
          transaction={editingTransaction}
          initialType={transactionInitialType}
          wallets={wallets as WalletData[]}
          categories={categories}
          hideBalances={hideBalances}
          currency={displayCurrency}
          androidPresentation={Boolean(androidPresentation)}
          inventoryItems={context.inventoryItems}
          skincareProducts={context.skincareProducts}
          supplements={context.supplements}
          books={context.books}
          games={context.games}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setEditingTransactionId(null);
          }}
          onSave={saveTransaction}
        />
      )}

      {connectingTransaction ? (
        <ConnectTransactionWalletModal
          wallets={wallets as WalletData[]}
          onClose={() => setConnectingTransactionId(null)}
          onConnect={walletId => {
            const connected = connectTransactionWallet(connectingTransaction.id, walletId);
            if (connected) {
              toast({
                actionId: `transaction-wallet-connected:${connectingTransaction.id}:${Date.now()}`,
                title: 'Wallet connected',
                description: 'The transaction is now linked to this wallet. Its current balance is unchanged.',
                variant: 'success',
              });
            }
            return connected;
          }}
        />
      ) : null}

      {isTransactionCsvImportOpen && currentProfile && (
        <TransactionCsvImportModal
          profile={currentProfile}
          wallets={wallets as WalletData[]}
          baseCurrency={baseCurrency}
          onClose={() => setIsTransactionCsvImportOpen(false)}
          onImported={(summary: TransactionCsvImportSummary) => {
            toast({
              actionId: `transaction-csv-import:${currentProfile.id}:${Date.now()}`,
              title: 'Transaction history imported',
              description: `${summary.importedTransactions} transaction${summary.importedTransactions === 1 ? '' : 's'} imported, ${summary.transfers} transfer${summary.transfers === 1 ? '' : 's'}, ${summary.skippedRows} skipped, ${summary.unresolvedRows} unresolved.`,
              variant: 'success',
            });
            setIsTransactionCsvImportOpen(false);
            window.location.reload();
          }}
        />
      )}

      {exportRequest ? (
        <ReportExportModal
          transactions={transactions as Transaction[]}
          categories={categories}
          wallets={wallets as WalletData[]}
          budgets={budgets}
          currency={displayCurrency}
          initialPeriod={exportRequest.period}
          initialFormat={exportRequest.format}
          allowAll={exportRequest.allowAll}
          onClose={() => setExportRequest(null)}
        />
      ) : null}

      <WalletModal
        isOpen={isWalletModalOpen}
        profileId={currentProfileId}
        hideBalances={hideBalances}
        currency={displayCurrency}
        onClose={() => {
          setIsWalletModalOpen(false);
          setEditingWalletId(null);
          setResumeCheckInAfterWallet(false);
          if (resumeCheckInAfterWallet) setIsCheckInOpen(true);
        }}
        wallet={editingWallet}
        onSave={async walletData => {
          const {
            pendingImage,
            removeImage,
            avatarAssetId,
            ...walletFields
          } = walletData;
          const isFirstWallet = !editingWallet && wallets.length === 0;
          const oldAssetId = editingWallet?.avatarAssetId;
          let walletId = editingWallet?.id;
          let nextAssetId = removeImage ? undefined : avatarAssetId;
          let createdWalletId: string | undefined;
          let createdAssetId: string | undefined;
          let imageAttached = false;
          try {
            if (editingWallet) {
              walletId = editingWallet.id;
            } else {
              walletId = addWallet(walletFields);
              createdWalletId = walletId;
              if (!walletId) throw new Error('The wallet could not be created.');
            }

            if (pendingImage && walletId) {
              const asset = await mediaStorage.save(pendingImage.blob, {
                profileId: currentProfileId,
                ownerType: 'finance',
                ownerId: walletId,
                role: 'primary',
                fileName: pendingImage.fileName,
              });
              nextAssetId = asset.id;
              createdAssetId = asset.id;
              scheduleMediaCleanup({
                profileId: currentProfileId,
                assetIds: [asset.id],
                reason: 'draft-cancelled',
              });
            }
            if (walletId) {
              const updated = updateWallet(walletId, {
                ...walletFields,
                avatarAssetId: nextAssetId,
              });
              if (!updated) throw new Error('The wallet changed before it could be saved. Review it, then try again.');
              imageAttached = Boolean(createdAssetId);
            }
            if (oldAssetId && oldAssetId !== nextAssetId) {
              scheduleMediaCleanup({ profileId: currentProfileId, assetIds: [oldAssetId], reason: 'attachment-detached' });
            }

            if (isFirstWallet && walletId) {
              toast({
                title: 'Your first wallet is ready',
                description: 'Record a transaction or add a monthly estimate to start tracking your money.',
              });
            }
            setIsWalletModalOpen(false);
            setEditingWalletId(null);
            setResumeCheckInAfterWallet(false);
            if (resumeCheckInAfterWallet) setIsCheckInOpen(true);
          } catch (error) {
            if (createdWalletId) {
              const removed = deleteWallet(createdWalletId);
              if (removed && createdAssetId && !imageAttached) {
                scheduleMediaCleanup({ profileId: currentProfileId, assetIds: [createdAssetId], reason: 'record-deleted' });
              }
              if (!removed) {
                const message = error instanceof Error ? error.message : 'The wallet image could not be saved.';
                throw new Error(`${message} The wallet was created but could not be rolled back; review it before retrying.`);
              }
            } else if (createdAssetId && !imageAttached) {
              scheduleMediaCleanup({ profileId: currentProfileId, assetIds: [createdAssetId], reason: 'draft-cancelled' });
            }
            throw error;
          }
        }}
      />

      {projectionEditorRow && (
        <ProjectionItemModal
          row={projectionEditorRow}
          hideBalances={hideBalances}
          currency={displayCurrency}
          androidPresentation={Boolean(androidPresentation)}
          onSave={saveProjectionRow}
          onClose={() => setProjectionEditorRow(null)}
        />
      )}

      {isBudgetModalOpen && (
        <BudgetModal
          budget={editingBudgetId ? budgets.find(item => item.id === editingBudgetId) || null : null}
          selectedMonth={budgetMonth}
          categories={categories}
          budgets={budgets}
          hideBalances={hideBalances}
          currency={displayCurrency}
          androidPresentation={Boolean(androidPresentation)}
          onSave={saveBudget}
          onClose={() => {
            setIsBudgetModalOpen(false);
            setEditingBudgetId(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deletingWalletId)}
        title="Delete wallet?"
        message="This removes the wallet. Linked one-time items remain without a wallet, but wallets used by saved or recurring transactions cannot be deleted."
        confirmText="Delete wallet"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deletingWalletId && !deleteWallet(deletingWalletId)) {
            toast({
              actionId: `finance-wallet-delete-blocked:${deletingWalletId}`,
              title: 'Wallet kept',
              description: 'This wallet is used by a saved transaction or recurring transaction. Update those records before deleting the wallet.',
              variant: 'warning',
            });
          }
          setDeletingWalletId(null);
        }}
        onCancel={() => setDeletingWalletId(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingTransactionId)}
        title="Delete transaction?"
        message="Deleting this transaction reverses its wallet balance effect."
        confirmText="Delete transaction"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deletingTransactionId) deleteTransaction(deletingTransactionId);
          setDeletingTransactionId(null);
        }}
        onCancel={() => setDeletingTransactionId(null)}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        title={`Delete ${selectedTransactionCount.toLocaleString()} transaction${selectedTransactionCount === 1 ? '' : 's'}?`}
        message="The wallet effects of these transactions will be reversed."
        confirmText="Delete selected"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          const deletedCount = deleteTransactions([...selectedTransactionIds]);
          setIsBulkDeleteOpen(false);
          setSelectedTransactionIds(new Set());
          setIsSelectingTransactions(false);
          toast({
            actionId: `finance-transactions-bulk-delete:${currentProfileId}:${Date.now()}`,
            title: 'Selected transactions deleted',
            description: `${deletedCount.toLocaleString()} transaction${deletedCount === 1 ? '' : 's'} removed and wallet effects reversed.`,
            variant: 'success',
          });
        }}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />

      <ConfirmDialog
        isOpen={isClearTransactionsOpen}
        title="Clear transaction history?"
        message="This removes every saved transaction from the current profile. Transactions bypass Recently Deleted and cannot be restored there. Wallet balances and Balance settings stay unchanged. A separate Cloud snapshot is not directly deleted."
        details={clearHistoryDetails}
        confirmText="Clear transaction history"
        cancelText="Cancel"
        confirmationKeyword="CLEAR"
        confirmationLabel="Type CLEAR to confirm"
        size="comfortable"
        isDangerous
        onConfirm={() => {
          const clearedCount = clearTransactions();
          setIsClearTransactionsOpen(false);
          toast({
            actionId: `finance-transactions-clear:${currentProfileId}:${Date.now()}`,
            title: 'Transaction history cleared',
            description: `${clearedCount.toLocaleString()} transaction${clearedCount === 1 ? '' : 's'} removed. Wallet balances were kept unchanged.`,
            variant: 'success',
          });
        }}
        onCancel={() => setIsClearTransactionsOpen(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(projectionRowToDelete)}
        title="Delete forecast item?"
        message={
          projectionRowToDelete
            ? `Delete “${projectionRowToDelete.label}” from the forecast?`
            : 'Delete this forecast item?'
        }
        confirmText="Delete forecast item"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (projectionRowToDelete) {
            persistProjection(
              projectionRows.filter(row => row.id !== projectionRowToDelete.id),
            );
          }
          setProjectionRowToDelete(null);
        }}
        onCancel={() => setProjectionRowToDelete(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(budgetToDelete)}
        title="Delete budget?"
        message="This removes only the budget allocation. Transactions and wallet balances will remain unchanged."
        confirmText="Delete budget"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (budgetToDelete && currentProfile) {
            const nextBudgets = normalizeBudgets(
              budgets.filter(item => item.id !== budgetToDelete.id),
              categories,
            );
            const updates: Partial<Profile> = { budgets: nextBudgets };
            if (budgetToDelete.recurring) {
              const scope = getBudgetScopeKey(
                budgetToDelete.month,
                budgetToDelete.categoryId,
                budgetToDelete.subcategoryId,
              );
              updates.skippedRecurringBudgetScopes = Array.from(
                new Set([...(currentProfile.skippedRecurringBudgetScopes || []), scope]),
              );
            }
            updateProfile(currentProfile.id, updates);
          }
          setBudgetToDelete(null);
        }}
        onCancel={() => setBudgetToDelete(null)}
      />
    </section>
    </MoneyMotionProvider>
  );
}

function BreakdownRow({
  label,
  value,
  hidden,
  positive = false,
  negative = false,
  strong = false,
}: {
  label: string;
  value: number;
  hidden: boolean;
  positive?: boolean;
  negative?: boolean;
  strong?: boolean;
}) {
  const tone: MoneyTone | undefined = strong
    ? value >= 0
      ? 'positive'
      : 'destructive'
    : positive
      ? 'positive'
      : negative
        ? 'destructive'
        : undefined;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
        strong ? 'bg-primary/[0.08] font-bold' : 'bg-background/45'
      }`}
    >
      <span className="min-w-0 break-words text-sm text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-words text-right', strong ? 'text-foreground' : 'font-semibold')}>
        {!hidden && positive ? '+' : ''}
        {!hidden && negative ? '−' : ''}
        <MoneyValue value={value} hidden={hidden} tone={tone} />
      </span>
    </div>
  );
}
