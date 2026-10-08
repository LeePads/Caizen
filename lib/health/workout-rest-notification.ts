import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeApp } from '../platform';
import { getNotificationPermission, stableNotificationId } from '../native/notifications';

/**
 * A single ephemeral "rest over" local notification for the active workout.
 * Deliberately outside the declarative reminder system in
 * lib/native/notifications.ts (channels, reconcileNotifications): this is a
 * real-time, one-shot cue tied to the runner's live rest timer, not a
 * persisted reminder to reconcile against profile data. No backend, no
 * cloud dependency — it only schedules/cancels a local OS notification.
 */

const CHANNEL_ID = 'caizen-workout-rest';
let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (!isNativeApp() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Caizen Workout',
      description: 'Rest-over cues during an active guided workout',
      importance: 4,
      visibility: 0,
      vibration: true,
    });
    channelReady = true;
  } catch {
    // Best effort: a channel failure should not block the in-app timer.
  }
}

function restNotificationId(profileId: string): number {
  return stableNotificationId(profileId, 'active-workout', 'rest-over');
}

/** Schedules the rest-over cue at `atMs`. Native app only; no-ops on web (in-app countdown already covers that surface). */
export async function scheduleRestOverNotification(
  profileId: string,
  exerciseName: string,
  atMs: number,
): Promise<void> {
  if (!isNativeApp() || !profileId.trim() || atMs <= Date.now()) return;
  try {
    const permission = await getNotificationPermission();
    if (permission.display !== 'granted') return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: restNotificationId(profileId),
          title: 'Rest over',
          body: `Time for your next set${exerciseName ? `: ${exerciseName}` : ''}.`,
          channelId: CHANNEL_ID,
          extra: { caizenWorkoutRest: true, profileId },
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // Rest-over notification is a nice-to-have; never let it break the runner.
  }
}

/** Cancels a pending rest-over cue (rest skipped, paused, or the workout left/ended). */
export async function cancelRestOverNotification(profileId: string): Promise<void> {
  if (!isNativeApp() || !profileId.trim()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: restNotificationId(profileId) }] });
  } catch {
    // Best effort cancellation; a stray notification is not worth surfacing an error for.
  }
}
