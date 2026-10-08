export const FALLBACK_STORAGE_LABEL = 'Stored on this device';

export function formatStorageEstimate(usage: number | undefined) {
  if (usage === undefined || !Number.isFinite(usage) || usage < 0) {
    return FALLBACK_STORAGE_LABEL;
  }

  if (usage >= 1024 * 1024) {
    return `Approx. ${(usage / 1024 / 1024).toFixed(1)} MB browser storage used`;
  }

  if (usage >= 1024) {
    return `Approx. ${Math.max(1, Math.round(usage / 1024))} KB browser storage used`;
  }

  return `Approx. ${Math.round(usage)} B browser storage used`;
}

export async function getStorageEstimateLabel() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return FALLBACK_STORAGE_LABEL;
  }

  try {
    const { usage } = await navigator.storage.estimate();
    return formatStorageEstimate(usage);
  } catch {
    return FALLBACK_STORAGE_LABEL;
  }
}
