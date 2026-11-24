import {
  ANALYTICS_HIGHLIGHTS,
  ANALYTICS_PERIODS,
  GOAL_PACES,
  ITEM_ICONS,
  TASK_PRIORITIES,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { localDateSchema } from '../../core/validation.js';
import { getOverview } from './analytics.service.js';

const rangeSchema = z.strictObject({ from: z.string(), to: z.string() });
const rateSchema = z.number().nullable();

const overviewSchema = z.strictObject({
  period: z.enum(ANALYTICS_PERIODS),
  bucket: z.enum(['day', 'week', 'month']).describe('The step of `series`'),
  range: rangeSchema.describe('The whole calendar period, first to last day'),
  previousRange: rangeSchema.describe('The period of the same kind right before it'),
  today: z.string(),
  timeZone: z.string(),
  weekStart: z.int(),
  complete: z
    .boolean()
    .describe('False while the period is still running; counts are then not final'),
  series: z
    .array(
      z.strictObject({
        from: z.string(),
        to: z.string(),
        habits: z.strictObject({ due: z.int(), completed: z.int(), rate: rateSchema }),
        tasks: z.strictObject({ completed: z.int() }),
      }),
    )
    .describe(
      'The period step by step: days of a week or month, weeks of a quarter, months of a year',
    ),
  habits: z
    .strictObject({
      due: z
        .int()
        .describe(
          'Due days of fixed-schedule habits that could be judged: completed or missed. ' +
            'Skipped and postponed days, today while it is open, and future days are left out',
        ),
      completed: z.int(),
      missed: z.int(),
      rate: rateSchema.describe('completed / due; null when nothing was due'),
      previous: z.strictObject({ due: z.int(), completed: z.int(), rate: rateSchema }),
      byWeekday: z.array(
        z.strictObject({
          weekday: z.int().describe('1 = Monday … 7 = Sunday'),
          due: z.int(),
          completed: z.int(),
          rate: rateSchema,
        }),
      ),
      items: z.array(
        z.strictObject({
          habitId: z.string(),
          name: z.string(),
          color: z.string(),
          icon: z.enum(ITEM_ICONS),
          archived: z.boolean(),
          unit: z
            .enum(['days', 'weeks', 'months'])
            .describe('What due, completed and missed count: days, or periods of a flexible habit'),
          due: z.int(),
          completed: z.int(),
          missed: z.int(),
          skipped: z.int(),
          rate: rateSchema,
          previousRate: rateSchema,
        }),
      ),
    })
    .describe('Totals cover fixed-schedule habits; `items` lists every habit in its own unit'),
  tasks: z.strictObject({
    completed: z.int().describe('Tasks finished on a day of the period'),
    due: z.int().describe('Tasks whose due date lies in the period, cancelled ones left out'),
    dueCompleted: z.int().describe('Of those, the ones that are done'),
    onTime: z.int().describe('Finished tasks with a due date, finished on or before it'),
    late: z.int().describe('Finished tasks with a due date, finished after it'),
    withoutDueDate: z.int(),
    onTimeRate: rateSchema.describe('onTime / (onTime + late)'),
    overdueOpen: z.int().describe('Open tasks past their due date right now'),
    previous: z.strictObject({ completed: z.int() }),
    byPriority: z.array(z.strictObject({ priority: z.enum(TASK_PRIORITIES), completed: z.int() })),
    byCategory: z.array(
      z.strictObject({
        categoryId: z.string().nullable(),
        name: z.string().nullable().describe('null: without a category'),
        color: z.string().nullable(),
        completed: z.int(),
      }),
    ),
  }),
  goals: z.strictObject({
    active: z.int(),
    completed: z.int().describe('Goals completed during the period'),
    milestonesCompleted: z.int().describe('Milestones completed during the period'),
    items: z.array(
      z.strictObject({
        goalId: z.string(),
        title: z.string(),
        color: z.string(),
        icon: z.enum(ITEM_ICONS),
        startDate: z.string(),
        targetDate: z.string().nullable(),
        percent: z.number(),
        daysLeft: z.int().nullable(),
        expected: z
          .int()
          .nullable()
          .describe('Share of the time from start to target date that has passed, in percent'),
        pace: z
          .enum(GOAL_PACES)
          .nullable()
          .describe(
            'percent against expected, with ten points of tolerance; null without a target date',
          ),
        milestonesCompleted: z.int(),
        tasksCompleted: z.int().describe('Linked tasks finished during the period'),
      }),
    ),
  }),
  highlights: z
    .array(
      z.strictObject({
        kind: z.enum(ANALYTICS_HIGHLIGHTS),
        tone: z.enum(['positive', 'neutral', 'attention']),
        params: z.record(z.string(), z.union([z.string(), z.number()])),
      }),
    )
    .describe('Observations made by fixed, documented rules from the figures in `params`'),
});

const analytics = createModule({
  tag: 'Analytics',
  description:
    'Statistics of a calendar period next to the period before it. Every figure is counted ' +
    'from the user’s own records at request time, in their time zone; nothing is estimated, ' +
    'and there is no composite score.',
  basePath: '/analytics',
});

analytics.get(
  '/overview',
  {
    summary: 'Statistics of a week, month, quarter or year',
    description:
      'Returns the whole calendar period that contains `date` (default: today, in the ' +
      'user’s time zone), with habit, task and goal figures, a step-by-step series for ' +
      'charts, and the same key figures for the previous period.',
    query: z.strictObject({
      period: z.enum(ANALYTICS_PERIODS).default('month'),
      date: localDateSchema.optional(),
    }),
    response: overviewSchema,
  },
  ({ auth, query }) => getOverview(auth, query),
);

export const analyticsRouter = analytics.router;
