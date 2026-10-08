export type CloudOperation = 'backup' | 'restore' | 'delete' | 'files';

let active: CloudOperation | null = null;
let managementSurfaces = 0;
const listeners = new Set<() => void>();
const announce = () => listeners.forEach(listener => listener());
export const getCloudOperation = () => active;
export const getServerCloudOperation = () => null;
export const subscribeCloudOperation = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isCloudManagementOpen = () => managementSurfaces > 0;
export function holdCloudManagement() {
  managementSurfaces += 1;
  return () => { managementSurfaces = Math.max(0, managementSurfaces - 1); announce(); };
}
export class CloudOperationBusyError extends Error {
  constructor() { super('Cloud Backup is busy. Try again when the current operation finishes.'); }
}

/** Admission is synchronous; Web Locks extend the transfer fence across tabs. */
export async function withCloudOperation<T>(operation: CloudOperation, work: () => Promise<T>): Promise<T> {
  if (active) throw new CloudOperationBusyError();
  active = operation;
  announce();
  try {
    return typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request('caizen-cloud-transfer', { mode: 'exclusive', ifAvailable: true }, lock => {
          if (!lock) throw new CloudOperationBusyError();
          return work();
        })
      : await work();
  } finally {
    active = null;
    announce();
  }
}
