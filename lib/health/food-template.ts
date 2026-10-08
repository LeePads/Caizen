import type { FoodTemplate } from '../types';

export function findMatchingFoodTemplate(
  templates: readonly FoodTemplate[],
  name: string,
): FoodTemplate | undefined {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (!normalizedName) return undefined;
  return templates.find(template => template.name.trim().toLocaleLowerCase() === normalizedName);
}
