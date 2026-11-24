import { JOURNAL_KINDS, JOURNAL_LIMITS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule, withMeta } from '../../core/routing.js';
import {
  baseVersionSchema,
  idSchema,
  localDateSchema,
  paginationMeta,
  paginationMetaSchema,
  paginationQuery,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  listRevisions,
  listTags,
  restoreRevision,
  updateEntry,
} from './journal.service.js';

const entryFields = {
  ...syncedResourceFields,
  kind: z.enum(JOURNAL_KINDS),
  title: z.string(),
  date: z.string().describe('The day the entry is about, in the user’s time zone'),
  tags: z.array(z.string()),
  pinned: z.boolean(),
};

export const journalEntrySchema = z
  .strictObject({ ...entryFields, body: z.string().describe('Markdown') })
  .describe('Journal entry');

const listItemSchema = z
  .strictObject({
    ...entryFields,
    excerpt: z
      .string()
      .describe('Start of the text without Markdown; empty when previews are hidden in settings'),
    truncated: z.boolean(),
    wordCount: z.int(),
  })
  .describe('Journal entry without its body');

const revisionSchema = z
  .strictObject({
    id: z.string(),
    entryId: z.string(),
    entryVersion: z.int().describe('Version of the entry that held this content'),
    title: z.string(),
    body: z.string(),
    replacedAt: z.string().describe('When this content was replaced by a newer one'),
  })
  .describe('Earlier content of a journal entry');

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(JOURNAL_LIMITS.tagLength)
  .regex(/^#*[^\s,#]+$/u, 'v:invalid_format');
const input = {
  kind: z.enum(JOURNAL_KINDS),
  title: z.string().trim().max(JOURNAL_LIMITS.titleLength),
  body: z.string().max(JOURNAL_LIMITS.bodyLength),
  date: localDateSchema,
  tags: z.array(tagSchema).max(JOURNAL_LIMITS.tags),
  pinned: z.boolean(),
};

const params = z.strictObject({ entryId: idSchema });

const journal = createModule({
  tag: 'Journal',
  description:
    'Journal entries and notes written in Markdown, with tags, search and a history of ' +
    'earlier contents. Entries are private to the account; lists return previews instead ' +
    'of bodies, and no preview at all when the user hides sensitive previews.',
  basePath: '/journal',
});

journal.get(
  '',
  {
    summary: 'List or search entries',
    description:
      'Pinned entries first, then by day, newest first. `q` finds entries that contain ' +
      'every word of the query in their title, text or tags, ignoring case and accents.',
    query: z.strictObject({
      kind: z.enum(JOURNAL_KINDS).optional(),
      tag: z.string().trim().min(1).max(JOURNAL_LIMITS.tagLength).optional(),
      q: z.string().trim().max(100).optional(),
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
      pinned: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional(),
      ...paginationQuery,
    }),
    response: z.array(listItemSchema),
    responseMeta: paginationMetaSchema,
  },
  async ({ auth, query }) => {
    const { items, total } = await listEntries(auth, query);
    return withMeta(items, paginationMeta({ ...query, total }));
  },
);

journal.get(
  '/tags',
  {
    summary: 'List the tags in use',
    response: z.array(z.strictObject({ tag: z.string(), count: z.int() })),
  },
  ({ auth }) => listTags(auth),
);

journal.post(
  '',
  {
    summary: 'Create an entry',
    description: 'Without `date` the entry belongs to today in the user’s time zone.',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      kind: input.kind.default('journal'),
      title: input.title.default(''),
      body: input.body.default(''),
      date: input.date.optional(),
      tags: input.tags.default([]),
      pinned: input.pinned.default(false),
    }),
    response: journalEntrySchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createEntry(auth, body),
);

journal.get(
  '/:entryId',
  { summary: 'Get an entry', params, response: journalEntrySchema, errors: ['NOT_FOUND'] },
  ({ auth, params: { entryId } }) => getEntry(auth, entryId),
);

journal.patch(
  '/:entryId',
  {
    summary: 'Update an entry',
    description:
      'Replacing the title or the body keeps the previous content as a revision (the ' +
      `newest ${JOURNAL_LIMITS.revisions} are kept).`,
    params,
    body: z.strictObject({
      kind: input.kind.optional(),
      title: input.title.optional(),
      body: input.body.optional(),
      date: input.date.optional(),
      tags: input.tags.optional(),
      pinned: input.pinned.optional(),
      baseVersion: baseVersionSchema,
    }),
    response: journalEntrySchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params: { entryId }, body }) => updateEntry(auth, entryId, body),
);

journal.delete(
  '/:entryId',
  {
    summary: 'Delete an entry',
    description: 'Its revisions are removed with it.',
    params,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  async ({ auth, params: { entryId } }) => {
    await deleteEntry(auth, entryId);
  },
);

journal.get(
  '/:entryId/revisions',
  {
    summary: 'List earlier contents of an entry',
    params,
    response: z.array(revisionSchema),
    errors: ['NOT_FOUND'],
  },
  ({ auth, params: { entryId } }) => listRevisions(auth, entryId),
);

journal.post(
  '/:entryId/revisions/:revisionId/restore',
  {
    summary: 'Restore an earlier content',
    description: 'The content that is replaced becomes a revision itself.',
    params: z.strictObject({ entryId: idSchema, revisionId: idSchema }),
    response: journalEntrySchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params: { entryId, revisionId } }) => restoreRevision(auth, entryId, revisionId),
);

export const journalRouter = journal.router;
