export type WorkHubProjectionSource = 'event' | 'task' | 'resource';

export function isActionableWorkHubProjection(
  source: WorkHubProjectionSource,
  status?: string,
) {
  if (source === 'event') {
    return status !== 'completed' && status !== 'dismissed';
  }

  return status !== 'done' && status !== 'archived';
}
