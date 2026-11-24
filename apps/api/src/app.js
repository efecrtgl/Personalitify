import { readFileSync } from 'node:fs';
import { API_PREFIX, ERROR_CODES } from '@personalitify/shared-contracts';
import express from 'express';
import { createHealthRouter } from './modules/health/health.routes.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export { API_PREFIX };
export const API_PACKAGE_VERSION = packageJson.version;

/** Builds the Express application. Has no network or database side effects. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  v1.use('/health', createHealthRouter({ version: API_PACKAGE_VERSION }));
  app.use(API_PREFIX, v1);

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: ERROR_CODES.ROUTE_NOT_FOUND,
        message: `No route for ${req.method} ${req.path}`,
      },
    });
  });

  return app;
}
