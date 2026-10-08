/**
 * Small bounded-concurrency helper for independent media transfers.
 *
 * A fully serial queue makes large libraries slow, and an unbounded
 * `Promise.all` would open one request per asset. A few workers pulling from a
 * shared cursor keeps throughput high without flooding Cloud Storage.
 *
 * Results keep the input order. When a worker rejects, no further items are
 * started and the already-running workers are awaited first, so per-item
 * compensation/cleanup can never be skipped by an early abort.
 */
export const MEDIA_TRANSFER_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = MEDIA_TRANSFER_CONCURRENCY,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  let cursor = 0;
  let failed = false;
  let failure: unknown;

  const run = async () => {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failed = true;
        failure = error;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run),
  );
  if (failed) throw failure;
  return results;
}
