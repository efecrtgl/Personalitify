import { ENTITY_TYPES, JOURNAL_LIMITS } from '@personalitify/shared-contracts';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { fieldError, notFound } from '../../core/errors.js';
import { registerUserCollection } from '../../core/user-data.js';
import { getUserCalendar } from '../habits/habits.service.js';
import { getUserPreferences } from '../settings/settings.service.js';
import {
  JournalEntry,
  JournalRevision,
  foldText,
  plainText,
  serializeJournalEntry,
  serializeJournalRevision,
} from './journal-entry.model.js';

export const journalService = createEntityService({
  entityType: ENTITY_TYPES.JOURNAL_ENTRY,
  model: JournalEntry,
  serialize: serializeJournalEntry,
  maxPerUser: 5000,
});

registerUserCollection({
  key: 'journalRevisions',
  model: JournalRevision,
  serialize: serializeJournalRevision,
});

const EXCERPT_LENGTH = 240;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tags as they are stored: lower case, without the leading `#`, each once. */
export function normalizeTags(tags) {
  // A capital dotted I lower-cases to two code points in JavaScript; fold it first.
  const cleaned = tags
    .map((tag) => tag.trim().replace(/^#+/, '').replaceAll('İ', 'i').toLowerCase())
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function refreshSearchText(entry) {
  entry.searchText = foldText([entry.title, plainText(entry.body), ...entry.tags].join(' '));
}

/** An entry as lists show it: without the body, with a plain-text preview. */
function toListItem(entry, hidePreview) {
  const { body, ...rest } = serializeJournalEntry(entry);
  const text = plainText(body);
  return {
    ...rest,
    excerpt: hidePreview ? '' : text.slice(0, EXCERPT_LENGTH),
    truncated: !hidePreview && text.length > EXCERPT_LENGTH,
    wordCount: text === '' ? 0 : text.split(' ').length,
  };
}

export async function listEntries(auth, { kind, tag, q, from, to, pinned, page, limit }) {
  if (from && to && to < from) throw fieldError('to', 'end_before_start');
  const filter = {};
  if (kind) filter.kind = kind;
  if (tag) filter.tags = normalizeTags([tag])[0] ?? '';
  if (pinned !== undefined) filter.pinned = pinned;
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  // Every word of the query must appear somewhere in the title, body or tags.
  const words = foldText(q ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (words.length > 0) {
    filter.$and = words.map((word) => ({ searchText: { $regex: escapeRegExp(word) } }));
  }

  const [preferences, { items, total }] = await Promise.all([
    getUserPreferences(auth.userId),
    journalService.find(auth, filter, {
      sort: { pinned: -1, date: -1, updatedAt: -1 },
      page,
      limit,
    }),
  ]);
  const hidePreview = Boolean(preferences?.privacy?.hideSensitivePreviews);
  return { items: items.map((entry) => toListItem(entry, hidePreview)), total };
}

/** The user's tags with the number of entries that carry each, most used first. */
export async function listTags(auth) {
  const rows = await JournalEntry.aggregate([
    { $match: { userId: auth.userId, deletedAt: null } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 200 },
  ]);
  return rows.map((row) => ({ tag: row._id, count: row.count }));
}

export async function createEntry(auth, { id, tags, date, ...input }) {
  const attributes = {
    ...input,
    tags: normalizeTags(tags),
    date: date ?? (await getUserCalendar(auth.userId)).today,
  };
  const draft = { title: '', body: '', ...attributes };
  refreshSearchText(draft);
  return serializeJournalEntry(await journalService.create(auth, draft, { id }));
}

export async function getEntry(auth, id) {
  return serializeJournalEntry(await journalService.getById(auth, id));
}

/**
 * Updates an entry. When the title or the body is replaced, the content it had is kept as a
 * revision first, and the oldest revisions beyond the limit are dropped.
 */
export async function updateEntry(auth, id, { baseVersion, tags, ...patch }) {
  const changes = { ...patch, ...(tags === undefined ? {} : { tags: normalizeTags(tags) }) };
  let previous = null;
  const { document, changedFields } = await journalService.mutate(
    auth,
    id,
    (entry) => {
      previous = { entryVersion: entry.version, title: entry.title, body: entry.body };
      assignPatch(entry, changes);
      refreshSearchText(entry);
    },
    { baseVersion, intendedFields: Object.keys(changes) },
  );

  if (changedFields.includes('title') || changedFields.includes('body')) {
    await JournalRevision.create({
      userId: auth.userId,
      entryId: id,
      ...previous,
      replacedAt: new Date(),
    });
    const outdated = await JournalRevision.find({ userId: auth.userId, entryId: id })
      .sort({ replacedAt: -1, entryVersion: -1 })
      .skip(JOURNAL_LIMITS.revisions)
      .select('_id')
      .lean();
    if (outdated.length > 0) {
      await JournalRevision.deleteMany({ _id: { $in: outdated.map((revision) => revision._id) } });
    }
  }
  return serializeJournalEntry(document);
}

export async function deleteEntry(auth, id) {
  await journalService.remove(auth, id);
  await JournalRevision.deleteMany({ userId: auth.userId, entryId: id });
}

// The history of an entry goes with it.

/** Earlier contents of an entry, newest first. */
export async function listRevisions(auth, entryId) {
  await journalService.getById(auth, entryId);
  const revisions = await JournalRevision.find({ userId: auth.userId, entryId }).sort({
    replacedAt: -1,
    entryVersion: -1,
  });
  return revisions.map(serializeJournalRevision);
}

/** Puts an earlier content back. The content it replaces becomes a revision itself. */
export async function restoreRevision(auth, entryId, revisionId) {
  const revision = await JournalRevision.findOne({ _id: revisionId, userId: auth.userId, entryId });
  if (!revision) throw notFound();
  return updateEntry(auth, entryId, { title: revision.title, body: revision.body });
}
