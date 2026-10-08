'use client';

import { useEffect, useState } from 'react';
import { Check, ListPlus, Pencil, Plus, Trash2, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import CategoryIconPicker from '@/components/balance/CategoryIconPicker';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import {
  clearRecurringProjectionReferences,
  deleteFinancialCategory,
  deleteFinancialSubcategory,
  hasDuplicateFinancialCategoryName,
  hasDuplicateFinancialSubcategoryName,
  isReservedFinancialFallbackName,
  renameFinancialCategory,
  renameFinancialSubcategory,
  type FinancialCategoryMutationResult,
} from '@/lib/balance';
import type { BalanceProjectionRow, Budget, FinancialCategory, Transaction } from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type CategoryManagementModalProps = {
  categories: FinancialCategory[];
  transactions: Transaction[];
  budgets?: Budget[];
  projectionRows?: BalanceProjectionRow[];
  onChange: (result: FinancialCategoryMutationResult) => void;
  onUseStarterCategories?: () => void;
  onClose: () => void;
};

type PendingDelete =
  | {
      kind: 'category';
      categoryId: string;
      name: string;
      affectedTransactionCount: number;
      affectedBudgetCount: number;
      affectedRecurringCount: number;
    }
  | {
      kind: 'subcategory';
      categoryId: string;
      subcategoryId: string;
      name: string;
      affectedTransactionCount: number;
      affectedBudgetCount: number;
      affectedRecurringCount: number;
    };

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyMutationResult = (
  categories: FinancialCategory[],
  transactions: Transaction[],
  budgets: Budget[] = [],
  projectionRows: BalanceProjectionRow[] = [],
): FinancialCategoryMutationResult => ({
  categories,
  transactions,
  budgets,
  projectionRows,
  affectedTransactionCount: 0,
  affectedBudgetCount: 0,
  affectedRecurringCount: 0,
});

type CategoryManagementEditorProps = Omit<CategoryManagementModalProps, 'onClose'> & {
  onDraftChange?: (hasDraft: boolean) => void;
};

export function CategoryManagementEditor({
  categories,
  transactions,
  budgets = [],
  projectionRows = [],
  onChange,
  onUseStarterCategories,
  onDraftChange,
}: CategoryManagementEditorProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<FinancialCategory['type']>('expense');
  const [newCategoryError, setNewCategoryError] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryIcon, setEditingCategoryIcon] = useState('');
  const [editingCategoryError, setEditingCategoryError] = useState('');
  const [addingSubcategoryCategoryId, setAddingSubcategoryCategoryId] = useState<string | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [newSubcategoryIcon, setNewSubcategoryIcon] = useState('');
  const [newSubcategoryError, setNewSubcategoryError] = useState('');
  const [editingSubcategory, setEditingSubcategory] = useState<{
    categoryId: string;
    subcategoryId: string;
  } | null>(null);
  const [editingSubcategoryName, setEditingSubcategoryName] = useState('');
  const [editingSubcategoryIcon, setEditingSubcategoryIcon] = useState('');
  const [editingSubcategoryError, setEditingSubcategoryError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [showCustomCreation, setShowCustomCreation] = useState(false);

  const originalCategory = categories.find(category => category.id === editingCategoryId);
  const originalSubcategory = categories.find(category => category.id === editingSubcategory?.categoryId)
    ?.subcategories?.find(subcategory => subcategory.id === editingSubcategory?.subcategoryId);
  const hasDraft = Boolean(newCategoryName || newCategoryIcon || newSubcategoryName || newSubcategoryIcon ||
    (originalCategory && (editingCategoryName !== originalCategory.name || editingCategoryIcon !== (originalCategory.icon || ''))) ||
    (originalSubcategory && (editingSubcategoryName !== originalSubcategory.name || editingSubcategoryIcon !== (originalSubcategory.icon || ''))));
  useEffect(() => { onDraftChange?.(hasDraft); }, [hasDraft, onDraftChange]);

  const emit = (result: FinancialCategoryMutationResult) =>
    onChange({ ...result, projectionRows: result.projectionRows || projectionRows });

  const startAddingSubcategory = (categoryId: string) => {
    setAddingSubcategoryCategoryId(categoryId);
    setNewSubcategoryName('');
    setNewSubcategoryIcon('');
    setNewSubcategoryError('');
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      setNewCategoryError('Enter a category name.');
      return;
    }
    if (isReservedFinancialFallbackName(name)) {
      setNewCategoryError('Uncategorized is a reserved fallback. Choose another name.');
      return;
    }
    if (hasDuplicateFinancialCategoryName(categories, newCategoryType, name)) {
      setNewCategoryError(`An ${newCategoryType} category with this name already exists.`);
      return;
    }

    emit({
      ...emptyMutationResult(categories, transactions, budgets, projectionRows),
      categories: [
        ...categories,
        {
          id: createId('category'),
          name,
          type: newCategoryType,
          ...(newCategoryIcon ? { icon: newCategoryIcon } : {}),
          total: '0',
          kind: 'neutral',
          subcategories: [],
        },
      ],
    });
    setNewCategoryName('');
    setNewCategoryIcon('');
    setNewCategoryError('');
  };

  const addSubcategory = (category: FinancialCategory) => {
    const name = newSubcategoryName.trim();
    if (!name) {
      setNewSubcategoryError('Enter a subcategory name.');
      return;
    }
    if (hasDuplicateFinancialSubcategoryName(category, name)) {
      setNewSubcategoryError('A subcategory with this name already exists here.');
      return;
    }

    emit({
      ...emptyMutationResult(categories, transactions, budgets, projectionRows),
      categories: categories.map(item =>
        item.id === category.id
          ? {
              ...item,
              subcategories: [
                ...(item.subcategories || []),
                {
                  id: createId(`${category.id}-subcategory`),
                  name,
                  ...(newSubcategoryIcon ? { icon: newSubcategoryIcon } : {}),
                  total: '0',
                },
              ],
            }
          : item,
      ),
    });
    setAddingSubcategoryCategoryId(null);
    setNewSubcategoryName('');
    setNewSubcategoryIcon('');
    setNewSubcategoryError('');
  };

  const saveCategoryName = (category: FinancialCategory) => {
    const name = editingCategoryName.trim();
    if (!name) {
      setEditingCategoryError('Enter a category name.');
      return;
    }
    if (isReservedFinancialFallbackName(name)) {
      setEditingCategoryError('Uncategorized is a reserved fallback. Choose another name.');
      return;
    }
    if (hasDuplicateFinancialCategoryName(categories, category.type, name, category.id)) {
      setEditingCategoryError(`An ${category.type} category with this name already exists.`);
      return;
    }
    emit({
      ...renameFinancialCategory(categories, transactions, category.id, name, budgets),
      categories: categories.map(item => item.id === category.id
        ? { ...item, name, ...(editingCategoryIcon ? { icon: editingCategoryIcon } : { icon: undefined }) }
        : item),
    });
    setEditingCategoryId(null);
    setEditingCategoryError('');
  };

  const saveSubcategoryName = (category: FinancialCategory, subcategoryId: string) => {
    const name = editingSubcategoryName.trim();
    if (!name) {
      setEditingSubcategoryError('Enter a subcategory name.');
      return;
    }
    if (hasDuplicateFinancialSubcategoryName(category, name, subcategoryId)) {
      setEditingSubcategoryError('A subcategory with this name already exists here.');
      return;
    }
    const result = renameFinancialSubcategory(
      categories,
      transactions,
      category.id,
      subcategoryId,
      name,
      budgets,
    );
    emit({
      ...result,
      categories: result.categories.map(item => item.id === category.id
        ? {
            ...item,
            subcategories: item.subcategories.map(subcategory => subcategory.id === subcategoryId
              ? { ...subcategory, name, ...(editingSubcategoryIcon ? { icon: editingSubcategoryIcon } : { icon: undefined }) }
              : subcategory),
          }
        : item),
    });
    setEditingSubcategory(null);
    setEditingSubcategoryError('');
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const result = pendingDelete.kind === 'category'
      ? deleteFinancialCategory(categories, transactions, pendingDelete.categoryId, budgets)
      : deleteFinancialSubcategory(
          categories,
          transactions,
          pendingDelete.categoryId,
          pendingDelete.subcategoryId,
          budgets,
        );
    const cleanup = clearRecurringProjectionReferences(
      projectionRows,
      pendingDelete.categoryId,
      pendingDelete.kind === 'category'
        ? (categories.find(item => item.id === pendingDelete.categoryId)?.subcategories || []).map(item => item.id)
        : [pendingDelete.subcategoryId],
      pendingDelete.kind === 'category',
    );
    emit({ ...result, ...cleanup });
    setPendingDelete(null);
    setEditingCategoryId(null);
    setEditingSubcategory(null);
    setAddingSubcategoryCategoryId(null);
  };

  const categoriesByType = (type: FinancialCategory['type']) =>
    categories.filter(category => category.type === type);

  const renderCategory = (category: FinancialCategory) => {
    const isEditing = editingCategoryId === category.id;
    const isAddingSubcategory = addingSubcategoryCategoryId === category.id;

    return (
      <div key={category.id} className="rounded-2xl border border-border/55 bg-background/35 p-3 sm:p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="grid min-w-0 gap-3 @min-[30rem]/balance-form:grid-cols-2 sm:items-end">
                <input
                  className="control-input min-w-0 flex-1"
                  value={editingCategoryName}
                  onChange={event => setEditingCategoryName(event.target.value)}
                  aria-label={`Rename ${category.name}`}
                  autoFocus
                />
                <div className="min-w-0">
                  <CategoryIconPicker
                    label="Category icon"
                    value={editingCategoryIcon}
                    categoryName={editingCategoryName}
                    onChange={setEditingCategoryIcon}
                  />
                </div>
                <div className="flex flex-wrap gap-2 @min-[30rem]/balance-form:col-span-2">
                  <Button type="button" size="sm" onClick={() => saveCategoryName(category)}>
                    <Check className="mr-1.5 h-4 w-4" /> Save category
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCategoryId(null)}>
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <CategoryIcon iconId={category.icon} size="sm" containerClassName="h-8 w-8 rounded-lg" />
                  <p className="break-words text-sm font-bold">{category.name}</p>
                </div>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {category.type === 'income' ? 'Income' : 'Expense'} category
                </p>
              </>
            )}
            {editingCategoryError && isEditing ? (
              <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{editingCategoryError}</p>
            ) : null}
          </div>
          {!isEditing ? (
            <div className="flex shrink-0 gap-1">
              <Tooltip><TooltipTrigger asChild><Button
                type="button"
                size="sm"
                variant="ghost"
                className="px-2"
                onClick={() => {
                  setEditingCategoryId(category.id);
                  setEditingCategoryName(category.name);
                  setEditingCategoryIcon(category.icon || '');
                  setEditingCategoryError('');
                }}
                aria-label={`Edit category ${category.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button></TooltipTrigger><TooltipContent>{`Edit ${category.name}`}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button
                type="button"
                size="sm"
                variant="ghost"
                className="px-2 text-destructive"
                onClick={() => {
                  const affectedTransactionCount = transactions.filter(transaction =>
                    transaction.categoryId === category.id ||
                    (transaction.subcategoryId || '').length > 0 &&
                      category.subcategories.some(subcategory => subcategory.id === transaction.subcategoryId),
                  ).length;
                  const affectedBudgetCount = budgets.filter(budget =>
                    budget.categoryId === category.id ||
                    category.subcategories.some(subcategory => subcategory.id === budget.subcategoryId),
                  ).length;
                  const affectedRecurringCount = projectionRows.filter(row =>
                    row.recurrence?.categoryId === category.id ||
                    category.subcategories.some(subcategory => subcategory.id === row.recurrence?.subcategoryId),
                  ).length;
                  setPendingDelete({
                    kind: 'category',
                    categoryId: category.id,
                    name: category.name,
                    affectedTransactionCount,
                    affectedBudgetCount,
                    affectedRecurringCount,
                  });
                }}
                aria-label={`Delete category ${category.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button></TooltipTrigger><TooltipContent>{`Delete ${category.name}`}</TooltipContent></Tooltip>
            </div>
          ) : null}
        </div>

        <div className="mt-3 border-t border-border/45 pt-3">
          <div className="space-y-2">
            {(category.subcategories || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No subcategories</p>
            ) : (
              category.subcategories.map(subcategory => {
                const isEditingSubcategory = editingSubcategory?.categoryId === category.id &&
                  editingSubcategory.subcategoryId === subcategory.id;
                return (
                  <div key={subcategory.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border/40 bg-card/55 px-3 py-2">
                    {isEditingSubcategory ? (
                      <div className="min-w-0 flex-1">
                        <div className="grid min-w-0 gap-3 @min-[30rem]/balance-form:grid-cols-2 sm:items-end">
                          <input
                            className="control-input min-w-0 flex-1"
                            value={editingSubcategoryName}
                            onChange={event => setEditingSubcategoryName(event.target.value)}
                            aria-label={`Rename subcategory ${subcategory.name}`}
                            autoFocus
                          />
                          <div className="min-w-0">
                            <CategoryIconPicker
                              label="Subcategory icon"
                              value={editingSubcategoryIcon}
                              categoryName={editingSubcategoryName}
                              onChange={setEditingSubcategoryIcon}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2 @min-[30rem]/balance-form:col-span-2">
                            <Button type="button" size="sm" onClick={() => saveSubcategoryName(category, subcategory.id)}>
                    <Check className="mr-1.5 h-4 w-4" /> Save subcategory
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingSubcategory(null)}>
                              <X className="mr-1.5 h-4 w-4" /> Cancel
                            </Button>
                          </div>
                        </div>
                        {editingSubcategoryError ? (
                          <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{editingSubcategoryError}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2">
                        <CategoryIcon categoryIconId={category.icon} subcategoryIconId={subcategory.icon} size="xs" containerClassName="h-7 w-7 rounded-lg" />
                        <span className="min-w-0 break-words text-sm text-muted-foreground">{subcategory.name}</span>
                      </span>
                    )}
                    {!isEditingSubcategory ? (
                      <div className="flex shrink-0 gap-1">
                        <Tooltip><TooltipTrigger asChild><Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="px-2"
                          onClick={() => {
                            setEditingSubcategory({ categoryId: category.id, subcategoryId: subcategory.id });
                            setEditingSubcategoryName(subcategory.name);
                            setEditingSubcategoryIcon(subcategory.icon || '');
                            setEditingSubcategoryError('');
                          }}
                          aria-label={`Edit subcategory ${subcategory.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button></TooltipTrigger><TooltipContent>{`Edit ${subcategory.name}`}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="px-2 text-destructive"
                          onClick={() => setPendingDelete({
                            kind: 'subcategory',
                            categoryId: category.id,
                            subcategoryId: subcategory.id,
                            name: subcategory.name,
                            affectedTransactionCount: transactions.filter(transaction => transaction.subcategoryId === subcategory.id).length,
                            affectedBudgetCount: budgets.filter(budget =>
                              budget.categoryId === category.id && budget.subcategoryId === subcategory.id,
                            ).length,
                            affectedRecurringCount: projectionRows.filter(row =>
                              row.recurrence?.categoryId === category.id && row.recurrence.subcategoryId === subcategory.id,
                            ).length,
                          })}
                          aria-label={`Delete subcategory ${subcategory.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button></TooltipTrigger><TooltipContent>{`Delete ${subcategory.name}`}</TooltipContent></Tooltip>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {isAddingSubcategory ? (
            <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
              <label className="block text-label text-muted-foreground" htmlFor={`new-subcategory-${category.id}`}>
                New subcategory in {category.name}
              </label>
              <div className="mt-2 grid min-w-0 gap-3 @min-[30rem]/balance-form:grid-cols-2 sm:items-end">
                <input
                  id={`new-subcategory-${category.id}`}
                  className="control-input min-w-0 flex-1"
                  value={newSubcategoryName}
                  onChange={event => setNewSubcategoryName(event.target.value)}
                  placeholder="Subcategory name"
                  autoFocus
                />
                <div className="min-w-0">
                  <CategoryIconPicker
                    label="Subcategory icon"
                    value={newSubcategoryIcon}
                    categoryName={newSubcategoryName}
                    onChange={setNewSubcategoryIcon}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => addSubcategory(category)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingSubcategoryCategoryId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
              {newSubcategoryError ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{newSubcategoryError}</p> : null}
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-3 px-0 text-primary"
              onClick={() => startAddingSubcategory(category.id)}
              aria-label={`Add subcategory to ${category.name}`}
            >
              <ListPlus className="mr-1.5 h-4 w-4" /> Add subcategory
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
        <div className="android-taxonomy-manager space-y-5">
          {categories.length === 0 && !showCustomCreation ? (
            <section className="android-taxonomy-manager-section rounded-2xl border border-primary/25 bg-primary/[0.05] p-5 text-center sm:p-6">
              <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ListPlus className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-card-title">Start with Caizen categories</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Add Caizen&apos;s starter categories and subcategories. You can edit or delete them anytime.
              </p>
              <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                <Button type="button" onClick={onUseStarterCategories} disabled={!onUseStarterCategories}>
                  <Plus className="mr-2 size-4" /> Use starter categories
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCustomCreation(true)}>
                  Create my own
                </Button>
              </div>
            </section>
          ) : null}

          {(categories.length > 0 || showCustomCreation) ? (
          <section className="android-taxonomy-manager-section rounded-2xl border border-border/55 bg-card/55 p-4">
            <div>
              <h3 className="text-card-title">Add a category</h3>
              <p className="mt-1 text-xs text-muted-foreground">Choose Income or Expense. You cannot change the category type after adding it.</p>
            </div>
            <div className="mt-3 grid min-w-0 gap-3 @min-[30rem]/balance-form:grid-cols-2 sm:items-end">
              <label className="sr-only" htmlFor="new-finance-category">Category name</label>
              <input
                id="new-finance-category"
                className="control-input min-w-0"
                value={newCategoryName}
                onChange={event => setNewCategoryName(event.target.value)}
                placeholder="Category name"
              />
              <label className="sr-only" htmlFor="new-finance-category-type">Category type</label>
              <select
                id="new-finance-category-type"
                className="control-input"
                value={newCategoryType}
                onChange={event => setNewCategoryType(event.target.value as FinancialCategory['type'])}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <CategoryIconPicker
                label="Category icon"
                value={newCategoryIcon}
                categoryName={newCategoryName}
                onChange={setNewCategoryIcon}
              />
              <Button type="button" onClick={addCategory} disabled={!newCategoryName.trim()}>
                <Plus className="mr-1.5 h-4 w-4" /> Add
              </Button>
            </div>
            {newCategoryError ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{newCategoryError}</p> : null}
          </section>
          ) : null}

          {(categories.length > 0 || showCustomCreation) ? (['expense', 'income'] as const).map(type => {
            const typeCategories = categoriesByType(type);
            return (
              <section key={type} aria-labelledby={`${type}-categories-heading`} className="android-taxonomy-manager-section">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 id={`${type}-categories-heading`} className="text-card-title">{type === 'expense' ? 'Expense' : 'Income'} categories</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeCategories.length} {typeCategories.length === 1 ? 'category' : 'categories'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {typeCategories.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">No {type} categories yet.</div>
                  ) : typeCategories.map(renderCategory)}
                </div>
              </section>
            );
          }) : null}

          {categories.length > 0 || showCustomCreation ? (
            <p className="text-xs text-muted-foreground">Deleting a category removes its subcategories and uncategorizes affected transactions. Wallet balances and transaction amounts are unchanged.</p>
          ) : null}
        </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={pendingDelete?.kind === 'category' ? `Delete ${pendingDelete.name}?` : `Delete subcategory ${pendingDelete?.name}?`}
        message={pendingDelete?.kind === 'category'
          ? pendingDelete.affectedTransactionCount > 0 || pendingDelete.affectedBudgetCount > 0 || pendingDelete.affectedRecurringCount > 0
            ? `${pendingDelete.affectedTransactionCount ? `${pendingDelete.affectedTransactionCount} transaction${pendingDelete.affectedTransactionCount === 1 ? '' : 's'} will become Uncategorized. ` : ''}${pendingDelete.affectedBudgetCount ? `${pendingDelete.affectedBudgetCount} budget${pendingDelete.affectedBudgetCount === 1 ? '' : 's'} will be removed. ` : ''}${pendingDelete.affectedRecurringCount ? `${pendingDelete.affectedRecurringCount} recurring template${pendingDelete.affectedRecurringCount === 1 ? '' : 's'} will lose their category references. ` : ''}Amounts and wallet balances will not change.`
            : 'The category and its subcategories will be removed. Existing balances will not change.'
          : pendingDelete?.affectedTransactionCount || pendingDelete?.affectedBudgetCount || pendingDelete?.affectedRecurringCount
            ? `${pendingDelete.affectedTransactionCount ? `${pendingDelete.affectedTransactionCount} transaction${pendingDelete.affectedTransactionCount === 1 ? '' : 's'} will keep their parent category but lose this subcategory. ` : ''}${pendingDelete.affectedBudgetCount ? `${pendingDelete.affectedBudgetCount} budget${pendingDelete.affectedBudgetCount === 1 ? '' : 's'} will also be removed. ` : ''}${pendingDelete.affectedRecurringCount ? `${pendingDelete.affectedRecurringCount} recurring template${pendingDelete.affectedRecurringCount === 1 ? '' : 's'} will lose this subcategory. ` : ''}Existing balances will not change.`
            : pendingDelete?.affectedBudgetCount
              ? `${pendingDelete.affectedBudgetCount} budget${pendingDelete.affectedBudgetCount === 1 ? '' : 's'} will be removed. Existing balances will not change.`
              : 'The subcategory will be removed. Existing balances will not change.'}
        confirmText="Delete"
        cancelText="Keep"
        isDangerous
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

export default function CategoryManagementModal(props: CategoryManagementModalProps) {
  return (
    <CaizenFormDialog
      panelClassName="balance-form @container/balance-form"
      title="Manage categories"
      description="Organize income and expenses with categories and subcategories."
      onClose={props.onClose}
      maxWidthClass="max-w-3xl"
      bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
    >
      <CategoryManagementEditor {...props} />
    </CaizenFormDialog>
  );
}
