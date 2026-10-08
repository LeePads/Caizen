import { describe, expect, it } from 'vitest';
import { parseNativeTarget } from '@/lib/native/app-lifecycle';

describe('widget and shortcut deep links', () => {
  it('parses a widget quick-add link into section and action', () => {
    expect(
      parseNativeTarget('caizen://open?section=lifehub&action=add-task&source=widget'),
    ).toEqual({
      profileId: undefined,
      section: 'lifehub',
      recordId: undefined,
      action: 'add-task',
      source: 'widget',
    });
  });

  it('preserves the native new-expense destination', () => {
    expect(
      parseNativeTarget('caizen://open?section=balance&action=new-expense&source=shortcut'),
    ).toMatchObject({
      section: 'balance',
      action: 'new-expense',
      source: 'shortcut',
    });
  });

  it('carries the profile and record for a tapped widget row', () => {
    expect(
      parseNativeTarget(
        'caizen://open?section=lifehub&action=tasks&record=task-9&profile=profile-b&source=widget',
      ),
    ).toEqual({
      profileId: 'profile-b',
      section: 'lifehub',
      recordId: 'task-9',
      action: 'tasks',
      source: 'widget',
    });
  });

  it('does not mistake the open host for a destination section', () => {
    // caizen://open?... puts the destination in the query, so `open` itself
    // must never become the section.
    expect(parseNativeTarget('caizen://open?action=add-food')?.section)
      .toBeFalsy();
  });

  it('still reads a host-style section link', () => {
    expect(parseNativeTarget('caizen://music')?.section).toBe('music');
  });

  it('rejects links from schemes Caizen does not own', () => {
    expect(parseNativeTarget('javascript:alert(1)')).toBeNull();
    expect(parseNativeTarget('not a url')).toBeNull();
  });
});
