import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Life Hub routine list order', () => {
  const lifeHub = read('components/sections/LifeHubSection.tsx');

  it('opens routines on Daily while keeping All as the leftmost filter', () => {
    expect(lifeHub).toContain("const [routineFilter, setRoutineFilter] = useState<RoutineFilter>('daily');");
    expect(lifeHub).toContain("['all', 'All'],\n  ['daily', 'Daily'],");
    expect(lifeHub).toContain("if (activeTab === 'routine' && previousActiveTabRef.current !== 'routine')");
  });

  it('sorts routine occurrences by their planned time', () => {
    expect(lifeHub).toContain(".sort(compareRoutinePlannedTime)");
  });
});
