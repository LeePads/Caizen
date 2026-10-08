export const MEDIA_REFERENCE_KEYS = new Set([
  'avatarAssetId',
  'photoAssetIds',
  'receiptAssetIds',
  'attachmentAssetIds',
  'attachmentAssetId',
  'proofAssetId',
  'referencePhotoAssetId',
  'imageAssetId',
]);

export function collectMediaReferenceIds(
  value: unknown,
  output = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((child) => collectMediaReferenceIds(child, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;

  for (const [key, child] of Object.entries(value)) {
    if (MEDIA_REFERENCE_KEYS.has(key)) {
      if (typeof child === 'string' && child.trim()) output.add(child);
      if (Array.isArray(child)) {
        child.forEach((item) => {
          if (typeof item === 'string' && item.trim()) output.add(item);
        });
      }
      continue;
    }
    collectMediaReferenceIds(child, output);
  }
  return output;
}

export function remapMediaReferences(
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => remapMediaReferences(child, idMap));
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (MEDIA_REFERENCE_KEYS.has(key)) {
      if (typeof child === 'string') {
        output[key] = idMap.get(child) ?? child;
      } else if (Array.isArray(child)) {
        output[key] = child.map((item) =>
          typeof item === 'string' ? idMap.get(item) ?? item : item,
        );
      } else {
        output[key] = child;
      }
      continue;
    }
    output[key] = remapMediaReferences(child, idMap);
  }
  return output;
}

/**
 * Data-only exports contain references but no portable bytes. Keep only
 * explicitly allowed local assets; unknown references become unavailable
 * instead of binding to a coincidentally matching asset on this device.
 */
export function sanitizeMediaReferences(
  value: unknown,
  allowedIds: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => sanitizeMediaReferences(child, allowedIds));
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (MEDIA_REFERENCE_KEYS.has(key)) {
      if (typeof child === 'string') {
        if (allowedIds.has(child)) output[key] = child;
      } else if (Array.isArray(child)) {
        output[key] = child.filter(
          (item): item is string =>
            typeof item === 'string' && allowedIds.has(item),
        );
      } else if (child !== undefined) {
        output[key] = child;
      }
      continue;
    }
    output[key] = sanitizeMediaReferences(child, allowedIds);
  }
  return output;
}
