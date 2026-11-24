import { randomUUID } from 'node:crypto';
import { JOURNAL_KINDS, JOURNAL_LIMITS } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Text folded for searching: lower case, without accents, and with every form of the letter
 * i (I, İ, ı, i) as one. "Çalışma" and "calisma" then find each other, in Turkish and in
 * English alike, without depending on the language of the text.
 */
export function foldText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ı', 'i')
    .toLowerCase();
}

/** Markdown reduced to plain words, for previews and word counts. */
export function plainText(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A journal entry (about a day) or a free note. The body is Markdown. Journal text is the
 * most private data in the product: it is returned only to its owner and never logged.
 */
const journalEntrySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: JOURNAL_KINDS, default: 'journal' },
    title: { type: String, default: '', trim: true, maxlength: JOURNAL_LIMITS.titleLength },
    body: { type: String, default: '', maxlength: JOURNAL_LIMITS.bodyLength },
    // The day the entry is about, in the user's time zone.
    date: { type: String, required: true, match: LOCAL_DATE },
    tags: {
      type: [{ type: String, maxlength: JOURNAL_LIMITS.tagLength }],
      default: [],
      validate: (value) => value.length <= JOURNAL_LIMITS.tags,
    },
    pinned: { type: Boolean, default: false },
    // Title, body and tags folded for searching (see `foldText`); never exposed.
    searchText: { type: String, default: '' },
  },
  { collection: 'journalEntries' },
);

journalEntrySchema.plugin(syncedEntity);
journalEntrySchema.index({ userId: 1, deletedAt: 1, pinned: -1, date: -1, updatedAt: -1 });
journalEntrySchema.index({ userId: 1, deletedAt: 1, tags: 1 });

export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

export function serializeJournalEntry(entry) {
  return {
    ...baseResource(entry),
    kind: entry.kind,
    title: entry.title,
    body: entry.body,
    date: entry.date,
    tags: [...entry.tags],
    pinned: entry.pinned,
  };
}

/**
 * Earlier contents of an entry. Written by the server whenever the title or body of an
 * entry is replaced; a bounded history per entry, removed together with it.
 */
const journalRevisionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true, immutable: true },
    entryId: { type: String, required: true, immutable: true },
    // The version of the entry that held this content.
    entryVersion: { type: Number, required: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    // When this content was replaced by a newer one.
    replacedAt: { type: Date, required: true },
  },
  { collection: 'journalRevisions', versionKey: false },
);

journalRevisionSchema.index({ userId: 1, entryId: 1, replacedAt: -1 });

export const JournalRevision = mongoose.model('JournalRevision', journalRevisionSchema);

export function serializeJournalRevision(revision) {
  return {
    id: String(revision._id),
    entryId: revision.entryId,
    entryVersion: revision.entryVersion,
    title: revision.title,
    body: revision.body,
    replacedAt: revision.replacedAt.toISOString(),
  };
}
