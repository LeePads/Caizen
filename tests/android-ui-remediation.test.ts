import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('focused Android UI remediation contracts', () => {
  it('uses platform-aware shared sheets for selections and entry actions', () => {
    const nativeDesign = read('components/native/android-design.tsx');
    const actions = read('components/common/EntryActionSheet.tsx');
    const platform = read('app/app/page.tsx');
    const styles = read('app/globals.css');

    expect(nativeDesign).toContain('export function AndroidAdaptiveCreatableSelect');
    expect(nativeDesign).toContain('<CaizenSelectionSheet');
    expect(actions).toContain('androidPresentation?: boolean;');
    expect(actions).toContain('<CaizenBottomSheet');
    expect(platform).toContain('setAndroidPresentation(isAndroid());');
    expect(styles).toContain('background: var(--android-scrim);');
  });

  it('keeps plan filters compact and preserves desktop controls', () => {
    const plans = read('components/sections/WishlistSection.tsx');

    expect(plans).toContain('data-android-plan-toolbar="true"');
    expect(plans).toContain('data-android-plan-filters="true"');
    expect(plans).toContain('Clear filters');
    expect(plans).toContain('<DropdownMenu');
    expect(plans).toContain('androidPresentation={androidPresentation}');
  });

  it('routes Android Inventory, Skincare, and Vault card actions through sheets', () => {
    const inventory = read('components/sections/InventorySection.tsx');
    const skincare = read('components/sections/SkincareSection.tsx');
    const vault = read('components/sections/PersonalVaultSection.tsx');

    expect(inventory).toContain('getInventoryActions');
    expect(inventory).toContain('<EntryActionSheet');
    expect(inventory).toContain('androidPresentation={androidPresentation}');
    expect(skincare).toContain('getSkincareActions');
    expect(skincare).toContain('<EntryActionSheet');
    expect(skincare).toContain('androidPresentation={androidPresentation}');
    expect(vault).toContain('getVaultActions');
    expect(vault).toContain('<EntryActionSheet');
    expect(vault).toContain('!androidPresentation');
  });

  it('keeps Android form selectors searchable and closes photo sheets from the scrim', () => {
    const inventoryModal = read('components/modals/InventoryModal.tsx');
    const skincareModal = read('components/modals/SkincareModal.tsx');
    const photoSheet = read('components/common/PhotoSourceSheet.tsx');
    const vaultModal = read('components/modals/PersonalVaultModal.tsx');
    const vault = read('components/sections/PersonalVaultSection.tsx');
    const styles = read('app/globals.css');

    expect(inventoryModal).toContain('<AndroidAdaptiveCreatableSelect');
    expect(skincareModal).toContain('<AndroidAdaptiveCreatableSelect');
    expect(vaultModal).toContain('<AndroidAdaptiveCreatableSelect');
    expect(photoSheet).toContain('onClick={close}');
    expect(vault).toContain('data-android-vault-filters="true"');
    expect(styles).toContain('.responsive-control-strip::-webkit-scrollbar');
  });
});
