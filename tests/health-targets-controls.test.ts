import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeHealth } from '@/lib/health/normalization';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Health and Life Hub target/control contracts', () => {
  it('keeps optional nutrient targets absent for legacy profiles and preserves configured values', () => {
    const legacy = normalizeHealth({});
    expect(legacy.targetCarbs).toBeUndefined();
    expect(legacy.targetFat).toBeUndefined();
    expect(legacy.targetFiber).toBeUndefined();
    expect(legacy.sugarLimit).toBeUndefined();

    const configured = normalizeHealth({ targetCarbs: 220, targetFat: 70, targetFiber: 25, sugarLimit: 40 });
    expect(configured).toMatchObject({ targetCarbs: 220, targetFat: 70, targetFiber: 25, sugarLimit: 40 });

    const blank = normalizeHealth({ targetCarbs: 0, targetFat: 0, targetFiber: 0, sugarLimit: 0 });
    expect(blank.targetCarbs).toBeUndefined();
    expect(blank.targetFat).toBeUndefined();
    expect(blank.targetFiber).toBeUndefined();
    expect(blank.sugarLimit).toBeUndefined();
  });

  it('uses the shared Select and keeps task ordering bounded', () => {
    const lifeHub = read('components/sections/LifeHubSection.tsx');
    expect(lifeHub).toContain('<Select value={taskSort}');
    expect(lifeHub).toContain('<SelectItem value="smart">Smart order</SelectItem>');
    expect(lifeHub).toContain('md:max-w-[26.25rem] md:flex-1');
    expect(lifeHub).toContain('aria-label={inboxViewCopy[inboxType].searchLabel}');
    expect(lifeHub).not.toContain('<select aria-label="Sort tasks"');
  });

  it('keeps Today complementary, exposes configured target details, and bounds fasting history display', () => {
    const health = read('components/sections/HealthSection.tsx');
    const fasting = read('components/health/HealthFastingWorkspace.tsx');
    const overview = read('components/health/HealthOverviewPanel.tsx');

    expect(health).toContain("label: 'BMI'");
    expect(health).toContain('const configuredOverviewCards');
    expect(health).toContain('const isLowFiber');
    expect(health).toContain("if (!target) return 'No target set'");
    expect(overview).toContain('More today');
    expect(fasting).toContain('PAGE_SIZE = 10');
    expect(fasting).toContain('totalPages > 1');
    expect(health).not.toContain('<details className="mt-6 border-t border-border/50 pt-4">');
  });

  it('aligns the Supplements toolbar with the mature collection layout', () => {
    const supplements = read('components/sections/SupplementsSection.tsx');
    expect(supplements).toContain('caizen-supplements-controls section-surface w-full p-4 sm:p-5');
    expect(supplements).toContain('label="Type"');
    expect(supplements).toContain('label="Schedule"');
    expect(supplements).toContain('label="Expiry state"');
    expect(supplements).toContain('<ViewModeToggle');
  });
});
