import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Workout photo capture regression', () => {
  const modal = read('components/modals/WorkoutModal.tsx');
  const healthSection = read('components/sections/HealthSection.tsx');
  const types = read('lib/types.ts');

  it('does not offer workout photo capture or upload in the activity modal', () => {
    expect(modal).not.toContain('onPaste={handlePhotoPaste}');
    expect(modal).not.toContain('mediaStorage.save(blob');
    expect(modal).not.toContain('Add a workout photo');
    expect(modal).not.toContain('Upload image');
    expect(modal).not.toContain('Workout photo URL');
  });

  it('keeps photo references optional and passes them through the health save path', () => {
    expect(types).toContain('photoAssetIds?: string[];');
    expect(types).toContain('imageUrl?: string;');
    expect(healthSection).toContain('profileId={currentProfileId}');
    expect(healthSection).toContain('photoAssetIds: draft.photoAssetIds');
    expect(healthSection).toContain("reason: 'attachment-detached'");
  });
});
