import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  normalizeInventoryItems,
  normalizeSkincareProducts,
  normalizeSupplements,
  normalizeWishlistItems,
  mapBalanceCategoryToInventoryCategory,
} from '@/lib/collections/normalization';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Audit #14 collection normalization', () => {
  const now = new Date(2026, 0, 15, 10, 30, 0);

  it('maps only known Balance plan categories into Inventory buckets', () => {
    expect(mapBalanceCategoryToInventoryCategory('Personal Tech')).toBe('personal_tech');
    expect(mapBalanceCategoryToInventoryCategory('Home')).toBe('home');
    expect(mapBalanceCategoryToInventoryCategory('Wearables')).toBe('wearables');
    expect(mapBalanceCategoryToInventoryCategory('Travel')).toBe('utilities');
  });

  it('keeps inventory values finite, non-negative, and local-calendar stable', () => {
    const input = [{
      name: 'Camera',
      quantity: Number.NaN,
      purchasePrice: 'Infinity',
      currentPrice: -12,
      replacementCost: 'not-a-number',
      purchaseDate: '2026-01-01',
    }];

    const first = normalizeInventoryItems(input, now)[0];
    const second = normalizeInventoryItems(input, now)[0];

    expect(first.id).toBe(second.id);
    expect(first.quantity).toBe(1);
    expect(first.purchasePrice).toBeUndefined();
    expect(first.currentPrice).toBe(0);
    expect(first.replacementCost).toBeUndefined();
    expect(first.purchaseDate?.getFullYear()).toBe(2026);
    expect(first.purchaseDate?.getMonth()).toBe(0);
    expect(first.purchaseDate?.getDate()).toBe(1);
  });

  it('repairs missing and duplicate record identities deterministically', () => {
    const input = [
      { id: 'wish-fixed', name: 'Headphones', estimatedPrice: 100 },
      { id: 'wish-fixed', name: 'Headphones', estimatedPrice: 100 },
      { name: 'Keyboard', estimatedPrice: 50 },
      null,
      'malformed',
    ];

    const first = normalizeWishlistItems(input, now);
    const second = normalizeWishlistItems(input, now);

    expect(first.map(item => item.id)).toEqual([
      'wish-fixed',
      'wish-fixed~2',
      second[2].id,
    ]);
    expect(first[2].id).toBe(second[2].id);
    expect(new Set(first.map(item => item.id)).size).toBe(first.length);
  });

  it('prevents invalid wishlist money from affecting selected totals', () => {
    const items = normalizeWishlistItems([
      { name: 'Valid', selected: true, estimatedPrice: '12.50' },
      { name: 'Broken', selected: true, estimatedPrice: 'NaN' },
      { name: 'Bought', selected: true, isBought: true, estimatedPrice: 90 },
      { name: 'Archived', selected: true, isArchived: true, estimatedPrice: 90 },
    ], now);

    expect(items.map(item => item.estimatedPrice)).toEqual([12.5, 0, 90, 90]);
    expect(items.filter(item => item.selected).map(item => item.name)).toEqual(['Valid', 'Broken']);
    expect(items.every(item => Number.isFinite(item.estimatedPrice))).toBe(true);
  });

  it('keeps legacy Wishlist records as Item Plans and normalizes optional target dates', () => {
    const [legacy, typed, invalid] = normalizeWishlistItems([
      { name: 'Legacy plan', targetDate: '2026-02-03' },
      { name: 'Travel plan', type: 'travel', targetDate: '2026-03-04' },
      { name: 'Unknown type', type: 'not-a-plan-type', targetDate: 'not-a-date' },
    ], now);

    expect(legacy.type).toBeUndefined();
    expect(legacy.targetDate ? new Date(legacy.targetDate).toISOString().slice(0, 10) : undefined).toBe('2026-02-03');
    expect(typed.type).toBe('travel');
    expect(typed.targetDate ? new Date(typed.targetDate).toISOString().slice(0, 10) : undefined).toBe('2026-03-04');
    expect(invalid.type).toBeUndefined();
    expect(invalid.targetDate).toBeUndefined();
  });

  it('preserves custom skincare taxonomy values and normalizes lifecycle numbers', () => {
    const [product] = normalizeSkincareProducts([{
      name: 'Legacy serum',
      category: 'Sensitive area',
      purchasePrice: 'Infinity',
      currentPrice: -5,
      estimatedDuration: 0,
      purchaseDate: '2026-02-28',
      startDate: '2026-03-01',
    }], now);

    expect(product.category).toBe('Sensitive area');
    expect(product.purchasePrice).toBeUndefined();
    expect(product.currentPrice).toBe(0);
    expect(product.estimatedDuration).toBe(1);
    expect(product.purchaseDate?.getDate()).toBe(28);
    expect(product.startDate?.getDate()).toBe(1);
  });

  it('parses decimal legacy dosage without losing structured meaning', () => {
    const [supplement] = normalizeSupplements([{
      name: 'Legacy powder',
      dosage: '2.5 grams, 1.5x daily',
      quantityRemaining: '30',
      startDate: '2026-04-01',
      expiryDate: '2026-12-31',
    }], now);

    expect(supplement.dosageAmount).toBe(2.5);
    expect(supplement.dosageUnit).toBe('grams');
    expect(supplement.dailyIntake).toBe(1.5);
    expect(supplement.dosage).toBe('2.5 grams, 1.5x daily');
    expect(supplement.quantityRemaining).toBe(30);
    expect(supplement.startDate?.getMonth()).toBe(3);
    expect(supplement.startDate?.getDate()).toBe(1);
  });

  it('normalizes optional supplement current price without affecting legacy records', () => {
    const [known, missing, invalid] = normalizeSupplements([
      { name: 'Known', purchasePrice: 100, currentPrice: '125' },
      { name: 'Missing', purchasePrice: 100 },
      { name: 'Invalid', purchasePrice: 100, currentPrice: 'Infinity' },
    ], now);

    expect(known.currentPrice).toBe(125);
    expect(missing.currentPrice).toBeUndefined();
    expect(invalid.currentPrice).toBeUndefined();
  });
});

