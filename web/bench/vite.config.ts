import { defaultServerConditions, defineConfig } from 'vite';
import { CORE_REAL_CONDITION } from '../vite.config.ts';

// `npm run bench`: bundles the real core like the app does, because vitest's module runner turns
// every call across modules into a property lookup and would measure that instead.
const conditions = [CORE_REAL_CONDITION, ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { noExternal: true, resolve: { conditions } },
  build: { ssr: 'bench/budgets.ts', outDir: 'node_modules/.bench', emptyOutDir: true, target: 'esnext', minify: false },
});
