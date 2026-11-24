import { createServer } from 'node:http';

async function main() {
  // Configuration is validated before any other module is loaded.
  let config;
  try {
    const { getConfig } = await import('./config/env.js');
    config = getConfig();
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  const { logger } = await import('./core/logger.js');
  const { connectDatabase, disconnectDatabase } = await import('./database/connection.js');
  const { createApp, API_PREFIX } = await import('./app.js');

  try {
    await connectDatabase(config.mongoUri);
  } catch (error) {
    // Never continue without a real database.
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  const { startOutboxSweeper, stopOutboxSweeper } =
    await import('./modules/events/outbox-relay.js');

  const { startJobs, stopJobs } = await import('./core/jobs.js');
  const { attachRealtime, closeRealtime } = await import('./modules/realtime/realtime.server.js');
  await import('./modules/notifications/notifications.jobs.js');

  const server = createServer(createApp());
  // Pushes the event log to connected clients over the same port.
  attachRealtime(server);
  // Delivers domain events that a crash or a failed relay left in an entity's outbox.
  startOutboxSweeper();
  // Reminders, timers that run out, and housekeeping.
  startJobs();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal(
        `Port ${config.port} is already in use. Stop the other process or change API_PORT in .env.`,
      );
    } else {
      logger.fatal({ err: error }, 'HTTP server error');
    }
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    logger.info(`Personalitify API listening on http://${config.host}:${config.port}${API_PREFIX}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    stopOutboxSweeper();
    stopJobs();
    // Closing the realtime server also closes the HTTP server it is attached to.
    closeRealtime().catch(() => {});
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Idle keep-alive connections would otherwise hold the port until they time out, which
    // makes a restarting development server collide with its own predecessor.
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
}

main();
