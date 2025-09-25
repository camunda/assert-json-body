import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 0,
  }
});
