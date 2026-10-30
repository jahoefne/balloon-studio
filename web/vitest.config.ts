import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultServerConditions } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { filesOfShard, SHARD } from './tests/support/tier.ts';
import { CORE_REAL_CONDITION, coreMode } from './vite.config.ts';

// Core and harness tests run in Node. UI tests opt into jsdom with a
// `// @vitest-environment jsdom` docblock at the top of the file.
// `VITE_CORE=real npm test` runs them on the real core behind `#core`; the grid against the
// references is `npm run test:reference` then, it needs the pack and takes minutes.
//
// `npm test` is the `fast` tier, `FULL=1` the `full` tier, `REFS_SHARD=i/n` one part of a run (tests/support/tier.ts).
const core = coreMode(process.env);
const conditions = core === 'real' ? [CORE_REAL_CONDITION, ...defaultServerConditions] : undefined;
const include = ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'harness/**/*.test.ts'];
const web = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  ...(conditions ? { resolve: { conditions }, ssr: { resolve: { conditions } } } : {}),
  test: {
    environment: 'node',
    include: SHARD === null ? include : [...filesOfShard(globSync(include, { cwd: web }), SHARD)],
    exclude: [...configDefaults.exclude, ...(core === 'real' ? ['harness/grid.reference.test.ts'] : [])],
    setupFiles: ['src/test/setup.ts'],
    // Parallel runs make a test up to 30 times slower (measured at load 70); what needs more names its own timeout (WP-V3).
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: { VITE_CORE: core },
  },
});
