/**
 * History clearing is deliberately a view operation. It returns only the
 * existing presentation flag update; callers must not replace or delete the
 * canonical productivity records.
 */
export function getPresentationHistoryClearUpdates(
  items: Array<{ id: string }>,
) {
  return items.map(item => ({
    id: item.id,
    hiddenFromHistory: true as const,
  }));
}
