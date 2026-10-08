export type WorkSetupExitReason =
  | 'section-navigation'
  | 'profile-switch'
  | 'profile-route';

export type WorkSetupLeaveGuard = (
  reason: WorkSetupExitReason,
) => Promise<boolean>;

let activeGuard: WorkSetupLeaveGuard | null = null;

export function registerWorkSetupLeaveGuard(guard: WorkSetupLeaveGuard) {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

export async function requestWorkSetupLeave(
  reason: WorkSetupExitReason,
): Promise<boolean> {
  return activeGuard ? activeGuard(reason) : true;
}
