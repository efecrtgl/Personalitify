import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_KEYS,
  ACHIEVEMENT_METRICS,
  XP_RULES,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import { getProgress } from './achievements.service.js';

/** An unlocked achievement as it is synchronized to devices. */
export const achievementSchema = z
  .strictObject({
    ...syncedResourceFields,
    key: z.enum(ACHIEVEMENT_KEYS),
    unlockedAt: z.string(),
  })
  .describe('Unlocked achievement');

const progressSchema = z.strictObject({
  today: z.string(),
  xp: z.strictObject({
    total: z.int(),
    today: z.int().describe('XP that belongs to today'),
    week: z.int().describe('XP of the last seven days, today included'),
  }),
  level: z
    .strictObject({
      level: z.int(),
      levelXp: z.int().describe('Total XP at which this level started'),
      nextLevelXp: z.int().describe('Total XP at which the next level starts'),
      intoLevel: z.int(),
      needed: z.int().describe('XP still missing for the next level'),
      progress: z.number().describe('Share of the way to the next level, 0 to 1'),
    })
    .describe('Level n starts at 50·n·(n−1) XP: 0, 100, 300, 600, 1000, …'),
  achievements: z.array(
    z.strictObject({
      key: z.enum(ACHIEVEMENT_KEYS),
      group: z.enum(ACHIEVEMENT_GROUPS),
      metric: z.enum(ACHIEVEMENT_METRICS),
      target: z.int(),
      current: z.int().describe('The metric so far, never more than the target'),
      unlocked: z.boolean(),
      unlockedAt: z.string().nullable(),
    }),
  ),
  recent: z
    .array(
      z.strictObject({
        id: z.string(),
        rule: z.enum(Object.keys(XP_RULES)),
        amount: z.int(),
        entityType: z.string(),
        entityId: z.string(),
        date: z.string().describe('The user’s calendar date the XP belongs to'),
        grantedAt: z.string(),
      }),
    )
    .describe('The latest XP earned, newest first'),
});

const achievements = createModule({
  tag: 'Achievements',
  description:
    'Experience points, levels and achievements. XP is granted by the server from the ' +
    'user’s own records by fixed rules — once per record, and taken back when the record ' +
    'is undone. Achievements are unlocked when their figure is reached and are never taken ' +
    'back. Clients cannot grant either.',
  basePath: '/achievements',
});

achievements.get(
  '',
  {
    summary: 'Get XP, level and achievements',
    description:
      'Rules (XP): a completed habit day 10 · a finished task 5, high priority 10 · a ' +
      'milestone 15 · a completed goal 50 · 2 per five minutes of a completed focus ' +
      'session, at most 24 per session · writing in the journal 5 once a day · recording ' +
      'the mood 2 once a day.',
    response: progressSchema,
  },
  ({ auth }) => getProgress(auth),
);

export const achievementsRouter = achievements.router;
