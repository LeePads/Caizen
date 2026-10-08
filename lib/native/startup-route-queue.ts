export type NativeNavigationTarget = {
  profileId?: string;
  section?: string;
  recordId?: string;
  action?: string;
  source?: string;
};

export type NativeReminderTarget = {
  profileId: string;
  section: string;
  recordId: string;
  kind: 'task' | 'routine' | 'calendar' | 'deadline' | 'health' | 'summary';
};

type NativeRouteListener = (target: NativeNavigationTarget) => void;

let pendingTarget: NativeNavigationTarget | null = null;
const listeners = new Set<NativeRouteListener>();

/** Retains the newest cold-start destination until the hydrated app can use it. */
export function enqueueNativeRoute(target: NativeNavigationTarget): void {
  if (listeners.size === 0) {
    pendingTarget = target;
    return;
  }

  for (const listener of listeners) listener(target);
}

/** Converts a notification target into the same queue used by native URLs. */
export function enqueueNativeReminderRoute(target: NativeReminderTarget): void {
  let action: string | undefined;
  switch (target.kind) {
    case 'task':
      action = 'tasks';
      break;
    case 'routine':
      action = 'routine';
      break;
    case 'calendar':
    case 'deadline':
      action = target.section === 'balance' ? 'money-item' : 'dates';
      break;
    case 'health':
      action = 'supplements';
      break;
    default:
      action = undefined;
  }

  enqueueNativeRoute({
    profileId: target.profileId,
    section: target.section,
    recordId: target.recordId,
    action,
    source: 'notification',
  });
}

export function takePendingNativeRoute(): NativeNavigationTarget | null {
  const target = pendingTarget;
  pendingTarget = null;
  return target;
}

export function subscribeToNativeRoutes(
  listener: NativeRouteListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetNativeRouteQueueForTests(): void {
  pendingTarget = null;
  listeners.clear();
}
