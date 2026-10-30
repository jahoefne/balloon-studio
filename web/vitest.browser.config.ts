import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// `npm run test:browser`: the raster hash gate of tests/hashes.test.ts in the three browser engines (docs/plan.md §7).
// Needs `npx playwright install chromium firefox webkit` once. The core's CommonJS dependencies are named up front, so
// Vite does not discover them mid-run and reload the page under a running test.
export default defineConfig({
  optimizeDeps: {
    include: [...Object.keys(pkg.dependencies).filter((name) => name.startsWith('@stdlib/')), '@noble/hashes/sha2.js'],
  },
  test: {
    include: ['tests/hashes.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
