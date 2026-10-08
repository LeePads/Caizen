import { describe, expect, it, vi } from 'vitest';
import { createEditorLeaveGuard } from '@/hooks/use-editor-leave-guard';

describe('unfinished editor input protection', () => {
  it('leaves a clean editor without an interrupting confirmation', async () => {
    const showConfirmation = vi.fn();
    const guard = createEditorLeaveGuard(showConfirmation);
    expect(await guard.requestLeave()).toBe(true);
    expect(showConfirmation).not.toHaveBeenCalled();
  });

  it('keeps unfinished input protected after cancelling a leave request', async () => {
    const guard = createEditorLeaveGuard(vi.fn());
    guard.setDraft(true);
    const first = guard.requestLeave();
    guard.resolveLeave(false);
    expect(await first).toBe(false);
    const second = guard.requestLeave();
    guard.resolveLeave(false);
    expect(await second).toBe(false);
  });

  it('allows a confirmed discard and subsequent navigation', async () => {
    const guard = createEditorLeaveGuard(vi.fn());
    guard.setDraft(true);
    const pending = guard.requestLeave();
    guard.resolveLeave(true);
    expect(await pending).toBe(true);
    expect(await guard.requestLeave()).toBe(true);
  });

  it('coalesces repeated Back requests into one confirmation', async () => {
    const showConfirmation = vi.fn();
    const guard = createEditorLeaveGuard(showConfirmation);
    guard.setDraft(true);
    const first = guard.requestLeave();
    const second = guard.requestLeave();
    expect(second).toBe(first);
    expect(showConfirmation).toHaveBeenCalledTimes(1);
    guard.resolveLeave(false);
    expect(await Promise.all([first, second])).toEqual([false, false]);
  });

  it('cancels pending navigation when the profile changes or the editor unmounts', async () => {
    const guard = createEditorLeaveGuard(vi.fn());
    guard.setDraft(true);
    const previousProfileRequest = guard.requestLeave();
    guard.reset();
    expect(await previousProfileRequest).toBe(false);
    guard.resolveLeave(true);
    expect(await guard.requestLeave()).toBe(true);
  });

  it('does not prompt after unfinished input was applied or cleared', async () => {
    const showConfirmation = vi.fn();
    const guard = createEditorLeaveGuard(showConfirmation);
    guard.setDraft(true);
    guard.setDraft(false);
    expect(await guard.requestLeave()).toBe(true);
    expect(showConfirmation).not.toHaveBeenCalled();
  });
});
