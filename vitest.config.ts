import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Date handling is timezone-sensitive and the reporting users are in
    // UTC+08:00. Manila is also the worst case for UTC day bucketing: any
    // timestamp before 08:00 UTC lands on the previous day.
    env: { TZ: 'Asia/Manila' },
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
