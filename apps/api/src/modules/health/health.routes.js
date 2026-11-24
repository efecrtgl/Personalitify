import { API_VERSION } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { API_PACKAGE_VERSION } from '../../core/version.js';
import { isDatabaseReady } from '../../database/connection.js';

const health = createModule({
  tag: 'Health',
  description: 'Liveness and readiness probes. No authentication.',
  basePath: '/health',
});

health.get(
  '',
  {
    summary: 'Liveness',
    description:
      'The process is running. `serverTime` lets clients estimate their clock offset from ' +
      'the server.',
    auth: 'none',
    response: z.strictObject({
      status: z.literal('ok'),
      service: z.string(),
      version: z.string(),
      apiVersion: z.string(),
      serverTime: z.string(),
      uptimeSeconds: z.int(),
    }),
  },
  () => ({
    status: 'ok',
    service: 'personalitify-api',
    version: API_PACKAGE_VERSION,
    apiVersion: API_VERSION,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  }),
);

health.get(
  '/ready',
  {
    summary: 'Readiness',
    description: 'Answers 503 when a dependency needed to serve requests is unavailable.',
    auth: 'none',
    response: z.strictObject({
      status: z.enum(['ready', 'unavailable']),
      checks: z.strictObject({ database: z.enum(['up', 'down']) }),
      serverTime: z.string(),
    }),
  },
  ({ res }) => {
    const databaseReady = isDatabaseReady();
    res.status(databaseReady ? 200 : 503).json({
      data: {
        status: databaseReady ? 'ready' : 'unavailable',
        checks: { database: databaseReady ? 'up' : 'down' },
        serverTime: new Date().toISOString(),
      },
    });
  },
);

export const healthRouter = health.router;
