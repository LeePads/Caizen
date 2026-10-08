/** Best-effort cleanup of auxiliary state owned by a deleted profile. */
export function clearMochiProfileState(profileId: string): void {
  if (typeof window === 'undefined' || !profileId) return;
  try {
    const voicePrefix = `mochi-voice-variant:${profileId}:`;
    const keys = [
      `mochi-spotlight:${profileId}`,
      `mochi-floating-hidden:${profileId}`,
      `discovery-dismissed:${profileId}`,
    ];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(voicePrefix)) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // Cosmetic state may remain when auxiliary storage is unavailable.
  }
}
