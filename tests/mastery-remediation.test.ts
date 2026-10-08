import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('Mastery remediation contracts', () => {
  it('routes milestone effects through the committed transition path', () => {
    const dashboard = source('components/sections/Dashboard.tsx');
    const trophyRoom = source('components/sections/TrophyRoom.tsx');

    expect(dashboard).toContain('getEffectiveMilestoneAchievements');
    expect(dashboard).toContain('milestoneUnlocks');
    expect(dashboard).toContain('TrophyRoomPanel');
    expect(dashboard).not.toContain('awardCategoryXp');
    expect(dashboard).not.toContain('awardPetReward');
    expect(trophyRoom).toContain('milestones.map');
  });

  it('exposes ten fixed milestone cards without legacy progression meters', () => {
    const trophyRoom = source('components/sections/TrophyRoom.tsx');

    expect(trophyRoom).toContain('milestones.length || 10');
    expect(trophyRoom).toContain('Not yet achieved');
    expect(trophyRoom).not.toContain('role="progressbar"');
    expect(trophyRoom).not.toContain('masteryPaths');
    expect(trophyRoom).not.toContain('bond');
  });
});
