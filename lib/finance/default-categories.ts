import type { FinancialCategory } from '@/lib/types';

type StarterSubcategory = readonly [string, string, string];
type StarterCategory = readonly [string, 'income' | 'expense', string, readonly StarterSubcategory[]];

const STARTER_CATEGORIES: readonly StarterCategory[] = [
  ['Food', 'expense', 'utensils', [
    ['Dining', 'pizza', 'dining'],
    ['Groceries', 'shopping-basket', 'groceries'],
    ['Coffee & Snacks', 'coffee', 'coffee-snacks'],
  ]],
  ['Transportation', 'expense', 'car-front', [
    ['Public Transport', 'bus-front', 'public-transport'],
    ['Fuel', 'fuel', 'fuel'],
    ['Ride & Taxi', 'car-taxi-front', 'ride-taxi'],
    ['Parking & Tolls', 'map-pinned', 'parking-tolls'],
  ]],
  ['Home', 'expense', 'home', [
    ['Rent', 'key-round', 'rent'],
    ['Household', 'sofa', 'household'],
    ['Repairs', 'hammer', 'repairs'],
  ]],
  ['Bills & Utilities', 'expense', 'receipt-text', [
    ['Electricity', 'zap', 'electricity'],
    ['Internet', 'wifi', 'internet'],
    ['Mobile', 'smartphone', 'mobile'],
    ['Subscriptions', 'cloud', 'subscriptions'],
  ]],
  ['Health', 'expense', 'heart-pulse', [
    ['Medicine', 'pill', 'medicine'],
    ['Doctor & Clinic', 'stethoscope', 'doctor-clinic'],
    ['Personal Care', 'scissors', 'personal-care'],
  ]],
  ['Shopping', 'expense', 'shopping-bag', [
    ['Clothing', 'shirt', 'clothing'],
    ['Electronics', 'laptop', 'electronics'],
    ['General Shopping', 'shopping-cart', 'general-shopping'],
  ]],
  ['Entertainment', 'expense', 'ticket', [
    ['Movies', 'film', 'movies'],
    ['Music', 'music-2', 'music'],
    ['Games', 'gamepad-2', 'games'],
  ]],
  ['Family & Gifts', 'expense', 'users', [
    ['Family', 'heart', 'family'],
    ['Gifts', 'gift', 'gifts'],
    ['Support', 'user-round-plus', 'support'],
  ]],
  ['Education', 'expense', 'graduation-cap', [
    ['Books', 'book-open', 'books'],
    ['Courses', 'notebook-pen', 'courses'],
    ['School', 'school', 'school'],
  ]],
  ['Travel', 'expense', 'globe', [
    ['Accommodation', 'bed-double', 'accommodation'],
    ['Transport', 'plane', 'transport'],
    ['Activities', 'ticket', 'activities'],
  ]],
  ['Pets', 'expense', 'paw-print', [
    ['Pet Care', 'bone', 'pet-care'],
    ['Vet', 'hospital', 'vet'],
  ]],
  ['Salary', 'income', 'banknote', []],
  ['Freelance', 'income', 'briefcase-business', []],
  ['Business', 'income', 'factory', []],
  ['Allowance', 'income', 'hand-coins', []],
  ['Other Income', 'income', 'circle-dollar-sign', []],
] as const;

export function createDefaultFinancialCategories(): FinancialCategory[] {
  return STARTER_CATEGORIES.map(([name, type, icon, subcategories], categoryIndex) => ({
    id: `caizen-default-${type}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    type,
    name,
    icon,
    total: '0',
    kind: 'neutral',
    subcategories: subcategories.map(([subcategoryName, subcategoryIcon, slug], subcategoryIndex) => ({
      id: `caizen-default-${categoryIndex}-${slug}-${subcategoryIndex}`,
      name: subcategoryName,
      icon: subcategoryIcon,
      total: '0',
      kind: 'neutral',
    })),
  }));
}

/**
 * Controlled initialization helper for profiles that have no persisted
 * financial taxonomy. Normalization remains side-effect free; the provider
 * owns when this helper is allowed to write the returned profile.
 */
export function seedFinancialCategoriesIfEmpty<
  T extends { financialCategories?: FinancialCategory[] },
>(profile: T): T {
  if ((profile.financialCategories || []).length > 0) return profile;

  return {
    ...profile,
    financialCategories: createDefaultFinancialCategories(),
  };
}
