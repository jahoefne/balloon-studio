import { defineConfig } from '@playwright/test';

// `npm run e2e`: the app in a real browser, on the stub core unless E2E_CORE=real. Not part of the
// CI workflow; WP-V3 decides about that. Ports are free for the taking: the WP sessions use 5173-5175.
const core = process.env.E2E_CORE === 'real' ? 'real' : 'stub';
const port = Number(process.env.E2E_PORT ?? (core === 'real' ? 5192 : 5191));

export default defineConfig({
  testDir: 'e2e',
  // One worker per core mode: the real core's previews are heavy, and tests share nothing but the server.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}/balloon-studio/`, viewport: { width: 1280, height: 860 } },
  webServer: {
    command: `npx vite --port ${port}`,
    url: `http://localhost:${port}/balloon-studio/`,
    env: { VITE_CORE: core },
    reuseExistingServer: true,
    timeout: 120_000,
  },
  // No device presets: their user agents claim another platform, and the app picks ⌘ or Ctrl by it.
  projects: [
    // Software WebGL, so the stage draws without a GPU.
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
