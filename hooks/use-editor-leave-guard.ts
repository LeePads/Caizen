'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function createEditorLeaveGuard(onConfirmationChange: (open: boolean) => void) {
  let dirty = false;
  let pending: { promise: Promise<boolean>; resolve: (allow: boolean) => void } | null = null;
  return {
    setDraft: (hasDraft: boolean) => { dirty = hasDraft; },
    requestLeave: (): Promise<boolean> => {
      if (pending) return pending.promise;
      if (!dirty) return Promise.resolve(true);
      let resolve!: (allow: boolean) => void;
      const promise = new Promise<boolean>(complete => { resolve = complete; });
      pending = { promise, resolve };
      onConfirmationChange(true);
      return promise;
    },
    resolveLeave: (allow: boolean) => {
      const previous = pending;
      pending = null;
      if (allow) dirty = false;
      onConfirmationChange(false);
      previous?.resolve(allow);
    },
    reset: () => {
      dirty = false;
      const previous = pending;
      pending = null;
      previous?.resolve(false);
      onConfirmationChange(false);
    },
  };
}

/** Guards uncommitted inputs without changing the application's persisted data. */
export function useEditorLeaveGuard(scope: string | null) {
  const [hasDraft, setHasDraft] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const guardRef = useRef<ReturnType<typeof createEditorLeaveGuard> | null>(null);
  if (!guardRef.current) guardRef.current = createEditorLeaveGuard(setConfirmingLeave);
  const guard = guardRef.current;

  const onDraftChange = useCallback((dirty: boolean) => {
    guard.setDraft(dirty);
    setHasDraft(dirty);
  }, [guard]);

  const resolveLeave = useCallback((allow: boolean) => {
    guard.resolveLeave(allow);
    if (allow) onDraftChange(false);
  }, [guard, onDraftChange]);

  const requestLeave = useCallback((): Promise<boolean> => {
    return guard.requestLeave();
  }, [guard]);

  useEffect(() => {
    onDraftChange(false);
    guard.reset();
    return () => {
      guard.reset();
    };
  }, [guard, onDraftChange, scope]);

  return { hasDraft, confirmingLeave, onDraftChange, requestLeave, resolveLeave };
}
