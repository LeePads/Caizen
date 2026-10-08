/** Safely decodes an inline data URL for non-destructive legacy migration. */
export function dataUrlToBlob(value: string): Blob | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/i.exec(value.trim());
  if (!match || typeof atob !== 'function') return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

export function isInlineDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:[^;,]+;base64,/i.test(value);
}
