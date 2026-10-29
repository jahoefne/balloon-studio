import { defineConfig } from 'vitest/config';

// Core and harness tests run in Node. UI tests opt into jsdom with a
// `// @vitest-environment jsdom` docblock at the top of the file.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'harness/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
