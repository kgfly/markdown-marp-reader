import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: [
        'src/background/**',
        // Canvas/iframe adapters: covered by the Chrome end-to-end run, not jsdom.
        'src/core/export-render.js',
        'src/viewer/main.js',
        'src/extension/**',
        'test/**',
        'scripts/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
