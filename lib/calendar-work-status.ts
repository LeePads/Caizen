export type CalendarWorkStatus =
  | 'office'
  | 'work_home'
  | 'travel'
  | 'holiday'
  | 'leave';

export const CALENDAR_WORK_STATUSES: Record<
  CalendarWorkStatus,
  { label: string; shortLabel: string; tone: CalendarWorkStatus }
> = {
  office: { label: 'Office / onsite', shortLabel: 'Office', tone: 'office' },
  work_home: { label: 'Work from home', shortLabel: 'WFH', tone: 'work_home' },
  travel: { label: 'Travel', shortLabel: 'Travel', tone: 'travel' },
  holiday: { label: 'Holiday', shortLabel: 'Holiday', tone: 'holiday' },
  leave: { label: 'Leave', shortLabel: 'Leave', tone: 'leave' },
};

export const CALENDAR_WORK_STATUS_TYPES = Object.keys(
  CALENDAR_WORK_STATUSES,
) as CalendarWorkStatus[];

export function isCalendarWorkStatus(
  value?: string | null,
): value is CalendarWorkStatus {
  return Boolean(value && value in CALENDAR_WORK_STATUSES);
}

export function getCalendarWorkStatus(value?: string | null) {
  return isCalendarWorkStatus(value)
    ? CALENDAR_WORK_STATUSES[value]
    : null;
}
