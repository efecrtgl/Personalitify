import { ENTITY_TYPES, ERROR_CODES } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { achievementSchema } from '../modules/achievements/achievements.routes.js';
import { tokensSchema } from '../modules/auth/auth.schemas.js';
import { calendarEventSchema } from '../modules/calendar/calendar.routes.js';
import { categorySchema } from '../modules/categories/categories.routes.js';
import { deviceSchema } from '../modules/devices/devices.routes.js';
import { eventSchema } from '../modules/events/events.routes.js';
import { focusSessionSchema } from '../modules/focus/focus.routes.js';
import { goalSchema } from '../modules/goals/goals.routes.js';
import { habitEntrySchema, habitSchema } from '../modules/habits/habits.schemas.js';
import { journalEntrySchema } from '../modules/journal/journal.routes.js';
import { moodEntrySchema } from '../modules/mood/mood.routes.js';
import { notificationSchema } from '../modules/notifications/notifications.routes.js';
import { settingsSchema } from '../modules/settings/settings.schemas.js';
import { taskSchema } from '../modules/tasks/tasks.routes.js';
import { profileSchema, userSchema } from '../modules/users/users.schemas.js';
import { API_PACKAGE_VERSION } from './version.js';

/**
 * The shape of every synchronized entity, by entity type.
 *
 * An entity has this shape wherever it appears: in the answer of its REST endpoints, in a
 * synchronization snapshot, in the `data` of a change and in the `data` of an event. A
 * client needs one type per entry of this map and nothing else to hold the account's data.
 */
export const ENTITY_SCHEMAS = Object.freeze({
  [ENTITY_TYPES.PROFILE]: profileSchema,
  [ENTITY_TYPES.SETTINGS]: settingsSchema,
  [ENTITY_TYPES.CATEGORY]: categorySchema,
  [ENTITY_TYPES.HABIT]: habitSchema,
  [ENTITY_TYPES.HABIT_ENTRY]: habitEntrySchema,
  [ENTITY_TYPES.GOAL]: goalSchema,
  [ENTITY_TYPES.TASK]: taskSchema,
  [ENTITY_TYPES.CALENDAR_EVENT]: calendarEventSchema,
  [ENTITY_TYPES.FOCUS_SESSION]: focusSessionSchema,
  [ENTITY_TYPES.JOURNAL_ENTRY]: journalEntrySchema,
  [ENTITY_TYPES.MOOD_ENTRY]: moodEntrySchema,
  [ENTITY_TYPES.ACHIEVEMENT]: achievementSchema,
  [ENTITY_TYPES.NOTIFICATION]: notificationSchema,
});

const errorSchema = z
  .strictObject({
    error: z.strictObject({
      code: z.enum(Object.values(ERROR_CODES)).describe('Stable; clients branch on this'),
      message: z.string().describe('For people, in the language of the request'),
      details: z
        .unknown()
        .optional()
        .describe(
          'For VALIDATION_FAILED a list of { path, code, message }; for VERSION_CONFLICT ' +
            '{ entityType, entityId, currentVersion, conflictingFields, current }',
        ),
      requestId: z.string().describe('Also in the X-Request-Id header; quote it in reports'),
    }),
  })
  .describe('Body of every failed request');

const tombstoneSchema = z
  .strictObject({ id: z.string(), version: z.int(), deletedAt: z.string() })
  .describe('The `data` of a `<entity>.deleted` event');

const changeSchema = z
  .strictObject({
    seq: z.int(),
    entityType: z.enum(Object.keys(ENTITY_SCHEMAS)),
    entityId: z.string(),
    version: z.int(),
    deleted: z.boolean(),
    changedAt: z.string(),
    data: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe('The entity in the shape of its type; null when `deleted`'),
  })
  .describe('One entry of GET /sync/changes');

/** Schemas that are not entities but that every client meets. */
const SUPPORTING_SCHEMAS = Object.freeze({
  error: errorSchema,
  event: eventSchema,
  'event-tombstone': tombstoneSchema,
  'sync-change': changeSchema,
  tokens: tokensSchema,
  user: userSchema,
  device: deviceSchema,
});

const BASE_ID = 'https://github.com/efecrtgl/Personalitify/blob/main/docs/api/schemas';

function toJsonSchema(name, schema) {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' });
  return { $schema, $id: `${BASE_ID}/${name}.schema.json`, ...rest };
}

/**
 * Standalone JSON Schema documents (draft 2020-12), one per file name, for clients written
 * in other languages to generate their types from. Generated from the very schemas the API
 * checks its own answers against.
 */
export function buildJsonSchemas() {
  const documents = {};
  for (const [entityType, schema] of Object.entries(ENTITY_SCHEMAS)) {
    documents[`entities/${entityType}.schema.json`] = toJsonSchema(
      `entities/${entityType}`,
      schema,
    );
  }
  for (const [name, schema] of Object.entries(SUPPORTING_SCHEMAS)) {
    documents[`${name}.schema.json`] = toJsonSchema(name, schema);
  }
  documents['index.json'] = {
    title: 'Personalitify API schemas',
    apiVersion: API_PACKAGE_VERSION,
    description:
      'JSON Schema (draft 2020-12) for the data a client stores and exchanges. `entities` ' +
      'maps an entity type to its schema; an entity has that shape in REST answers, ' +
      'snapshots, changes and events.',
    entities: Object.fromEntries(
      Object.keys(ENTITY_SCHEMAS).map((type) => [type, `entities/${type}.schema.json`]),
    ),
    supporting: Object.fromEntries(
      Object.keys(SUPPORTING_SCHEMAS).map((name) => [name, `${name}.schema.json`]),
    ),
  };
  return documents;
}
