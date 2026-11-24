import { defineConfig } from 'vitest/config';

const mongoBase = (process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017').replace(/\/$/, '');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_TEST_BASE: mongoBase,
      JWT_ACCESS_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
      WEB_ORIGINS: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
    },
  },
});
