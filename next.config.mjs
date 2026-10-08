/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.CAPACITOR_BUILD === '1' ? { output: 'export' } : {}),
  // With `output: 'export'`, Next 16 treats a non-default `distDir` as the
  // static-export output directory itself (see next/dist/export/utils.js
  // hasCustomExportOutput) and always builds internally under `.next`
  // regardless of this value. So this must name Capacitor's expected export
  // directory (`out`, matching capacitor.config.ts webDir), not a separate
  // internal build-cache directory — `.next-android` here silently exported
  // to `.next-android/` instead of `out/`.
  distDir: process.env.CAPACITOR_BUILD === '1' ? 'out' : '.next',
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: process.env.CAPACITOR_BUILD === '1',
}

export default nextConfig
