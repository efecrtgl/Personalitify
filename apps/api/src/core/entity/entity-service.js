import { randomUUID } from 'node:crypto';
import { ERROR_CODES, eventName } from '@personalitify/shared-contracts';
import { flushOutboxSafely, registerOutboxModel } from '../../modules/events/outbox-relay.js';
import { SyncEvent } from '../../modules/events/sync-event.model.js';
import { AppError, conflict, limitExceeded, notFound } from '../errors.js';
import { registerUserCollection } from '../user-data.js';

const INTERNAL_FIELDS = new Set([
  '_id',
  'userId',
  'version',
  'createdAt',
  'updatedAt',
  'deletedAt',
  '_outbox',
]);
const MAX_WRITE_ATTEMPTS = 4;

const entityServices = new Map();

/** Looks up the service of a synchronized entity type (used by the synchronization engine). */
export function getEntityService(entityType) {
  return entityServices.get(entityType);
}

export function listEntityTypes() {
  return [...entityServices.keys()];
}

/** Fields shared by the public representation of every synchronized entity. */
export function baseResource(document) {
  return {
    id: String(document._id),
    version: document.version,
    createdAt: new Date(document.createdAt).toISOString(),
    updatedAt: new Date(document.updatedAt).toISOString(),
  };
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

/**
 * Applies a partial update to a Mongoose document. Nested objects declared in the schema are
 * merged key by key; everything else (scalars, arrays, free-form values) is replaced.
 */
export function assignPatch(document, patch, prefix = '') {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const path = `${prefix}${key}`;
    if (isPlainObject(value) && document.schema.nested[path]) {
      assignPatch(document, value, `${path}.`);
    } else {
      document.set(path, value);
    }
  }
}

function snapshotFields(document) {
  const object = document.toObject({ depopulate: true });
  const fields = {};
  for (const [key, value] of Object.entries(object)) {
    if (!INTERNAL_FIELDS.has(key)) fields[key] = value;
  }
  return fields;
}

function diffFields(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null),
  );
}

/**
 * Creates the write path shared by all synchronized entities.
 *
 * Every mutation is one atomic single-document write that (1) changes the entity,
 * (2) increments its `version` and (3) appends the corresponding domain event to the
 * entity's outbox. Writes are conditional on the version that was read, so concurrent
 * writers can never overwrite each other silently.
 *
 * @param {object}   options
 * @param {string}   options.entityType  Name used in events and the synchronization API.
 * @param {import('mongoose').Model} options.model
 * @param {(document: object) => object} options.serialize  Document -> public resource.
 * @param {number}  [options.maxPerUser] Upper bound of live entities per user.
 */
