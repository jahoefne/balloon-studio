import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';
import { CORE_REAL_CONDITION, coreMode } from './vite.config.ts';

// `npm run test:reference`: the TS core against the Swift references (WP-V2 fills
// harness/**/*.reference.test.ts). The stub core has nothing to compare, so with
// VITE_CORE=stub (the default) the run is skipped and exits cleanly.
const core = coreMode(process.env);
if (core === 'stub') console.log('reference harness: skipped (VITE_CORE=stub; run with VITE_CORE=real)');

const conditions = core === 'real' ? [CORE_REAL_CONDITION, ...defaultServerConditions] : undefined;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  ...(conditions ? { resolve: { conditions }, ssr: { resolve: { conditions } } } : {}),
  test: {
    environment: 'node',
    include: core === 'real' ? ['harness/**/*.reference.test.ts'] : [],
    passWithNoTests: true,
    env: { VITE_CORE: core },
  },
});
