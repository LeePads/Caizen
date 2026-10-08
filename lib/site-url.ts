export const PRODUCTION_SITE_URL = 'https://caizen.space';

// Metadata has its own origin: Android's NEXT_PUBLIC_APP_URL selects hosted
// API services and must not accidentally determine a site's canonical URL.
export function getSiteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (!configured) return PRODUCTION_SITE_URL;

  try {
    const url = new URL(configured);
    if (url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {
    // Invalid optional configuration falls back to the production origin.
  }
  return PRODUCTION_SITE_URL;
}
