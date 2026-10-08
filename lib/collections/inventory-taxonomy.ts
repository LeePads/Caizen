export const INVENTORY_TAXONOMY_DEFAULTS: Record<string, string[]> = {
  personal_tech: ['Device', 'Audio', 'Accessory', 'Power', 'Cable', 'Storage', 'Other'],
  utilities: ['Everyday', 'Organizer', 'Grooming', 'Cleaning', 'Repair', 'Measuring', 'Travel', 'Other'],
  wearables: ['Top', 'Bottom', 'Underwear', 'Socks', 'Shoes', 'Bag', 'Outerwear', 'Accessory', 'Towel', 'Sleepwear', 'Other'],
  home: ['Furniture', 'Appliance', 'Bedding', 'Kitchen', 'Storage', 'Cleaning', 'Other'],
};

/** A comparison key for legacy Inventory categories; stored/display values remain untouched. */
export function normalizeInventoryCategoryKey(value?: string | null): string {
  const key = (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (!key) return 'utilities';
  if (key === 'electronics' || key === 'personal-tech' || key === 'personal tech') return 'personal_tech';
  if (key === 'appliances' || key === 'furniture') return 'home';
  if (key === 'clothing' || key === 'bags' || key === 'shoes') return 'wearables';
  return key;
}

/** Preserve custom category labels for editors while canonicalizing known legacy values. */
export function getInventoryCategoryEditorValue(value?: string | null, fallback = 'utilities'): string {
  const label = (value || '').trim();
  if (!label) return fallback;
  const key = normalizeInventoryCategoryKey(label);
  if (['personal_tech', 'utilities', 'wearables', 'home'].includes(key)) return key;
  return label;
}
