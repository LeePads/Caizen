export type SectionFeatureRequest = {
  section: string;
  feature: string;
  recordId?: string;
  dateKey?: string;
  signal: number;
  profileId: string;
};

/**
 * Search/launcher requests are owned by the active profile. Consumers only
 * receive a request after both the destination section and profile match.
 */
export function getProfileBoundSectionRequest(
  request: SectionFeatureRequest | null | undefined,
  section: string,
  currentProfileId: string,
): SectionFeatureRequest | null {
  if (!request || request.section !== section || request.profileId !== currentProfileId) {
    return null;
  }
  return request;
}

export function isProfileBoundRequestReady({
  isHydrated,
  requestedProfileId,
  currentProfileId,
  signal,
}: {
  isHydrated: boolean;
  requestedProfileId?: string;
  currentProfileId: string;
  signal?: number;
}): boolean {
  return Boolean(
    isHydrated &&
      signal &&
      requestedProfileId &&
      currentProfileId &&
      requestedProfileId === currentProfileId,
  );
}

export function claimRequestSignal(
  consumedSignalRef: { current: number | null },
  signal: number,
): boolean {
  if (!signal || consumedSignalRef.current === signal) return false;
  consumedSignalRef.current = signal;
  return true;
}
