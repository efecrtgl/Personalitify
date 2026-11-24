import { z } from 'zod';
import { createModule, withMeta } from '../../core/routing.js';
import { MAX_EVENTS_PER_READ, readEvents } from './events.service.js';

export const eventSchema = z
  .strictObject({
    eventId: z.string(),
    event: z.string().describe('`<entityType>.<created|updated|deleted>`'),
    schemaVersion: z.int(),
    seq: z.int().describe('Position in the user’s event log; dense, starting at 1'),
    userId: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    entityVersion: z.int(),
    timestamp: z.string(),
    originDeviceId: z
      .string()
      .nullable()
      .describe('The device whose request caused the event; null for the server itself'),
    opId: z.string().nullable(),
    changedFields: z.array(z.string()),
    data: z
      .record(z.string(), z.unknown())
      .describe('The entity after the change; for a deletion its id, version and deletedAt'),
  })
  .describe('Domain event');

const events = createModule({
  tag: 'Events',
  description:
    'The user’s ordered log of changes. Every create, update and delete of a synchronized ' +
    'entity is one event with the next sequence number. The same events are pushed over ' +
    'the realtime connection; this endpoint is how a client reads what it missed.',
  basePath: '/events',
});

events.get(
  '',
  {
    summary: 'Read events after a sequence number',
    description:
      'Events are returned in order without gaps. `meta.headSeq` is the user’s latest ' +
      'sequence number; while `meta.hasMore` is true, ask again from the last event received.',
    query: z.strictObject({
      after: z.coerce.number().int().min(0).default(0).describe('Return events with a higher seq'),
      limit: z.coerce.number().int().min(1).max(MAX_EVENTS_PER_READ).default(200),
    }),
    response: z.array(eventSchema),
    responseMeta: z.strictObject({ headSeq: z.int(), hasMore: z.boolean() }),
  },
  async ({ auth, query }) => {
    const { events: items, headSeq, hasMore } = await readEvents(auth.userId, query);
    return withMeta(items, { headSeq, hasMore });
  },
);

export const eventsRouter = events.router;
