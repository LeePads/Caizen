/** Serialize one spreadsheet-safe CSV cell. Native numbers keep their numeric form. */
export function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const safe = typeof value === 'string' && /^[\s\p{Cc}\u200B\uFEFF]*[=+\-@]/u.test(raw)
    ? `'${raw}`
    : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