describe('Audit #14 remediation contracts', () => {
  it('keeps the shared nested-dialog selector fix in both combobox variants', () => {
    const source = read('components/ui/combobox.tsx');
    expect(source).toContain('modal={false}');
    expect(source).toContain('onOpenAutoFocus={event => event.preventDefault()}');
  });

  it('normalizes collections at profile, import, and mutation boundaries', () => {
    const context = read('lib/context.tsx');
    const profile = read('lib/profile/normalize-profile.ts');

    expect(context).toContain('normalizeInventoryItems(updates.inventoryItems)');
    expect(context).toContain('normalizeWishlistItems(updates.wishlistItems)');
    expect(context).toContain('normalizeSkincareProducts(updates.skincareProducts)');
    expect(context).toContain('normalizeSupplements(updates.supplements)');
    expect(context).toContain('normalizeInventoryItems(imported.inventoryItems)');
    expect(context).toContain('normalizeSupplements(imported.supplements)');
    expect(profile).toContain('normalizeWishlistItems(profile?.wishlistItems)');
    expect(profile).toContain('normalizeSkincareProducts(profile?.skincareProducts)');
    expect(profile).toContain('normalizeSupplements(profile?.supplements)');
  });

  it('keeps exact search requests one-shot and profile-scoped for collections', () => {
    const page = read('app/app/page.tsx');
    const inventory = read('components/sections/InventorySection.tsx');
    const wishlist = read('components/sections/WishlistSection.tsx');
    const skincare = read('components/sections/SkincareSection.tsx');

    expect(page).toContain('consumeCollectionFeatureRequest');
    expect(page).toContain("sectionFeatureRequest?.profileId === appContext.currentProfileId");
    expect(inventory).toContain('consumedRequestSignalRef');
    expect(wishlist).toContain('consumedRequestSignalRef');
    expect(skincare).toContain('consumedRequestSignalRef');
  });

  it('keeps collection forms and actions associated with accessible names', () => {
    const inventory = read('components/sections/InventorySection.tsx');
    const wishlist = read('components/sections/WishlistSection.tsx');
    const skincareModal = read('components/modals/SkincareModal.tsx');
    const supplementModal = read('components/modals/SupplementModal.tsx');

    expect(inventory).toContain('aria-label="Search inventory"');
    expect(inventory).toContain('aria-label={`Actions for ${item.name}`}');
    expect(inventory).toContain("label: 'Move item to Trash'");
    expect(wishlist).toContain('Move purchase plan to Trash');
    expect(skincareModal).toContain('controlId=');
    expect(supplementModal).toContain('htmlFor?: string');
  });
});
