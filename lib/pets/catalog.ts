import type { PetCostume, PetId, PetShopUnlock } from '../types';

export type PetShopCatalogEntry = {
  id: PetCostume;
  itemId: string;
  petId: PetId;
  name: string;
  description: string;
  image?: string;
  price: number;
  durationMs?: number;
};

/**
 * The existing legacy Pet Shop catalog. Keep this list as the single source
 * of truth for item identity and price; presentation consumes it without
 * changing the economy or approved artwork.
 */
export const PET_SHOP_CATALOG: readonly PetShopCatalogEntry[] = [
  {
    id: 'default',
    itemId: 'skin:mochi:default',
    petId: 'mochi',
    name: 'Classic Mochi',
    description: 'The original cozy Caizen look.',
    price: 0,
  },
  {
    id: 'dracula',
    itemId: 'skin:mochi:dracula',
    petId: 'mochi',
    name: 'Dracula',
    description: 'A tiny spooky look for late-night sessions.',
    image: '/pets/mochi/dracula.png.png',
    price: 1,
  },
  {
    id: 'wizard',
    itemId: 'skin:mochi:wizard',
    petId: 'mochi',
    name: 'Wizard',
    description: 'A magical look for thoughtful progress.',
    image: '/pets/mochi/wizard.png',
    price: 1,
    durationMs: 1800,
  },
];

const byItemId = new Map(PET_SHOP_CATALOG.map(item => [item.itemId, item]));
const byCostume = new Map(PET_SHOP_CATALOG.map(item => [item.id, item]));

export const isPetCostume = (value: unknown): value is PetCostume =>
  typeof value === 'string' && byCostume.has(value as PetCostume);

export const getPetShopItem = (itemId: unknown): PetShopCatalogEntry | undefined =>
  typeof itemId === 'string' ? byItemId.get(itemId) : undefined;

export const getPetShopItemForCostume = (
  costume: PetCostume,
): PetShopCatalogEntry | undefined => byCostume.get(costume);

export const unlockMatchesPetShopItem = (
  item: PetShopCatalogEntry,
  unlock: PetShopUnlock,
): boolean =>
  (unlock.petId === undefined || unlock.petId === item.petId) &&
  (unlock.costume === undefined || unlock.costume === item.id);
