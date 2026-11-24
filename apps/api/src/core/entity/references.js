import { eventName } from '@personalitify/shared-contracts';
import { subscribe } from '../../modules/events/event-bus.js';
import { fieldError } from '../errors.js';

/**
 * Keeps references between entities consistent without database cascades.
 *
 * When an entity of `targetType` is deleted, every live entity of `service` that points to it
 * through `field` is updated through the entity service, so the change is versioned and
 * synchronized like any other. The handler is idempotent: a repeated event finds nothing
 * left to detach.
 *
 * @param {object}  options
 * @param {object}  options.service     Entity service that holds the reference.
 * @param {string}  options.field       Field with the referenced id (or an array of ids).
 * @param {string}  options.targetType  Entity type that is referenced.
 * @param {boolean} [options.many]      The field is an array of ids.
 */
export function detachOnDelete({ service, field, targetType, many = false }) {
  subscribe(
    `${service.entityType}.detach-deleted-${targetType}.${field}`,
    async (event) => {
      const context = { userId: event.userId, deviceId: event.originDeviceId };
      const referencing = await service.model
        .find({ userId: event.userId, [field]: event.entityId, deletedAt: null })
        .select('_id');
      for (const { _id } of referencing) {
        await service.mutate(context, _id, (document) => {
          if (many) {
            document[field] = document[field].filter((id) => id !== event.entityId);
          } else {
            document[field] = null;
          }
        });
      }
    },
    { types: [eventName(targetType, 'deleted')] },
  );
}

/**
 * Throws a validation error unless every id is a live entity of `service` owned by the
 * caller. `ids` may be a single id, an array, null or undefined.
 */
export async function assertOwnedReferences(auth, service, ids, path) {
  const list = [...new Set([ids].flat().filter((id) => id !== null && id !== undefined))];
  if (list.length === 0) return;
  const found = await service.model.countDocuments({
    _id: { $in: list },
    userId: auth.userId,
    deletedAt: null,
  });
  if (found !== list.length) throw fieldError(path, 'unknown_reference');
}
