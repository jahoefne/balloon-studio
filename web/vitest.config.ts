import { defaultServerConditions } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { CORE_REAL_CONDITION, coreMode } from './vite.config.ts';

// Core and harness tests run in Node. UI tests opt into jsdom with a
// `// @vitest-environment jsdom` docblock at the top of the file.
// `VITE_CORE=real npm test` runs them on the real core behind `#core`; the grid against the
// references is `npm run test:reference` then, it needs the pack and takes minutes.
const core = coreMode(process.env);
const conditions = core === 'real' ? [CORE_REAL_CONDITION, ...defaultServerConditions] : undefined;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  ...(conditions ? { resolve: { conditions }, ssr: { resolve: { conditions } } } : {}),
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'harness/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...(core === 'real' ? ['harness/grid.reference.test.ts'] : [])],
    setupFiles: ['src/test/setup.ts'],
    // Store tests that build a hollow preview are instant on the stub and take seconds on the real core.
    ...(core === 'real' ? { testTimeout: 60_000 } : {}),
    env: { VITE_CORE: core },
  },
});
