import { API_PREFIX } from '@personalitify/shared-contracts';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { generalRateLimit } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import {
  corsPolicy,
  rejectOperatorKeys,
  requireJsonBody,
  securityHeaders,
} from './middleware/security.js';
import { accountRouter } from './modules/account/account.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { devicesRouter } from './modules/devices/devices.routes.js';
import { createDocsRouter } from './modules/docs/docs.routes.js';
import { goalsRouter } from './modules/goals/goals.routes.js';
import { habitsRouter } from './modules/habits/habits.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export { API_PREFIX };

/** Routers of all domain modules, in the order they appear in the API reference. */
const moduleRouters = [
  healthRouter,
  authRouter,
  usersRouter,
  settingsRouter,
  categoriesRouter,
  habitsRouter,
  goalsRouter,
  tasksRouter,
  calendarRouter,
  dashboardRouter,
  devicesRouter,
  accountRouter,
];

/** Builds the Express application. Has no network or database side effects. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.use(requestContext);
  app.use(securityHeaders());
  app.use(corsPolicy());
  app.use(generalRateLimit);
  app.use(requireJsonBody);
  app.use(express.json({ limit: '1mb' }));
  app.use(rejectOperatorKeys);

  const v1 = express.Router();
  for (const router of moduleRouters) {
    v1.use(router);
  }
  v1.use(createDocsRouter());
  app.use(API_PREFIX, v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
