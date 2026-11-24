import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { baseResource, createEntityService } from '../src/core/entity/entity-service.js';
import { syncedEntity } from '../src/database/plugins/synced-entity.js';
import { subscribe } from '../src/modules/events/event-bus.js';
import { flushOutbox, sweepOutboxes } from '../src/modules/events/outbox-relay.js';
import { SyncEvent } from '../src/modules/events/sync-event.model.js';
import { useTestDatabase } from './helpers/database.js';

// A minimal synchronized entity used only to exercise the shared write path.
const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 50 },
    body: { type: String, default: '' },
    tags: { type: [String], default: [] },
    style: {
      color: { type: String, default: 'blue' },
      pinned: { type: Boolean, default: false },
    },
  },
  { collection: 'testNotes' },
);
noteSchema.plugin(syncedEntity);
const TestNote = mongoose.model('TestNote', noteSchema);

const serialize = (note) => ({
  ...baseResource(note),
  title: note.title,
  body: note.body,
  tags: [...note.tags],
  style: { color: note.style.color, pinned: note.style.pinned },
});

const notes = createEntityService({
  entityType: 'testNote',
  model: TestNote,
  serialize,
  maxPerUser: 5,
});

const newContext = () => ({ userId: randomUUID(), deviceId: randomUUID() });
const eventsOf = (userId) => SyncEvent.find({ userId }).sort({ seq: 1 }).lean();

