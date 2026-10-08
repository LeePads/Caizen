import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { isValidLocalDateKey } from '@/lib/date-utils';

export type WorkEditorKind = 'project' | 'task' | 'note' | 'resource' | 'event';

/** UI validation only; stored records and legacy values are never rewritten here. */
export function validateWorkEditor(kind: WorkEditorKind, draft: Record<string, unknown>, location = false) {
  const errors: Record<string, string> = {};
  const value = (key: string) => typeof draft[key] === 'string' ? draft[key].trim() : '';
  if (!(kind === 'event' && location) && !value('title')) errors.title = 'Enter a title.';
  if (['task', 'note', 'resource'].includes(kind) && !value('projectId')) errors.projectId = 'Choose a project.';
  if (kind === 'resource' && !value('link')) errors.link = 'Enter a resource URL.';
  const linkKeys = kind === 'note' ? draft.noteType === 'bug' ? ['screenshotLink', 'ticketLink'] : [] : kind === 'event' ? [] : ['link'];
  for (const key of linkKeys) {
    if (value(key) && !normalizeExternalWebUrl(value(key))) errors[key] = 'Enter a valid HTTPS website, such as https://example.com.';
  }
  for (const key of kind === 'event' ? ['date', 'endDate'] : kind === 'note' ? ['date'] : ['dueDate']) {
    if (value(key) && !isValidLocalDateKey(value(key))) errors[key] = 'Choose a valid date.';
  }
  if (kind === 'event') {
    if (!value('date')) errors.date = 'Choose a start date.';
    if (!errors.date && !errors.endDate && value('endDate') && value('endDate') < value('date')) {
      errors.endDate = 'End date must be on or after the start date.';
    }
    if (draft.reminderEnabled && draft.reminder === 'custom' && (!value('customReminderDays') || !/^\d+$/.test(value('customReminderDays')))) {
      errors.customReminderDays = 'Enter a whole number of days, zero or greater.';
    }
  }
  return errors;
}
