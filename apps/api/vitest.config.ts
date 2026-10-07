import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true }
    },
    env: {
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: 'testsecret'
    },
    setupFiles: ['./test-setup.ts']
  }
});
