import { FOCUS_KINDS, FOCUS_LIMITS, FOCUS_STATUSES } from '@personalitify/shared-contracts';
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
  cancelSession,
  completeSession,
  deleteSession,
  getFocusState,
  getFocusStats,
  getSession,
  listSessions,
  pauseSession,
  resumeSession,
  startSession,
  updateSession,
} from './focus.service.js';

export const focusSessionSchema = z
  .strictObject({
    ...syncedResourceFields,
    kind: z.enum(FOCUS_KINDS),
    status: z.enum(FOCUS_STATUSES),
    plannedMinutes: z.number(),
    startedAt: z.string(),
    pausedAt: z.string().nullable(),
    pausedSeconds: z.int().describe('Time spent paused so far, without a pause still open'),
    endsAt: z
      .string()
      .nullable()
      .describe('When a running session reaches its planned length; null unless running'),
    endedAt: z.string().nullable(),
    elapsedSeconds: z
      .int()
      .describe('Time spent without pauses: final once ended, as of the last pause while active'),
    date: z.string().describe('The user’s calendar date when the session started'),
    note: z.string(),
    taskId: z.string().nullable(),
    habitId: z.string().nullable(),
    goalId: z.string().nullable(),
  })
  .describe('Timer session');

const daySchema = z.strictObject({
  date: z.string(),
  sessions: z.int().describe('Completed focus sessions; breaks are not counted'),
  seconds: z.int().describe('Focus time without pauses'),
});

const stateSchema = z.strictObject({
  serverTime: z
    .string()
    .describe('The server’s clock when the answer was made; countdowns are drawn against it'),
  today: z.string(),
  session: focusSessionSchema.nullable().describe('The running or paused session, if any'),
  settings: z.strictObject({
    focusMinutes: z.int(),
    shortBreakMinutes: z.int(),
    longBreakMinutes: z.int(),
    longBreakEvery: z.int(),
  }),
  suggestedKind: z.enum(FOCUS_KINDS).describe('What would sensibly be started next'),
  todayFocus: z.strictObject({ sessions: z.int(), seconds: z.int() }),
  week: z.array(daySchema).describe('The last seven days, today last'),
});

const links = {
  note: z.string().trim().max(500),
  taskId: idSchema.nullable(),
  habitId: idSchema.nullable(),
  goalId: idSchema.nullable(),
};
const params = z.strictObject({ sessionId: idSchema });

const focus = createModule({
  tag: 'Focus',
  description:
    'A timer for focus sessions and breaks. All instants are set by the server: clients ask ' +
    'it to start, pause, resume and finish, and draw the countdown from `endsAt` and ' +
    '`serverTime`. A user has one active session at a time, on whichever device it was ' +
    'started. A session that reaches its planned length is completed by the server.',
  basePath: '/focus',
});

focus.get('', { summary: 'Get the timer state', response: stateSchema }, ({ auth }) =>
  getFocusState(auth),
);

focus.get(
  '/stats',
  {
    summary: 'Focus time day by day',
    description: 'At most 400 days per request.',
    query: z.strictObject({ from: localDateSchema, to: localDateSchema }),
    response: z.strictObject({
      from: z.string(),
      to: z.string(),
      days: z.array(daySchema),
      sessions: z.int(),
      seconds: z.int(),
    }),
  },
  ({ auth, query }) => getFocusStats(auth, query),
);

focus.get(
  '/sessions',
  {
    summary: 'List past sessions',
    description: 'Ended sessions, newest first.',
    query: z.strictObject({
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
      kind: z.enum(FOCUS_KINDS).optional(),
      ...paginationQuery,
    }),
    response: z.array(focusSessionSchema),
    responseMeta: paginationMetaSchema,
  },
  async ({ auth, query }) => {
    const { items, total } = await listSessions(auth, query);
    return withMeta(items, paginationMeta({ ...query, total }));
  },
);

focus.post(
  '/sessions',
  {
    summary: 'Start a session',
    description:
      'Starts the timer now. Without `plannedMinutes` the length comes from the user’s ' +
      'settings for the kind. Answers `INVALID_STATE` with `details.reason = ' +
      '"session_active"` while another session is running or paused.',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      kind: z.enum(FOCUS_KINDS).default('focus'),
      plannedMinutes: z.int().min(FOCUS_LIMITS.minMinutes).max(FOCUS_LIMITS.maxMinutes).optional(),
      note: links.note.default(''),
      taskId: links.taskId.default(null),
      habitId: links.habitId.default(null),
      goalId: links.goalId.default(null),
    }),
    response: focusSessionSchema,
    status: 201,
    errors: ['INVALID_STATE', 'ID_ALREADY_EXISTS'],
  },
  ({ auth, body }) => startSession(auth, body),
);

focus.get(
  '/sessions/:sessionId',
  { summary: 'Get a session', params, response: focusSessionSchema, errors: ['NOT_FOUND'] },
  ({ auth, params: { sessionId } }) => getSession(auth, sessionId),
);

focus.patch(
  '/sessions/:sessionId',
  {
    summary: 'Change the note or links of a session',
    description: 'Times cannot be edited.',
    params,
    body: z.strictObject({
      note: links.note.optional(),
      taskId: links.taskId.optional(),
      habitId: links.habitId.optional(),
      goalId: links.goalId.optional(),
      baseVersion: baseVersionSchema,
    }),
    response: focusSessionSchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params: { sessionId }, body }) => updateSession(auth, sessionId, body),
);

const transitions = [
  ['pause', 'Pause the running session', pauseSession],
  ['resume', 'Resume the paused session', resumeSession],
  [
    'complete',
    'Finish the session now',
    completeSession,
    'The time spent so far is recorded. Completing a session that has already been completed ' +
      'returns it unchanged.',
  ],
  [
    'cancel',
    'Abandon the session',
    cancelSession,
    'The session stays in the history but counts towards no statistic.',
  ],
];
for (const [action, summary, handler, description] of transitions) {
  focus.post(
    `/sessions/:sessionId/${action}`,
    {
      summary,
      description,
      params,
      response: focusSessionSchema,
      errors: ['NOT_FOUND', 'INVALID_STATE'],
    },
    ({ auth, params: { sessionId } }) => handler(auth, sessionId),
  );
}

focus.delete(
  '/sessions/:sessionId',
  { summary: 'Delete a session', params, status: 204, errors: ['NOT_FOUND'] },
  async ({ auth, params: { sessionId } }) => {
    await deleteSession(auth, sessionId);
  },
);

export const focusRouter = focus.router;
