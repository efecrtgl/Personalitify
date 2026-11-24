import { ITEM_ICONS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { calendarItemSchema } from '../calendar/calendar.routes.js';
import { goalViewSchema } from '../goals/goals.routes.js';
import { daySchema, habitDaySchema } from '../habits/habits.schemas.js';
import { taskSchema } from '../tasks/tasks.routes.js';
import { getDashboard } from './dashboard.service.js';

const INSIGHT_KINDS = [
  'all_habits_done',
  'overdue_tasks',
  'goal_deadline',
  'habit_rate_up',
  'habit_rate_down',
  'streak_goal_near',
  'long_streak',
  'busy_day',
];

const ACTIVITY_KINDS = [
  'habit_completed',
  'habit_created',
  'task_completed',
  'task_created',
  'goal_completed',
  'goal_created',
  'event_created',
];

const dashboardSchema = z.strictObject({
  today: z.string(),
  timeZone: z.string(),
  habits: z
    .strictObject({ summary: daySchema.shape.summary, items: z.array(habitDaySchema) })
    .describe('Today’s habits, as returned by GET /habits/day'),
  tasks: z.strictObject({
    summary: z.strictObject({
      total: z.int().describe('Tasks due or scheduled today, open and done'),
      done: z.int(),
      overdue: z.int(),
      open: z.int().describe('All open tasks, whatever their date'),
    }),
    overdue: z.array(taskSchema),
    due: z.array(taskSchema),
    completed: z.array(taskSchema),
  }),
  upcoming: z
    .array(calendarItemSchema)
    .describe('Events and planned tasks still ahead, today and in the next seven days'),
  goals: z.array(goalViewSchema).describe('Active top-level goals, nearest target date first'),
  week: z
    .strictObject({
      days: z.array(
        z.strictObject({
          date: z.string(),
          due: z.int().describe('Habits due that day, without skipped and postponed ones'),
          completed: z.int(),
          tasksCompleted: z.int(),
        }),
      ),
      habits: z.strictObject({
        due: z.int(),
        completed: z.int(),
        rate: z.number().nullable().describe('completed / due over the last seven days'),
        previousRate: z.number().nullable().describe('The same for the seven days before'),
      }),
      tasksCompleted: z.int(),
      previousTasksCompleted: z.int(),
    })
    .describe('The last seven days, today included'),
  streaks: z.array(
    z.strictObject({
      habitId: z.string(),
      name: z.string(),
      color: z.string(),
      icon: z.enum(ITEM_ICONS),
      current: z.int(),
      best: z.int(),
      unit: z.enum(['days', 'weeks', 'months']),
    }),
  ),
  activity: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum(ACTIVITY_KINDS),
      title: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      at: z.string(),
    }),
  ),
  insights: z
    .array(
      z.strictObject({
        kind: z.enum(INSIGHT_KINDS),
        tone: z.enum(['positive', 'neutral', 'attention']),
        params: z.record(z.string(), z.union([z.string(), z.number()])),
      }),
    )
    .describe(
      'Observations computed by fixed, documented rules from the figures in `params`. ' +
        'Clients phrase them; there is no composite score.',
    ),
});

const dashboard = createModule({
  tag: 'Dashboard',
  description:
    'Everything the personal dashboard shows, in one request. All figures are derived from ' +
    'the user’s own records at request time. The widget layout is part of the settings ' +
    '(`settings.dashboard`).',
  basePath: '/dashboard',
});

dashboard.get('', { summary: 'Get the dashboard', response: dashboardSchema }, ({ auth }) =>
  getDashboard(auth),
);

export const dashboardRouter = dashboard.router;
