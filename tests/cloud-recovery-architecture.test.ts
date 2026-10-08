import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('background Cloud recovery safety boundary', () => {
  it('keeps restore and media download out of the background coordinator', () => {
    const page = readFileSync('app/app/page.tsx', 'utf8');
    const start = page.indexOf('const runCloudReconciliation = useCallback');
    const end = page.indexOf('const scheduleCloudReconciliation = useCallback', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const coordinator = page.slice(start, end);
    expect(coordinator).toContain('discoverCloudRecovery');
    expect(coordinator).not.toContain('getCloudBootstrapBackup');
    expect(coordinator).not.toContain('restoreCloudDataToLocal');
    expect(coordinator).not.toContain('restoreCloudMediaToLocal');
    expect(coordinator).not.toContain('inspectCloudReconciliation');
  });
});

