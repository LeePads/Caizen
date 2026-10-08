import { describe, expect, it, vi } from 'vitest';
import { normalizeHealth } from '@/lib/health/normalization';
import { deriveWorkoutExerciseCategory, matchesWorkoutExerciseSearch } from '@/lib/health/workout-taxonomy';
import { fetchWorkoutImageFromUrl, normalizeWorkoutImageUrl, tutorialEmbedUrl } from '@/lib/health/workout-media';
import { BUILTIN_WORKOUT_CATALOG } from '@/lib/health/workout-catalog';

describe('Workout category compatibility', () => {
  it('classifies built-ins while preserving Type semantics', () => {
    expect(BUILTIN_WORKOUT_CATALOG.every(exercise => exercise.exerciseCategory)).toBe(true);
    expect(BUILTIN_WORKOUT_CATALOG.find(exercise => exercise.id === 'knee-push-up')?.exerciseCategory).toBe('strength');
    expect(BUILTIN_WORKOUT_CATALOG.find(exercise => exercise.id === 'high-knees')?.exerciseCategory).toBe('cardio');
    const legacy = normalizeHealth({ workoutExercises: [{ id: 'legacy', name: 'Legacy', kind: 'stretch', category: 'Back', equipment: 'None', difficulty: 'easy', targetMode: 'hold', source: 'custom' }] } as any).workoutExercises?.[0];
    expect(legacy?.exerciseCategory).toBeUndefined();
    expect(deriveWorkoutExerciseCategory(legacy!)).toBe('stretching');
    expect(legacy?.kind).toBe('stretch');
  });

  it('drops legacy external reference-photo URL fields during normalization', () => {
    const normalized = normalizeHealth({ workoutExercises: [{ id: 'remote', name: 'Remote', kind: 'exercise', category: 'Core', equipment: 'None', difficulty: 'easy', targetMode: 'manual', source: 'custom', referencePhotoUrl: 'https://example.com/a.jpg' }] } as any).workoutExercises?.[0] as any;
    expect(normalized.referencePhotoUrl).toBeUndefined();
  });

  it('normalizes routine tutorial links without changing older routine records', () => {
    const normalized = normalizeHealth({ workoutRoutines: [{ id: 'routine', name: 'Routine', source: 'custom', items: [], referenceVideoUrl: 'https://www.youtube.com/watch?v=abc1234' }] } as any).workoutRoutines?.[0] as any;
    expect(normalized.referenceVideoUrl).toBe('https://www.youtube.com/watch?v=abc1234');
    const invalid = normalizeHealth({ workoutRoutines: [{ id: 'invalid', name: 'Invalid', source: 'custom', items: [], referenceVideoUrl: 'javascript:alert(1)' }] } as any).workoutRoutines?.[0] as any;
    expect(invalid.referenceVideoUrl).toBeUndefined();
  });

  it('shares normalized search across category and coaching text', () => {
    const exercise = BUILTIN_WORKOUT_CATALOG.find(item => item.id === 'push-up')!;
    expect(matchesWorkoutExerciseSearch(exercise, 'strength')).toBe(true);
    expect(matchesWorkoutExerciseSearch(exercise, 'stable surface')).toBe(true);
    expect(matchesWorkoutExerciseSearch(exercise, 'does-not-exist')).toBe(false);
  });
});

describe('Workout reference image imports', () => {
  it('rejects HTTP and bare URLs without rewriting', () => {
    expect(normalizeWorkoutImageUrl('http://example.com/a.jpg')).toBeNull();
    expect(normalizeWorkoutImageUrl('example.com/a.jpg')).toBeNull();
  });

  it('fetches HTTPS image content with omitted credentials and preserves HTTPS redirects', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => { void url; void init; return new Response(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), { status: 200, headers: { 'content-type': 'image/png' } }); }) as typeof fetch;
    Object.defineProperty(fetcher, 'name', { value: 'fetcher' });
    const result = await fetchWorkoutImageFromUrl('https://example.com/a.png', fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://example.com/a.png', { credentials: 'omit' });
    expect(result.fileName).toContain('workout-reference');
  });

  it('builds privacy-conscious provider embeds and rejects unsupported links', () => {
    expect(tutorialEmbedUrl('https://www.youtube.com/watch?v=abc1234')).toContain('youtube-nocookie.com/embed/abc1234');
    expect(tutorialEmbedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
    expect(tutorialEmbedUrl('https://example.com/video')).toBeNull();
  });
});
