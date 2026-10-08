/**
 * Tracks currently-open overlays in open order so Android Back and Escape
 * close only the true topmost surface.
 */

type OverlayEntry = {
  id: number;
  close: () => void;
  closing: boolean;
  resetTimer?: ReturnType<typeof setTimeout>;
};

let stack: OverlayEntry[] = [];
let nextId = 1;

export function pushOverlay(close: () => void): number {
  const id = nextId++;
  stack.push({ id, close, closing: false });
  return id;
}

export function popOverlay(id: number): void {
  const entry = stack.find((item) => item.id === id);
  if (entry?.resetTimer) clearTimeout(entry.resetTimer);
  stack = stack.filter((item) => item.id !== id);
}

export function isTopOverlay(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function overlayDepth(): number {
  return stack.length;
}

/**
 * Requests that only the topmost overlay close. A rapid second Back/Escape is
 * swallowed while the component begins closing. If its close callback instead
 * opens a discard confirmation and keeps the parent mounted, the guard resets
 * shortly afterward so the parent does not become permanently uncloseable.
 */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.closing) return true;

  top.closing = true;
  if (top.resetTimer) clearTimeout(top.resetTimer);
  top.resetTimer = setTimeout(() => {
    const stillMounted = stack.find((entry) => entry.id === top.id);
    if (stillMounted) {
      stillMounted.closing = false;
      stillMounted.resetTimer = undefined;
    }
  }, 350);

  try {
    top.close();
  } catch {
    // A broken close callback must not leave the whole navigation stack stuck.
    popOverlay(top.id);
  }
  return true;
}

export function resetOverlayStackForTests(): void {
  for (const entry of stack) {
    if (entry.resetTimer) clearTimeout(entry.resetTimer);
  }
  stack = [];
  nextId = 1;
}
