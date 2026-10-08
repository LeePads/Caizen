export type FinancialIconGroup =
  | 'Food and drink'
  | 'Shopping'
  | 'Transport'
  | 'Home'
  | 'Bills and utilities'
  | 'Money and banking'
  | 'Work'
  | 'Health'
  | 'Entertainment'
  | 'Travel'
  | 'Education'
  | 'Family'
  | 'Pets'
  | 'Technology'
  | 'Sports'
  | 'Gifts and celebrations'
  | 'General';

export type FinancialIconDefinition = {
  id: string;
  label: string;
  group: FinancialIconGroup;
  keywords: string[];
  suggestionKeywords?: string[];
};

export const FINANCIAL_ICON_FALLBACK = 'folder';

/**
 * Keep this catalog deliberately finite. Persisted category values are stable
 * keys, while the Lucide components that render them stay in the UI layer.
 */
export const FINANCIAL_ICON_CATALOG: readonly FinancialIconDefinition[] = [
  { id: 'utensils', label: 'Utensils', group: 'Food and drink', keywords: ['food', 'meal', 'restaurant', 'dining'], suggestionKeywords: ['food', 'dining', 'restaurant', 'meal'] },
  { id: 'coffee', label: 'Coffee', group: 'Food and drink', keywords: ['cafe', 'drink', 'coffee', 'tea'], suggestionKeywords: ['coffee', 'cafe', 'tea'] },
  { id: 'cup-soda', label: 'Drinks', group: 'Food and drink', keywords: ['beverage', 'soda', 'drink'], suggestionKeywords: ['drink', 'beverage'] },
  { id: 'cake-slice', label: 'Cake', group: 'Food and drink', keywords: ['dessert', 'birthday', 'bakery'], suggestionKeywords: ['cake', 'dessert', 'bakery'] },
  { id: 'apple', label: 'Fresh food', group: 'Food and drink', keywords: ['fruit', 'grocery', 'healthy'], suggestionKeywords: ['grocery', 'food'] },
  { id: 'salad', label: 'Salad', group: 'Food and drink', keywords: ['food', 'healthy', 'meal'], suggestionKeywords: ['salad', 'healthy'] },
  { id: 'pizza', label: 'Pizza', group: 'Food and drink', keywords: ['food', 'takeout', 'meal'], suggestionKeywords: ['pizza', 'takeout'] },
  { id: 'cooking-pot', label: 'Cooking', group: 'Food and drink', keywords: ['food', 'kitchen', 'meal'], suggestionKeywords: ['cooking', 'kitchen'] },
  { id: 'ice-cream-bowl', label: 'Ice cream', group: 'Food and drink', keywords: ['dessert', 'food'], suggestionKeywords: ['ice cream', 'dessert'] },
  { id: 'wine', label: 'Wine', group: 'Food and drink', keywords: ['drink', 'restaurant'], suggestionKeywords: ['wine', 'drink'] },

  { id: 'shopping-bag', label: 'Shopping bag', group: 'Shopping', keywords: ['shopping', 'retail', 'clothes'], suggestionKeywords: ['shopping', 'shop'] },
  { id: 'shopping-cart', label: 'Shopping cart', group: 'Shopping', keywords: ['shopping', 'groceries', 'retail'], suggestionKeywords: ['shopping', 'groceries'] },
  { id: 'shopping-basket', label: 'Shopping basket', group: 'Shopping', keywords: ['shopping', 'groceries'], suggestionKeywords: ['shopping', 'groceries'] },
  { id: 'shirt', label: 'Clothing', group: 'Shopping', keywords: ['clothes', 'fashion', 'shopping'], suggestionKeywords: ['clothing', 'clothes', 'fashion'] },
  { id: 'store', label: 'Store', group: 'Shopping', keywords: ['shop', 'retail', 'shopping'], suggestionKeywords: ['store', 'shop'] },
  { id: 'tags', label: 'Tags', group: 'Shopping', keywords: ['sale', 'label', 'shopping'], suggestionKeywords: ['sale', 'shopping'] },
  { id: 'package', label: 'Package', group: 'Shopping', keywords: ['delivery', 'parcel', 'shopping'], suggestionKeywords: ['delivery', 'package'] },
  { id: 'gift', label: 'Gift', group: 'Shopping', keywords: ['present', 'shopping', 'birthday'], suggestionKeywords: ['gift', 'present'] },

  { id: 'car-front', label: 'Car', group: 'Transport', keywords: ['car', 'transport', 'vehicle', 'fuel'], suggestionKeywords: ['car', 'transport', 'vehicle'] },
  { id: 'car-taxi-front', label: 'Taxi', group: 'Transport', keywords: ['taxi', 'car', 'transport'], suggestionKeywords: ['taxi'] },
  { id: 'bus-front', label: 'Bus', group: 'Transport', keywords: ['bus', 'commute', 'transport'], suggestionKeywords: ['bus', 'commute'] },
  { id: 'train-front', label: 'Train', group: 'Transport', keywords: ['train', 'commute', 'transport'], suggestionKeywords: ['train', 'commute'] },
  { id: 'bike', label: 'Bike', group: 'Transport', keywords: ['bike', 'cycling', 'transport'], suggestionKeywords: ['bike', 'cycling'] },
  { id: 'fuel', label: 'Fuel', group: 'Transport', keywords: ['gas', 'petrol', 'fuel', 'car'], suggestionKeywords: ['fuel', 'gas', 'petrol'] },
  { id: 'plane', label: 'Flight', group: 'Transport', keywords: ['flight', 'airfare', 'travel'], suggestionKeywords: ['flight', 'airfare'] },
  { id: 'map-pinned', label: 'Transport route', group: 'Transport', keywords: ['map', 'route', 'travel'], suggestionKeywords: ['transport', 'route'] },

  { id: 'home', label: 'Home', group: 'Home', keywords: ['house', 'rent', 'home'], suggestionKeywords: ['home', 'house', 'rent'] },
  { id: 'building-2', label: 'Building', group: 'Home', keywords: ['house', 'apartment', 'home'], suggestionKeywords: ['apartment', 'building'] },
  { id: 'bed-double', label: 'Bedroom', group: 'Home', keywords: ['bed', 'home', 'furniture'], suggestionKeywords: ['bedroom', 'bed'] },
  { id: 'key-round', label: 'Keys', group: 'Home', keywords: ['home', 'rent', 'security'], suggestionKeywords: ['rent', 'home'] },
  { id: 'hammer', label: 'Repairs', group: 'Home', keywords: ['repair', 'maintenance', 'home'], suggestionKeywords: ['repair', 'maintenance'] },
  { id: 'wrench', label: 'Maintenance', group: 'Home', keywords: ['repair', 'service', 'home'], suggestionKeywords: ['maintenance', 'repair'] },
  { id: 'lightbulb', label: 'Home ideas', group: 'Home', keywords: ['home', 'electricity', 'ideas'], suggestionKeywords: ['home'] },
  { id: 'sofa', label: 'Furniture', group: 'Home', keywords: ['home', 'furniture'], suggestionKeywords: ['furniture'] },
  { id: 'bath', label: 'Bathroom', group: 'Home', keywords: ['home', 'bathroom'], suggestionKeywords: ['bathroom'] },
  { id: 'refrigerator', label: 'Appliances', group: 'Home', keywords: ['home', 'appliance', 'kitchen'], suggestionKeywords: ['appliance', 'kitchen'] },

  { id: 'receipt', label: 'Receipt', group: 'Bills and utilities', keywords: ['bill', 'receipt', 'payment'], suggestionKeywords: ['bill', 'receipt'] },
  { id: 'receipt-text', label: 'Bills', group: 'Bills and utilities', keywords: ['bill', 'invoice', 'payment'], suggestionKeywords: ['bill', 'invoice'] },
  { id: 'zap', label: 'Electricity', group: 'Bills and utilities', keywords: ['electricity', 'power', 'utility'], suggestionKeywords: ['electricity', 'power'] },
  { id: 'wifi', label: 'Internet', group: 'Bills and utilities', keywords: ['internet', 'wifi', 'utility'], suggestionKeywords: ['internet', 'wifi'] },
  { id: 'smartphone', label: 'Phone', group: 'Bills and utilities', keywords: ['mobile', 'phone', 'utility'], suggestionKeywords: ['phone', 'mobile'] },
  { id: 'tv', label: 'Television', group: 'Bills and utilities', keywords: ['tv', 'cable', 'subscription'], suggestionKeywords: ['tv', 'cable'] },
  { id: 'shield-check', label: 'Insurance', group: 'Bills and utilities', keywords: ['insurance', 'protection', 'bill'], suggestionKeywords: ['insurance'] },

  { id: 'landmark', label: 'Bank', group: 'Money and banking', keywords: ['bank', 'account', 'money'], suggestionKeywords: ['bank', 'banking'] },
  { id: 'wallet-cards', label: 'Wallet', group: 'Money and banking', keywords: ['wallet', 'money', 'cash'], suggestionKeywords: ['wallet', 'cash'] },
  { id: 'wallet', label: 'Cash wallet', group: 'Money and banking', keywords: ['wallet', 'cash', 'money'], suggestionKeywords: ['cash', 'wallet'] },
  { id: 'credit-card', label: 'Credit card', group: 'Money and banking', keywords: ['card', 'credit', 'payment'], suggestionKeywords: ['credit', 'card'] },
  { id: 'banknote', label: 'Banknote', group: 'Money and banking', keywords: ['cash', 'money', 'income'], suggestionKeywords: ['cash', 'money'] },
  { id: 'coins', label: 'Coins', group: 'Money and banking', keywords: ['cash', 'money', 'savings'], suggestionKeywords: ['savings', 'money'] },
  { id: 'piggy-bank', label: 'Savings', group: 'Money and banking', keywords: ['savings', 'money', 'bank'], suggestionKeywords: ['savings'] },
  { id: 'hand-coins', label: 'Money received', group: 'Money and banking', keywords: ['income', 'salary', 'money'], suggestionKeywords: ['income', 'salary'] },
  { id: 'badge-dollar-sign', label: 'Money goal', group: 'Money and banking', keywords: ['money', 'goal', 'income'], suggestionKeywords: ['goal', 'money'] },
  { id: 'circle-dollar-sign', label: 'Payment', group: 'Money and banking', keywords: ['money', 'payment', 'income'], suggestionKeywords: ['payment', 'income'] },

  { id: 'briefcase', label: 'Work', group: 'Work', keywords: ['work', 'job', 'business'], suggestionKeywords: ['work', 'job'] },
  { id: 'briefcase-business', label: 'Business', group: 'Work', keywords: ['work', 'business', 'freelance'], suggestionKeywords: ['business', 'freelance'] },
  { id: 'factory', label: 'Industry', group: 'Work', keywords: ['work', 'business', 'industry'], suggestionKeywords: ['industry'] },
  { id: 'file-key', label: 'Contract', group: 'Work', keywords: ['work', 'contract', 'document'], suggestionKeywords: ['contract'] },
  { id: 'calculator', label: 'Accounting', group: 'Work', keywords: ['work', 'finance', 'tax'], suggestionKeywords: ['accounting', 'tax'] },
  { id: 'presentation', label: 'Presentation', group: 'Work', keywords: ['work', 'meeting', 'business'], suggestionKeywords: ['presentation', 'meeting'] },

  { id: 'heart-pulse', label: 'Health', group: 'Health', keywords: ['health', 'medical', 'doctor'], suggestionKeywords: ['health', 'doctor'] },
  { id: 'stethoscope', label: 'Doctor', group: 'Health', keywords: ['health', 'doctor', 'medical'], suggestionKeywords: ['doctor', 'clinic'] },
  { id: 'pill', label: 'Medicine', group: 'Health', keywords: ['health', 'medicine', 'pharmacy'], suggestionKeywords: ['medicine', 'pharmacy'] },
  { id: 'dumbbell', label: 'Fitness', group: 'Health', keywords: ['health', 'gym', 'exercise'], suggestionKeywords: ['fitness', 'gym'] },
  { id: 'brain', label: 'Mental health', group: 'Health', keywords: ['health', 'therapy', 'wellness'], suggestionKeywords: ['therapy', 'wellness'] },
  { id: 'hospital', label: 'Hospital', group: 'Health', keywords: ['health', 'medical', 'clinic'], suggestionKeywords: ['hospital', 'clinic'] },
  { id: 'accessibility', label: 'Care', group: 'Health', keywords: ['health', 'care', 'support'], suggestionKeywords: ['care'] },
  { id: 'activity', label: 'Wellness', group: 'Health', keywords: ['health', 'wellness', 'activity'], suggestionKeywords: ['wellness'] },

  { id: 'film', label: 'Movies', group: 'Entertainment', keywords: ['movie', 'film', 'cinema'], suggestionKeywords: ['movie', 'film', 'cinema'] },
  { id: 'gamepad-2', label: 'Games', group: 'Entertainment', keywords: ['game', 'gaming', 'entertainment'], suggestionKeywords: ['game', 'gaming'] },
  { id: 'music-2', label: 'Music', group: 'Entertainment', keywords: ['music', 'concert', 'entertainment'], suggestionKeywords: ['music', 'concert'] },
  { id: 'book-open', label: 'Books', group: 'Entertainment', keywords: ['book', 'reading', 'entertainment'], suggestionKeywords: ['book', 'reading'] },
  { id: 'ticket', label: 'Tickets', group: 'Entertainment', keywords: ['ticket', 'event', 'entertainment'], suggestionKeywords: ['ticket', 'event'] },
  { id: 'camera', label: 'Photography', group: 'Entertainment', keywords: ['camera', 'photo', 'hobby'], suggestionKeywords: ['photo', 'photography'] },
  { id: 'theater', label: 'Theater', group: 'Entertainment', keywords: ['theater', 'show', 'entertainment'], suggestionKeywords: ['theater', 'show'] },

  { id: 'globe', label: 'Travel', group: 'Travel', keywords: ['travel', 'world', 'trip'], suggestionKeywords: ['travel', 'trip'] },
  { id: 'luggage', label: 'Luggage', group: 'Travel', keywords: ['travel', 'trip', 'baggage'], suggestionKeywords: ['luggage', 'travel'] },
  { id: 'sun', label: 'Holiday', group: 'Travel', keywords: ['travel', 'holiday', 'vacation'], suggestionKeywords: ['holiday', 'vacation'] },
  { id: 'mountain', label: 'Outdoors', group: 'Travel', keywords: ['travel', 'hiking', 'outdoors'], suggestionKeywords: ['hiking', 'outdoors'] },
  { id: 'anchor', label: 'Boat travel', group: 'Travel', keywords: ['travel', 'boat', 'vacation'], suggestionKeywords: ['boat'] },

  { id: 'graduation-cap', label: 'Education', group: 'Education', keywords: ['school', 'education', 'study'], suggestionKeywords: ['education', 'school'] },
  { id: 'school', label: 'School', group: 'Education', keywords: ['school', 'education', 'tuition'], suggestionKeywords: ['school', 'tuition'] },
  { id: 'library', label: 'Library', group: 'Education', keywords: ['book', 'school', 'education'], suggestionKeywords: ['library'] },
  { id: 'notebook-pen', label: 'Study supplies', group: 'Education', keywords: ['school', 'study', 'supplies'], suggestionKeywords: ['study', 'supplies'] },
  { id: 'pencil', label: 'Writing', group: 'Education', keywords: ['school', 'writing', 'supplies'], suggestionKeywords: ['writing'] },

  { id: 'users', label: 'Family', group: 'Family', keywords: ['family', 'people', 'household'], suggestionKeywords: ['family'] },
  { id: 'circle-user-round', label: 'Personal', group: 'Family', keywords: ['personal', 'people', 'self'], suggestionKeywords: ['personal'] },
  { id: 'user-round-plus', label: 'Support', group: 'Family', keywords: ['family', 'support', 'people'], suggestionKeywords: ['support'] },
  { id: 'baby', label: 'Baby', group: 'Family', keywords: ['baby', 'family', 'child'], suggestionKeywords: ['baby', 'child'] },
  { id: 'heart', label: 'Care and love', group: 'Family', keywords: ['family', 'care', 'gift'], suggestionKeywords: ['care', 'family'] },

  { id: 'paw-print', label: 'Pets', group: 'Pets', keywords: ['pet', 'animal', 'dog', 'cat'], suggestionKeywords: ['pet', 'pets'] },
  { id: 'dog', label: 'Dog', group: 'Pets', keywords: ['pet', 'dog', 'animal'], suggestionKeywords: ['dog'] },
  { id: 'cat', label: 'Cat', group: 'Pets', keywords: ['pet', 'cat', 'animal'], suggestionKeywords: ['cat'] },
  { id: 'bone', label: 'Pet care', group: 'Pets', keywords: ['pet', 'dog', 'care'], suggestionKeywords: ['pet care'] },

  { id: 'laptop', label: 'Laptop', group: 'Technology', keywords: ['technology', 'computer', 'work'], suggestionKeywords: ['laptop', 'computer'] },
  { id: 'monitor', label: 'Monitor', group: 'Technology', keywords: ['technology', 'computer', 'screen'], suggestionKeywords: ['monitor', 'computer'] },
  { id: 'keyboard', label: 'Computer accessories', group: 'Technology', keywords: ['technology', 'computer', 'accessories'], suggestionKeywords: ['keyboard', 'accessories'] },
  { id: 'router', label: 'Router', group: 'Technology', keywords: ['technology', 'internet', 'wifi'], suggestionKeywords: ['router', 'internet'] },
  { id: 'cloud', label: 'Cloud services', group: 'Technology', keywords: ['technology', 'internet', 'subscription'], suggestionKeywords: ['cloud', 'subscription'] },

  { id: 'trophy', label: 'Sports', group: 'Sports', keywords: ['sport', 'team', 'fitness'], suggestionKeywords: ['sport', 'sports'] },
  { id: 'medal', label: 'Achievement', group: 'Sports', keywords: ['sport', 'achievement', 'award'], suggestionKeywords: ['achievement'] },
  { id: 'target', label: 'Goals', group: 'Sports', keywords: ['goal', 'target', 'sport'], suggestionKeywords: ['goal', 'goals'] },
  { id: 'volleyball', label: 'Ball sports', group: 'Sports', keywords: ['sport', 'game', 'fitness'], suggestionKeywords: ['sport'] },

  { id: 'party-popper', label: 'Celebration', group: 'Gifts and celebrations', keywords: ['party', 'birthday', 'celebration'], suggestionKeywords: ['party', 'celebration'] },
  { id: 'sparkles', label: 'Special occasion', group: 'Gifts and celebrations', keywords: ['gift', 'celebration', 'special'], suggestionKeywords: ['special', 'occasion'] },
  { id: 'flower-2', label: 'Flowers', group: 'Gifts and celebrations', keywords: ['gift', 'flowers', 'celebration'], suggestionKeywords: ['flowers'] },
  { id: 'star', label: 'Favorite', group: 'Gifts and celebrations', keywords: ['favorite', 'gift', 'special'], suggestionKeywords: ['favorite'] },

  { id: 'folder', label: 'General', group: 'General', keywords: ['general', 'other', 'category'], suggestionKeywords: ['general', 'other'] },
  { id: 'calendar-days', label: 'Calendar', group: 'General', keywords: ['date', 'planning', 'general'], suggestionKeywords: ['calendar'] },
  { id: 'calendar-clock', label: 'Schedule', group: 'General', keywords: ['schedule', 'date', 'general'], suggestionKeywords: ['schedule'] },
  { id: 'circle-help', label: 'Other', group: 'General', keywords: ['other', 'general', 'miscellaneous'], suggestionKeywords: ['other', 'miscellaneous'] },
  { id: 'circle-dot', label: 'Miscellaneous', group: 'General', keywords: ['other', 'miscellaneous', 'general'], suggestionKeywords: ['miscellaneous'] },
  { id: 'leaf', label: 'Nature', group: 'General', keywords: ['nature', 'garden', 'general'], suggestionKeywords: ['nature', 'garden'] },
  { id: 'tree-pine', label: 'Garden', group: 'General', keywords: ['garden', 'nature', 'home'], suggestionKeywords: ['garden'] },
  { id: 'scissors', label: 'Personal care', group: 'General', keywords: ['hair', 'beauty', 'care'], suggestionKeywords: ['hair', 'beauty'] },
  { id: 'more-horizontal', label: 'More', group: 'General', keywords: ['other', 'general', 'miscellaneous'], suggestionKeywords: ['other'] },
] as const;

