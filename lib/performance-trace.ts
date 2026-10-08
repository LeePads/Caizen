/**
 * Opt-in, non-PII runtime timings for regression investigation.
 *
 * The flag is intentionally global so a local smoke harness can enable it
 * without adding a persisted preference or changing the application data
 * shape. Production sessions do no timing work while it is disabled.
 */
type RuntimeTraceGlobal = typeof globalThis & {
  __CAIZEN_PERF_TRACE__?: boolean;
};

const TRACE_PREFIX = 'caizen:trace:';

function isEnabled() {
  return Boolean((globalThis as RuntimeTraceGlobal).__CAIZEN_PERF_TRACE__);
}

export function startRuntimeTrace(name: string): number | null {
  if (!name.trim() || !isEnabled() || typeof performance === 'undefined') return null;
  return performance.now();
}

export function endRuntimeTrace(name: string, startedAt: number | null) {
  if (startedAt === null || !isEnabled() || typeof performance === 'undefined') return;
  const duration = performance.now() - startedAt;
  try {
    performance.measure(`${TRACE_PREFIX}${name}`, {
      start: startedAt,
      end: performance.now(),
      detail: { duration },
    });
  } catch {
    // Timing is diagnostic only; an unsupported Performance API must not
    // affect the mutation or persistence path being measured.
  }
}