export function createEntityService({ entityType, model, serialize, maxPerUser }) {
  registerOutboxModel(model);
  registerUserCollection({ key: entityType, model, serialize, softDeleted: true });

  function buildEvent(action, document, context, changedFields, data) {
    return {
      eventId: randomUUID(),
      type: eventName(entityType, action),
      entityVersion: document.version,
      occurredAt: new Date(),
      deviceId: context.deviceId ?? null,
      opId: context.opId ?? null,
      changedFields,
      data,
    };
  }

  /** Fields changed on the server after `baseVersion`, or null when history is incomplete. */
  async function fieldsChangedSince(document, baseVersion) {
    const [logged, withOutbox] = await Promise.all([
      SyncEvent.find({
        userId: document.userId,
        entityType,
        entityId: String(document._id),
        entityVersion: { $gt: baseVersion },
      })
        .select('entityVersion changedFields')
        .lean(),
      model.findById(document._id).select('+_outbox').lean(),
    ]);

    const byVersion = new Map();
    for (const event of [...logged, ...(withOutbox?._outbox ?? [])]) {
      byVersion.set(event.entityVersion, event.changedFields ?? []);
    }
    for (let version = baseVersion + 1; version <= document.version; version += 1) {
      if (!byVersion.has(version)) return null;
    }
    return new Set([...byVersion.values()].flat());
  }

  async function assertMergeable(document, baseVersion, intendedFields) {
    if (baseVersion > document.version) {
      throw versionConflict(document, []);
    }
    const serverChanges = await fieldsChangedSince(document, baseVersion);
    if (!serverChanges || !intendedFields) {
      throw versionConflict(document, intendedFields ?? []);
    }
    const overlapping = intendedFields.filter((field) => serverChanges.has(field));
    if (overlapping.length > 0) {
      throw versionConflict(document, overlapping);
    }
  }

  function versionConflict(document, conflictingFields) {
    return new AppError(409, ERROR_CODES.VERSION_CONFLICT, {
      details: {
        entityType,
        entityId: String(document._id),
        currentVersion: document.version,
        conflictingFields,
        current: serialize(document),
      },
    });
  }

  async function findOwned(context, id) {
    const document = await model.findOne({ _id: id, userId: context.userId, deletedAt: null });
    if (!document) throw notFound();
    return document;
  }

  /**
   * Creates an entity. `id` may be supplied by the client; reusing an id answers
   * 409 ID_ALREADY_EXISTS, which lets a client treat a retried create as already done.
   */
  async function create(context, attributes, { id } = {}) {
    if (maxPerUser !== undefined) {
      const count = await model.countDocuments({ userId: context.userId, deletedAt: null });
      if (count >= maxPerUser) {
        throw limitExceeded({ details: { entityType, limit: maxPerUser } });
      }
    }

    const document = new model({
      ...attributes,
      _id: id ?? randomUUID(),
      userId: context.userId,
      version: 1,
    });
    await document.validate();
    const now = new Date();
    document.createdAt = now;
    document.updatedAt = now;
    document._outbox = [
      buildEvent(
        'created',
        document,
        context,
        Object.keys(snapshotFields(document)),
        serialize(document),
      ),
    ];

    try {
      await document.save({ timestamps: false });
    } catch (error) {
      if (error?.code === 11000 && error.keyPattern?._id) {
        throw conflict(ERROR_CODES.ID_ALREADY_EXISTS);
      }
      throw error;
    }

    await flushOutboxSafely(model, document._id, context.userId);
    return document;
  }

  /**
   * Runs `mutator(document)` and persists whatever it changed as one new version.
   *
   * @param {object}   options
   * @param {number}  [options.baseVersion]    Version the caller's change was based on.
   * @param {string[]} [options.intendedFields] Fields the caller means to change. Needed to
   *                   merge a stale change; without it a stale `baseVersion` always conflicts.
   * @returns {Promise<{ document: object, changedFields: string[] }>}
   */
  async function mutate(context, id, mutator, { baseVersion, intendedFields } = {}) {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const document = await findOwned(context, id);
      if (baseVersion !== undefined && baseVersion !== document.version) {
        await assertMergeable(document, baseVersion, intendedFields);
      }

      const readVersion = document.version;
      const before = snapshotFields(document);
      await mutator(document);
      await document.validate();
      const after = snapshotFields(document);
      const changedFields = diffFields(before, after);
      if (changedFields.length === 0) {
        return { document, changedFields };
      }

      const now = new Date();
      document.version = readVersion + 1;
      document.updatedAt = now;

      const $set = { version: document.version, updatedAt: now };
      const $unset = {};
      for (const field of changedFields) {
        if (after[field] === undefined) $unset[field] = '';
        else $set[field] = after[field];
      }
      const update = {
        $set,
        $push: {
          _outbox: buildEvent('updated', document, context, changedFields, serialize(document)),
        },
      };
      if (Object.keys($unset).length > 0) update.$unset = $unset;

      const result = await model.updateOne(
        { _id: id, userId: context.userId, version: readVersion, deletedAt: null },
        update,
        { timestamps: false },
      );
      if (result.modifiedCount === 1) {
        await flushOutboxSafely(model, document._id, context.userId);
        return { document, changedFields };
      }
      // Another writer got in between the read and the write: read again and retry.
    }
    throw conflict(ERROR_CODES.VERSION_CONFLICT);
  }

  /** Applies a partial update (see `assignPatch`). */
  async function update(context, id, patch, { baseVersion } = {}) {
    const intendedFields = Object.keys(patch).filter((key) => patch[key] !== undefined);
    const { document } = await mutate(context, id, (target) => assignPatch(target, patch), {
      baseVersion,
      intendedFields,
    });
    return document;
  }

  /**
   * Soft-deletes an entity, leaving a tombstone. Deletion wins over concurrent updates, so no
   * base version is required.
   */
  async function remove(context, id) {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const document = await findOwned(context, id);
      const readVersion = document.version;
      const now = new Date();
      document.version = readVersion + 1;
      document.deletedAt = now;
      document.updatedAt = now;

      const result = await model.updateOne(
        { _id: id, userId: context.userId, version: readVersion, deletedAt: null },
        {
          $set: { version: document.version, deletedAt: now, updatedAt: now },
          $push: {
            _outbox: buildEvent('deleted', document, context, [], {
              id: String(document._id),
              version: document.version,
              deletedAt: now.toISOString(),
            }),
          },
        },
        { timestamps: false },
      );
      if (result.modifiedCount === 1) {
        await flushOutboxSafely(model, document._id, context.userId);
        return document;
      }
    }
    throw conflict(ERROR_CODES.VERSION_CONFLICT);
  }

  /** Lists live entities of the user. `filter` must not contain `userId` or `deletedAt`. */
  async function find(context, filter = {}, { sort = { createdAt: -1 }, page, limit } = {}) {
    const query = { ...filter, userId: context.userId, deletedAt: null };
    const cursor = model.find(query).sort(sort);
    if (page !== undefined && limit !== undefined) {
      cursor.skip((page - 1) * limit).limit(limit);
      const [items, total] = await Promise.all([cursor, model.countDocuments(query)]);
      return { items, total };
    }
    const items = await cursor;
    return { items, total: items.length };
  }

  const service = {
    entityType,
    model,
    serialize,
    create,
    update,
    mutate,
    remove,
    find,
    getById: findOwned,
  };
  entityServices.set(entityType, service);
  return service;
}
