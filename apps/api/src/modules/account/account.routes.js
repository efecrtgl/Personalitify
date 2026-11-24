import { z } from 'zod';
import { createModule, withMeta } from '../../core/routing.js';
import { paginationMeta, paginationMetaSchema, paginationQuery } from '../../core/validation.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { listAuditLog } from '../audit/audit.service.js';
import { clearRefreshCookie } from '../auth/cookies.js';
import { userSchema } from '../users/users.schemas.js';
import { deleteAccount, exportAccount } from './account.service.js';

const account = createModule({
  tag: 'Account',
  description: 'Data export, security log and account deletion.',
  basePath: '/account',
});

account.get(
  '/export',
  {
    summary: 'Export all personal data',
    description:
      'Returns every record the account owns, grouped by type, in the same resource format ' +
      'the API uses elsewhere. Credentials and token hashes are never included.',
    response: z.strictObject({
      formatVersion: z.int(),
      exportedAt: z.string(),
      user: userSchema,
      data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    }),
    middleware: [authRateLimit],
  },
  ({ auth, req }) => exportAccount(auth, req.client),
);

account.get(
  '/security-log',
  {
    summary: 'List security-relevant account activity',
    query: z.strictObject(paginationQuery),
    response: z.array(
      z.strictObject({
        id: z.string(),
        action: z.string(),
        sessionId: z.string().nullable(),
        deviceId: z.string().nullable(),
        ip: z.string().nullable(),
        userAgent: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
      }),
    ),
    responseMeta: paginationMetaSchema,
  },
  async ({ auth, query }) => {
    const { items, total } = await listAuditLog(auth.userId, query);
    return withMeta(items, paginationMeta({ ...query, total }));
  },
);

account.delete(
  '',
  {
    summary: 'Delete the account permanently',
    description: 'Requires the current password. Removes the account and all of its data.',
    body: z.strictObject({ password: z.string().min(1).max(128) }),
    status: 204,
    errors: ['INVALID_CREDENTIALS'],
    middleware: [authRateLimit],
  },
  async ({ auth, body, res }) => {
    await deleteAccount(auth, body.password);
    clearRefreshCookie(res);
  },
);

export const accountRouter = account.router;