describe('entity service', () => {
  useTestDatabase();

  it('creates version 1 and logs a created event with the full resource', async () => {
    const context = newContext();
    const note = await notes.create(context, { title: 'First' });
    expect(note.version).toBe(1);

    const [event] = await eventsOf(context.userId);
    expect(event).toMatchObject({
      seq: 1,
      type: 'testNote.created',
      entityType: 'testNote',
      entityId: note.id,
      entityVersion: 1,
      schemaVersion: 1,
      deviceId: context.deviceId,
    });
    expect(event.data).toMatchObject({ id: note.id, title: 'First', version: 1 });

    const stored = await TestNote.findById(note.id).select('+_outbox').lean();
    expect(stored._outbox).toEqual([]);
  });

  it('accepts a client-generated id and reports a reused one', async () => {
    const context = newContext();
    const id = randomUUID();
    const note = await notes.create(context, { title: 'Mine' }, { id });
    expect(note.id).toBe(id);
    await expect(notes.create(context, { title: 'Again' }, { id })).rejects.toMatchObject({
      status: 409,
      code: 'ID_ALREADY_EXISTS',
    });
    // Another user cannot learn anything about the id either.
    await expect(notes.create(newContext(), { title: 'Other' }, { id })).rejects.toMatchObject({
      code: 'ID_ALREADY_EXISTS',
    });
  });

  it('increments the version only when something actually changed', async () => {
    const context = newContext();
    const note = await notes.create(context, { title: 'Stable', tags: ['a'] });

    const same = await notes.update(context, note.id, { title: 'Stable', tags: ['a'] });
    expect(same.version).toBe(1);

    const changed = await notes.update(context, note.id, { title: 'Changed' });
    expect(changed.version).toBe(2);

    const events = await eventsOf(context.userId);
    expect(events.map((event) => [event.seq, event.type, event.entityVersion])).toEqual([
      [1, 'testNote.created', 1],
      [2, 'testNote.updated', 2],
    ]);
    expect(events[1].changedFields).toEqual(['title']);
  });

  it('merges nested objects key by key and replaces arrays', async () => {
    const context = newContext();
    const note = await notes.create(context, { title: 'N', tags: ['a', 'b'] });
    const updated = await notes.update(context, note.id, {
      style: { pinned: true },
      tags: ['c'],
    });
    expect(serialize(updated)).toMatchObject({
      style: { color: 'blue', pinned: true },
      tags: ['c'],
    });
    const stored = await TestNote.findById(note.id).lean();
    expect(stored.style).toEqual({ color: 'blue', pinned: true });
  });

  it('validates updates with the model rules', async () => {
    const context = newContext();
    const note = await notes.create(context, { title: 'Short' });
    await expect(notes.update(context, note.id, { title: 'x'.repeat(51) })).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError,
    );
    expect((await TestNote.findById(note.id).lean()).version).toBe(1);
  });

  describe('optimistic concurrency', () => {
    it('applies an update based on the current version', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'v1' });
      const updated = await notes.update(context, note.id, { title: 'v2' }, { baseVersion: 1 });
      expect(updated.version).toBe(2);
    });

    it('merges a stale update that touches different fields', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Title', body: 'Body' });
      await notes.update(context, note.id, { title: 'Title from device A' }, { baseVersion: 1 });

      // Device B still has version 1 and edits another field.
      const merged = await notes.update(
        { ...context, deviceId: randomUUID() },
        note.id,
        { body: 'Body from device B' },
        { baseVersion: 1 },
      );
      expect(merged).toMatchObject({
        version: 3,
        title: 'Title from device A',
        body: 'Body from device B',
      });
    });

    it('reports a conflict when a stale update touches a field that changed', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Original' });
      await notes.update(context, note.id, { title: 'Newer' }, { baseVersion: 1 });

      const error = await notes
        .update(context, note.id, { title: 'Older edit', body: 'x' }, { baseVersion: 1 })
        .catch((caught) => caught);
      expect(error).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
      expect(error.details).toMatchObject({
        entityType: 'testNote',
        entityId: note.id,
        currentVersion: 2,
        conflictingFields: ['title'],
      });
      expect(error.details.current.title).toBe('Newer');

      // Nothing was overwritten.
      const stored = await TestNote.findById(note.id).lean();
      expect(stored).toMatchObject({ title: 'Newer', body: '', version: 2 });
    });

    it('rejects a base version from the future', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Now' });
      await expect(
        notes.update(context, note.id, { title: 'Later' }, { baseVersion: 9 }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    it('serializes concurrent writers without losing an update', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Counter', tags: [] });
      await Promise.all(
        ['a', 'b', 'c'].map((tag) =>
          notes.mutate(context, note.id, (document) => {
            document.tags = [...document.tags, tag];
          }),
        ),
      );
      const stored = await TestNote.findById(note.id).lean();
      expect([...stored.tags].sort()).toEqual(['a', 'b', 'c']);
      expect(stored.version).toBe(4);
      const versions = (await eventsOf(context.userId)).map((event) => event.entityVersion);
      expect(versions).toEqual([1, 2, 3, 4]);
    });
  });

  describe('deletion', () => {
    it('leaves a tombstone, logs a deleted event and hides the entity', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Temporary' });
      await notes.remove(context, note.id);

      await expect(notes.getById(context, note.id)).rejects.toMatchObject({ status: 404 });
      expect((await notes.find(context)).items).toHaveLength(0);

      const stored = await TestNote.findById(note.id).lean();
      expect(stored.deletedAt).toBeInstanceOf(Date);
      expect(stored.version).toBe(2);

      const events = await eventsOf(context.userId);
      expect(events.at(-1)).toMatchObject({ type: 'testNote.deleted', entityVersion: 2 });
      expect(events.at(-1).data).toMatchObject({ id: note.id, version: 2 });

      await expect(notes.update(context, note.id, { title: 'Zombie' })).rejects.toMatchObject({
        status: 404,
      });
      await expect(notes.remove(context, note.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('ownership and limits', () => {
    it('treats another user’s entity as not found', async () => {
      const owner = newContext();
      const stranger = newContext();
      const note = await notes.create(owner, { title: 'Private' });

      await expect(notes.getById(stranger, note.id)).rejects.toMatchObject({ status: 404 });
      await expect(notes.update(stranger, note.id, { title: 'Hacked' })).rejects.toMatchObject({
        status: 404,
      });
      await expect(notes.remove(stranger, note.id)).rejects.toMatchObject({ status: 404 });
      expect((await notes.find(stranger)).items).toHaveLength(0);
      expect((await TestNote.findById(note.id).lean()).title).toBe('Private');
    });

    it('enforces the per-user limit without counting deleted entities', async () => {
      const context = newContext();
      const created = [];
      for (let index = 0; index < 5; index += 1) {
        created.push(await notes.create(context, { title: `Note ${index}` }));
      }
      await expect(notes.create(context, { title: 'One too many' })).rejects.toMatchObject({
        status: 422,
        code: 'LIMIT_EXCEEDED',
      });
      await notes.remove(context, created[0].id);
      await expect(notes.create(context, { title: 'Fits again' })).resolves.toBeTruthy();
    });

    it('paginates and sorts', async () => {
      const context = newContext();
      for (const title of ['b', 'a', 'c']) await notes.create(context, { title });
      const page = await notes.find(context, {}, { sort: { title: 1 }, page: 1, limit: 2 });
      expect(page.total).toBe(3);
      expect(page.items.map((note) => note.title)).toEqual(['a', 'b']);
    });
  });

  describe('outbox relay', () => {
    it('assigns dense per-user sequence numbers across entities', async () => {
      const first = newContext();
      const second = newContext();
      const a = await notes.create(first, { title: 'A' });
      await notes.create(second, { title: 'Other user' });
      await notes.create(first, { title: 'B' });
      await notes.update(first, a.id, { title: 'A2' });

      expect((await eventsOf(first.userId)).map((event) => event.seq)).toEqual([1, 2, 3]);
      expect((await eventsOf(second.userId)).map((event) => event.seq)).toEqual([1]);
    });

    it('delivers an event that was committed but never relayed', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Stranded' });

      // Simulate a crash after the atomic write and before the relay: the change and its
      // event exist only in the entity document.
      const eventId = randomUUID();
      await TestNote.updateOne(
        { _id: note.id },
        {
          $set: {
            title: 'Changed before crash',
            version: 2,
            updatedAt: new Date(Date.now() - 10_000),
          },
          $push: {
            _outbox: {
              eventId,
              type: 'testNote.updated',
              entityVersion: 2,
              occurredAt: new Date(),
              changedFields: ['title'],
              data: { id: note.id, title: 'Changed before crash', version: 2 },
            },
          },
        },
        { timestamps: false },
      );
      expect(await SyncEvent.findById(eventId)).toBeNull();

      const received = [];
      const unsubscribe = subscribe('test', (event) => received.push(event));
      const delivered = await sweepOutboxes({ minAgeMs: 1000 });
      unsubscribe();

      expect(delivered).toBeGreaterThanOrEqual(1);
      const logged = await SyncEvent.findById(eventId).lean();
      expect(logged).toMatchObject({ seq: 2, entityVersion: 2, userId: context.userId });
      expect(received.find((event) => event.eventId === eventId)).toMatchObject({
        event: 'testNote.updated',
        seq: 2,
        entityId: note.id,
      });
      expect((await TestNote.findById(note.id).select('+_outbox').lean())._outbox).toEqual([]);
    });

    it('logs an event exactly once when the relay runs repeatedly and concurrently', async () => {
      const context = newContext();
      const note = await notes.create(context, { title: 'Once' });
      const eventId = randomUUID();
      const pending = {
        eventId,
        type: 'testNote.updated',
        entityVersion: 2,
        occurredAt: new Date(),
        changedFields: ['title'],
        data: { id: note.id, version: 2 },
      };
      await TestNote.updateOne({ _id: note.id }, { $push: { _outbox: pending } });

      await Promise.all([
        flushOutbox(TestNote, note.id, context.userId),
        flushOutbox(TestNote, note.id, context.userId),
        flushOutbox(TestNote, note.id, context.userId),
      ]);
      // A crash after logging but before clearing leaves the event in the outbox again.
      await TestNote.updateOne({ _id: note.id }, { $push: { _outbox: pending } });
      await flushOutbox(TestNote, note.id, context.userId);

      const events = await eventsOf(context.userId);
      expect(events.filter((event) => event._id === eventId)).toHaveLength(1);
      expect(events.map((event) => event.seq)).toEqual([1, 2]);
      expect((await TestNote.findById(note.id).select('+_outbox').lean())._outbox).toEqual([]);
    });

    it('keeps the request successful when a subscriber throws', async () => {
      const context = newContext();
      const handler = vi.fn().mockRejectedValue(new Error('subscriber is broken'));
      const unsubscribe = subscribe('broken', handler, { types: ['testNote.created'] });
      await expect(notes.create(context, { title: 'Still fine' })).resolves.toBeTruthy();
      unsubscribe();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(await eventsOf(context.userId)).toHaveLength(1);
    });
  });
});
