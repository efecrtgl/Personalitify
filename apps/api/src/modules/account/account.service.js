import { logger } from '../../core/logger.js';
import { eraseUserData, exportUserData, registerUserCollection } from '../../core/user-data.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertPassword } from '../auth/auth.service.js';
import { SyncCounter, SyncEvent } from '../events/sync-event.model.js';
import { User, serializeUser } from '../users/user.model.js';
import { getUserOrThrow } from '../users/users.service.js';

// Event history is erased with the account but is not part of the export: it only repeats
// data that the export already contains in its current form.
registerUserCollection({ key: 'syncEvents', model: SyncEvent });
registerUserCollection({ key: 'syncCounters', model: SyncCounter, userField: '_id' });

export const EXPORT_FORMAT_VERSION = 1;

/** Everything Personalitify stores about the user, in the public resource format. */
export async function exportAccount(auth, client) {
  const user = await getUserOrThrow(auth.userId);
  const data = await exportUserData(auth.userId);
  await recordAudit(AUDIT_ACTIONS.DATA_EXPORTED, { ...auth, client });
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    user: serializeUser(user),
    data,
  };
}

/** Permanently deletes the account and all of its data after confirming the password. */
export async function deleteAccount(auth, password) {
  await assertPassword(auth.userId, password);
  const counts = await eraseUserData(auth.userId);
  await User.deleteOne({ _id: auth.userId });
  logger.info({ userId: auth.userId, counts }, 'Account deleted');
}