const catalogById = new Map(FINANCIAL_ICON_CATALOG.map(icon => [icon.id, icon]));

function normalizeIconSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function getFinancialIconDefinition(iconId: unknown) {
  return typeof iconId === 'string' ? catalogById.get(iconId.trim()) : undefined;
}

export function resolveFinancialIconId(iconId: unknown) {
  return getFinancialIconDefinition(iconId)?.id || FINANCIAL_ICON_FALLBACK;
}

export function resolveFinancialClassificationIconId(
  categoryIconId: unknown,
  subcategoryIconId?: unknown,
) {
  const subcategoryIcon = getFinancialIconDefinition(subcategoryIconId);
  if (subcategoryIcon) return subcategoryIcon.id;
  return resolveFinancialIconId(categoryIconId);
}

export function searchFinancialIcons(query: string, limit?: number) {
  const normalizedQuery = normalizeIconSearch(query);
  const maxResults = limit === undefined ? FINANCIAL_ICON_CATALOG.length : Math.max(0, limit);
  if (!normalizedQuery) return FINANCIAL_ICON_CATALOG.slice(0, maxResults);

  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);
  return FINANCIAL_ICON_CATALOG
    .filter(icon => {
      const searchable = [icon.id, icon.label, ...icon.keywords].map(normalizeIconSearch);
      return queryTokens.every(token => searchable.some(value => value.includes(token)));
    })
    .slice(0, maxResults);
}

export function suggestFinancialIcons(categoryName: string, limit = 3) {
  const normalizedName = normalizeIconSearch(categoryName);
  if (!normalizedName) return [];
  const tokens = normalizedName.split(/[^a-z0-9]+/).filter(Boolean);

  return FINANCIAL_ICON_CATALOG
    .map((icon, index) => {
      const searchable = [icon.id, icon.label, ...icon.keywords].map(normalizeIconSearch);
      const suggestionWords = (icon.suggestionKeywords || []).map(normalizeIconSearch);
      const score = tokens.reduce((total, token) => {
        if (suggestionWords.some(word => word === token)) return total + 4;
        if (searchable.some(value => value === token)) return total + 3;
        if (searchable.some(value => value.includes(token))) return total + 1;
        return total;
      }, 0);
      return { icon, score, index };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(item => item.icon);
}

export function normalizeFinancialIconId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
