/**
 * Small, synthesized workout cues keep the runner self-contained. There is no
 * media asset to download, decode, cache, or license, which is especially
 * useful in the Android WebView.
 */

export type WorkoutSoundKind = 'countdown' | 'work' | 'rest' | 'set-complete' | 'complete';

type AudioContextConstructor = new () => AudioContext;

let workoutAudioContext: AudioContext | null = null;

function getWorkoutAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    (window.AudioContext as unknown as AudioContextConstructor | undefined) ||
    (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!AudioContextClass) return null;
  if (!workoutAudioContext || workoutAudioContext.state === 'closed') {
    workoutAudioContext = new AudioContextClass();
  }
  return workoutAudioContext;
}

export async function unlockWorkoutSound(): Promise<boolean> {
  const audioContext = getWorkoutAudioContext();
  if (!audioContext) return false;

  try {
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext.state === 'running';
  } catch {
    return false;
  }
}

function scheduleTone(audioContext: AudioContext, frequency: number, offset: number, duration: number, volume: number) {
  const startAt = audioContext.currentTime + offset;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

export async function playWorkoutSound(kind: WorkoutSoundKind): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  const unlocked = await unlockWorkoutSound();
  const audioContext = getWorkoutAudioContext();
  if (!unlocked || !audioContext) return;

  try {
    if (kind === 'countdown') {
      scheduleTone(audioContext, 660, 0, 0.1, 0.12);
      return;
    }

    if (kind === 'work') {
      scheduleTone(audioContext, 587.33, 0, 0.13, 0.14);
      scheduleTone(audioContext, 880, 0.14, 0.18, 0.11);
      return;
    }

    if (kind === 'rest') {
      scheduleTone(audioContext, 392, 0, 0.15, 0.13);
      scheduleTone(audioContext, 293.66, 0.16, 0.2, 0.1);
      return;
    }

    if (kind === 'set-complete') {
      scheduleTone(audioContext, 739.99, 0, 0.12, 0.12);
      scheduleTone(audioContext, 987.77, 0.13, 0.16, 0.1);
      return;
    }

    scheduleTone(audioContext, 523.25, 0, 0.12, 0.13);
    scheduleTone(audioContext, 659.25, 0.13, 0.12, 0.13);
    scheduleTone(audioContext, 783.99, 0.26, 0.2, 0.15);
  } catch {
    // Audio is enhancement-only. A device/browser audio failure must not affect the runner.
  }
}
