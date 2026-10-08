import type { SkincareProductType } from '@/lib/types';

export const DEFAULT_SKINCARE_CATEGORIES = ['Face', 'Body', 'Hair', 'Oral', 'Other'];

export const SKINCARE_PRODUCT_TYPES: Array<{ value: SkincareProductType; label: string }> = [
  { value: 'cleanser', label: 'Cleanser' },
  { value: 'moisturizer', label: 'Moisturizer' },
  { value: 'serum', label: 'Serum' },
  { value: 'sunscreen', label: 'Sunscreen' },
  { value: 'toner', label: 'Toner' },
  { value: 'mask', label: 'Mask' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'shampoo', label: 'Shampoo' },
  { value: 'conditioner', label: 'Conditioner' },
  { value: 'body-wash', label: 'Body wash' },
  { value: 'deodorant', label: 'Deodorant' },
  { value: 'oral-care', label: 'Oral care' },
  { value: 'other', label: 'Other' },
];

export const SKINCARE_PRODUCT_TYPE_LABELS = Object.fromEntries(
  SKINCARE_PRODUCT_TYPES.map(({ value, label }) => [value, label]),
) as Record<SkincareProductType, string>;
