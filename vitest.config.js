import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'docs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/', 'docs/', 'context/', 'scripts/', '*.config.js'],
    },
  },
});
