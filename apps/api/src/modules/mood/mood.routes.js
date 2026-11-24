import { MOOD_EMOTIONS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { localDateSchema } from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import { clearMood, getMoodRange, setMood } from './mood.service.js';

export const moodEntrySchema = z
  .strictObject({
    ...syncedResourceFields,
    date: z.string(),
    score: z.int().describe('1 = very bad … 5 = very good'),
    emotions: z.array(z.enum(MOOD_EMOTIONS)),
    note: z.string(),
  })
  .describe('Mood entry');

const averageSchema = z
  .number()
  .nullable()
  .describe('Mean score, two decimals; null without entries');
const params = z.strictObject({ date: localDateSchema });

const mood = createModule({
  tag: 'Mood',
  description:
    'How each day felt: one entry per calendar day in the user’s time zone. Notes are ' +
    'private to the account.',
  basePath: '/mood',
});

mood.get(
  '',
  {
    summary: 'Mood entries of a range with their statistics',
    description: 'At most 400 days per request.',
    query: z.strictObject({ from: localDateSchema, to: localDateSchema }),
    response: z.strictObject({
      from: z.string(),
      to: z.string(),
      today: z.string(),
      entries: z.array(moodEntrySchema),
      summary: z.strictObject({
        count: z.int(),
        average: averageSchema,
        distribution: z.array(z.strictObject({ score: z.int(), count: z.int() })),
        emotions: z
          .array(z.strictObject({ emotion: z.enum(MOOD_EMOTIONS), count: z.int() }))
          .describe('Feelings that were recorded, most frequent first'),
        byWeekday: z.array(
          z.strictObject({
            weekday: z.int().describe('1 = Monday … 7 = Sunday'),
            count: z.int(),
            average: averageSchema,
          }),
        ),
      }),
    }),
  },
  ({ auth, query }) => getMoodRange(auth, query),
);

mood.put(
  '/:date',
  {
    summary: 'Record the mood of a day',
    description:
      'Creates the day’s entry or replaces its score. `emotions` and `note` are kept when ' +
      'left out.',
    params,
    body: z.strictObject({
      score: z.int().min(1).max(5),
      emotions: z.array(z.enum(MOOD_EMOTIONS)).max(MOOD_EMOTIONS.length).optional(),
      note: z.string().trim().max(1000).optional(),
    }),
    response: moodEntrySchema,
  },
  ({ auth, params: { date }, body }) => setMood(auth, date, body),
);

mood.delete(
  '/:date',
  { summary: 'Remove the mood of a day', params, status: 204, errors: ['NOT_FOUND'] },
  async ({ auth, params: { date } }) => {
    await clearMood(auth, date);
  },
);

export const moodRouter = mood.router;
