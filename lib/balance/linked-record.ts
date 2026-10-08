import type {
  BookItem,
  Game,
  InventoryItem,
  LinkedRecordModule,
  SkincareProduct,
  Supplement,
  TransactionLinkedRecord,
} from '@/lib/types';

/**
 * Modules a Transaction can link to, and how to reach a specific record in
 * each one. Reuses the existing `life-manager:navigate` section/feature/
 * recordId mechanism - no new navigation architecture.
 */
export const LINKED_RECORD_MODULE_OPTIONS: Array<{ value: LinkedRecordModule; label: string }> = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'supplements', label: 'Supplements' },
  { value: 'books', label: 'Books' },
  { value: 'games', label: 'Games' },
];

export const linkedRecordModuleLabel = (module: LinkedRecordModule): string =>
  LINKED_RECORD_MODULE_OPTIONS.find(option => option.value === module)?.label || module;

/** Singular record-type noun, used for the "+ Create new ..." picker action and target-modal titles. */
const RECORD_TYPE_LABEL: Record<LinkedRecordModule, string> = {
  inventory: 'Inventory item',
  skincare: 'Skincare product',
  supplements: 'Supplement',
  books: 'Book',
  games: 'Game',
};

export const linkedRecordTypeLabel = (module: LinkedRecordModule): string => RECORD_TYPE_LABEL[module];

const NAVIGATE_TARGET: Record<LinkedRecordModule, { section: string; feature: string }> = {
  inventory: { section: 'inventory', feature: 'item' },
  skincare: { section: 'skincare', feature: 'item' },
  // Supplements live inside Health; this mirrors the existing supplement
  // reminder deep link already handled in app/app/page.tsx.
  supplements: { section: 'health', feature: 'supplements' },
  books: { section: 'entertainment', feature: 'book' },
  games: { section: 'entertainment', feature: 'game' },
};

export function navigateToLinkedRecord(module: LinkedRecordModule, recordId: string) {
  const target = NAVIGATE_TARGET[module];
  window.dispatchEvent(new CustomEvent('life-manager:navigate', {
    detail: { section: target.section, feature: target.feature, recordId },
  }));
}

export function navigateToTransaction(transactionId: string) {
  window.dispatchEvent(new CustomEvent('life-manager:navigate', {
    detail: { section: 'balance', feature: 'transaction', recordId: transactionId },
  }));
}

export type LinkedRecordCollections = {
  inventoryItems: InventoryItem[];
  skincareProducts: SkincareProduct[];
  supplements: Supplement[];
  books: BookItem[];
  games: Game[];
};

/**
 * Resolves a linked record's display name for the moment of rendering only
 * - the name itself is never stored on the Transaction. Returns undefined
 * when the module is unrecognized or the record no longer exists, so a
 * caller can gracefully omit the link tag instead of showing a broken one.
 */
export function resolveLinkedRecordName(
  linkedRecord: TransactionLinkedRecord | undefined,
  collections: LinkedRecordCollections,
): string | undefined {
  if (!linkedRecord) return undefined;
  switch (linkedRecord.module) {
    case 'inventory':
      return collections.inventoryItems.find(item => item.id === linkedRecord.recordId)?.name;
    case 'skincare':
      return collections.skincareProducts.find(item => item.id === linkedRecord.recordId)?.name;
    case 'supplements':
      return collections.supplements.find(item => item.id === linkedRecord.recordId)?.name;
    case 'books':
      return collections.books.find(item => item.id === linkedRecord.recordId)?.title;
    case 'games':
      return collections.games.find(item => item.id === linkedRecord.recordId)?.title;
    default:
      return undefined;
  }
}
