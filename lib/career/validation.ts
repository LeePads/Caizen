export type CareerDateValidation = {
  startDate?: string;
  endDate?: string;
};

/** Returns true for an empty value or a valid HTTP(S) URL with a hostname. */
export function isValidCareerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;

  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isCareerDateRangeValid(startDate: string, endDate: string) {
  return !startDate || !endDate || endDate >= startDate;
}
