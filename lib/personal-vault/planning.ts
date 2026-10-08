import type { PersonalVaultItem, PersonalVaultType } from "../types";

export type PersonalVaultPlanningProjection = {
  id: string;
  title: string;
  type: PersonalVaultType;
  date: Date | null;
  expiryDate: Date | null;
};

const copyValidDate = (value: Date | null | undefined) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Date(value);
};

/**
 * Returns the only Vault data allowed to cross into planning surfaces.
 * A date is required because an undated title has no planning use case.
 */
export function personalVaultPlanningProjection(
  item: PersonalVaultItem,
): PersonalVaultPlanningProjection | null {
  if (item.showTitleInPlanning !== true) return null;

  const date = copyValidDate(item.date);
  const expiryDate = copyValidDate(item.expiryDate);
  if (!date && !expiryDate) return null;

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    date,
    expiryDate,
  };
}
