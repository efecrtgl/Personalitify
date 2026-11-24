import { Router } from 'express';
import { isDatabaseReady } from '../../database/connection.js';

export function createHealthRouter({ version }) {
  const router = Router();

  // Liveness: the process is up and able to answer.
  router.get('/', (req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'personalitify-api',
        version,
        apiVersion: 'v1',
        serverTime: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  // Readiness: dependencies needed to serve requests are available.
  router.get('/ready', (req, res) => {
    const databaseReady = isDatabaseReady();
    res.status(databaseReady ? 200 : 503).json({
      data: {
        status: databaseReady ? 'ready' : 'unavailable',
        checks: { database: databaseReady ? 'up' : 'down' },
        serverTime: new Date().toISOString(),
      },
    });
  });

  return router;
}
