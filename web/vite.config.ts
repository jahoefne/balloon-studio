import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';

/**
 * `VITE_CORE=stub|real` picks the core behind the `#core` and `#core/parameters` imports
 * (web/package.json "imports"). Stub is the default and needs no condition, so
 * src/core/real need not exist until WP-K9 adds it.
 */
export const CORE_REAL_CONDITION = 'balloon-core-real';
export const coreMode = (env: Record<string, string | undefined>): 'stub' | 'real' => {
  const mode = env.VITE_CORE ?? 'stub';
  if (mode !== 'stub' && mode !== 'real') throw new Error(`VITE_CORE must be "stub" or "real", not "${mode}"`);
  return mode;
};

export default defineConfig(({ mode }) => {
  const core = coreMode({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env });
  return {
    // Served from GitHub Pages at https://jahoefne.github.io/balloon-studio/, so every
    // asset URL (scripts, styles, workers, fonts) carries the repository path.
    // Dev and preview use the same base: http://localhost:5173/balloon-studio/.
    base: '/balloon-studio/',
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
    resolve: core === 'real' ? { conditions: [CORE_REAL_CONDITION, ...defaultClientConditions] } : {},
    worker: { format: 'es' },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
              { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
