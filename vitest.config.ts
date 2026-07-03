import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['kernel/**/*.ts', 'agents/**/*.ts'],
      exclude: ['kernel/types/**', '**/*.test.ts', '**/index.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@kernel': '/kernel',
      '@agents': '/agents',
    },
  },
});
