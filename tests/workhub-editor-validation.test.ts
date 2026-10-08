import { describe, expect, it } from 'vitest';
import { validateWorkEditor } from '@/lib/workhub/editor-validation';

describe('Work capture validation', () => {
  it('explains required record fields and permits contextual task defaults', () => {
    expect(validateWorkEditor('resource', {})).toEqual({ title: 'Enter a title.', projectId: 'Choose a project.', link: 'Enter a resource URL.' });
    expect(validateWorkEditor('task', { title: 'Review proposal', projectId: 'project-1' })).toEqual({});
  });

  it('rejects reversed and impossible dates without mutating the draft', () => {
    const draft = { title: 'Review', date: '2026-10-03', endDate: '2026-10-02' };
    const original = { ...draft };
    expect(validateWorkEditor('event', draft).endDate).toMatch(/on or after/);
    expect(draft).toEqual(original);
    expect(validateWorkEditor('event', { ...draft, endDate: '2026-10-03' })).toEqual({});
    expect(validateWorkEditor('event', { ...draft, date: '2026-02-30' }).date).toBe('Choose a valid date.');
  });

  it('supports untitled work locations and rejects unsafe links', () => {
    expect(validateWorkEditor('event', { date: '2026-10-03' }, true)).toEqual({});
    expect(validateWorkEditor('project', { title: 'Project', link: 'javascript:alert(1)' }).link).toMatch(/HTTPS/);
    expect(validateWorkEditor('resource', { title: 'Spec', projectId: 'p', link: 'example.com/spec' })).toEqual({});
    expect(validateWorkEditor('note', { title: 'Incident', noteType: 'bug', projectId: 'p', screenshotLink: 'file:///private.png' }).screenshotLink).toMatch(/HTTPS/);
  });

  it('requires whole nonnegative custom reminder days only when reminders are enabled', () => {
    const draft = { title: 'Review', date: '2026-10-03', reminder: 'custom', reminderEnabled: true, customReminderDays: '-1' };
    expect(validateWorkEditor('event', draft).customReminderDays).toMatch(/whole number/);
    expect(validateWorkEditor('event', { ...draft, customReminderDays: '0' })).toEqual({});
    expect(validateWorkEditor('event', { ...draft, reminderEnabled: false })).toEqual({});
  });
});
