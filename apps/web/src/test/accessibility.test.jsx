import { ACHIEVEMENTS, levelProgress } from '@personalitify/shared-contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymousRoutes, mockApi, ok, renderApp, signedInRoutes } from './harness.jsx';

const TODAY = '2026-11-24';

/**
 * Automated accessibility rules (axe) over every main screen.
 *
 * The rules that need a real layout engine are switched off — jsdom computes no sizes or
 * colors, so contrast is checked by hand against the design tokens instead (see
 * docs/architecture/frontend.md). Everything structural is checked: names of controls,
 * labels of fields, roles and their required children, landmarks, heading order, ids.
 */
async function violationsOf(container) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} — ${violation.nodes
        .slice(0, 3)
        .map((node) => node.html.slice(0, 120))
        .join(' | ')}`,
  );
}

const page = (items, extra = {}) =>
  ok(items, { page: 1, limit: 20, total: items.length, totalPages: 1, ...extra });

const habit = {
  id: 'habit-1',
  version: 1,
  name: 'Kitap oku',
  description: '',
  categoryId: null,
  color: '#5e5ce6',
  icon: 'book',
  schedule: {
    mode: 'fixed',
    recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
    period: 'week',
    timesPerPeriod: 1,
  },
  target: { kind: 'check', value: 1, unit: '' },
  startDate: '2026-11-01',
  endDate: null,
  reminders: [],
  streakGoal: null,
  archived: false,
  archivedAt: null,
  sortOrder: 0,
};
const task = {
  id: 'task-1',
  version: 1,
  title: 'Raporu yaz',
  description: '',
  status: 'todo',
  priority: 'high',
  dueDate: TODAY,
  dueTime: null,
  subtasks: [],
  recurrence: null,
  postponedCount: 0,
  categoryId: null,
  goalId: null,
};
const goal = {
  id: 'goal-1',
  version: 1,
  title: 'Yarı maraton',
  description: '',
  color: '#30d158',
  icon: 'target',
  horizon: 'short',
  startDate: '2026-11-01',
  targetDate: '2026-12-01',
  status: 'active',
  progress: { mode: 'manual', value: 40, current: 0, target: 100, unit: '' },
  milestones: [],
  reviews: [],
  parentGoalId: null,
  habitIds: [],
  categoryId: null,
  computed: {
    percent: 40,
    milestones: { total: 0, done: 0 },
    tasks: { total: 0, done: 0, open: 0 },
    daysLeft: 7,
    overdue: false,
  },
};

/** Answers for every screen, each with a little real-looking content. */
const routes = () => ({
  ...signedInRoutes(),
  'GET /habits/day': () =>
    ok({
      date: TODAY,
      today: TODAY,
      items: [
        {
          habitId: habit.id,
          date: TODAY,
          state: 'pending',
          due: true,
          value: 0,
          target: 1,
          progress: 0,
          entry: null,
          period: null,
          streak: { current: 3, best: 5, unit: 'days' },
          habit,
        },
      ],
      summary: { due: 1, completed: 0, skipped: 0, postponed: 0, rate: 0 },
    }),
  'GET /tasks/day': () =>
    ok({
      date: TODAY,
      today: TODAY,
      overdue: [],
      due: [task],
      completed: [],
      summary: { total: 1, done: 0, overdue: 0 },
    }),
  'GET /goals': () => ok([goal]),
  'GET /calendar': ({ query }) =>
    ok({
      from: query.from,
      to: query.to,
      today: TODAY,
      timeZone: 'Europe/Istanbul',
      items: [],
      conflicts: [],
    }),
  'GET /focus': () =>
    ok({
      serverTime: new Date().toISOString(),
      today: TODAY,
      session: null,
      settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      suggestedKind: 'focus',
      todayFocus: { sessions: 0, seconds: 0 },
      week: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-11-${18 + index}`,
        sessions: 0,
        seconds: 0,
      })),
    }),
  'GET /focus/sessions': () => page([]),
  'GET /journal': () =>
    page([
      {
        id: 'entry-1',
        version: 1,
        kind: 'journal',
        title: 'İlk gün',
        date: TODAY,
        tags: ['plan'],
        pinned: true,
        excerpt: 'Bugün başladım.',
        truncated: false,
        wordCount: 2,
      },
    ]),
  'GET /journal/tags': () => ok([{ tag: 'plan', count: 1 }]),
  'GET /mood': ({ query }) =>
    ok({
      from: query.from,
      to: query.to,
      today: TODAY,
      entries: [],
      summary: {
        count: 0,
        average: null,
        distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: 0 })),
        emotions: [],
        byWeekday: Array.from({ length: 7 }, (_, index) => ({
          weekday: index + 1,
          count: 0,
          average: null,
        })),
      },
    }),
  'GET /achievements': () =>
    ok({
      today: TODAY,
      xp: { total: 120, today: 10, week: 60 },
      level: levelProgress(120),
      achievements: ACHIEVEMENTS.map((achievement, index) => ({
        ...achievement,
        current: index === 0 ? achievement.target : 0,
        unlocked: index === 0,
        unlockedAt: index === 0 ? '2026-11-20T09:00:00.000Z' : null,
      })),
      recent: [],
    }),
  'GET /notifications': () =>
    page(
      [
        {
          id: 'n1',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kind: 'habit_reminder',
          params: { name: 'Kitap oku', time: '09:00' },
          entityType: 'habit',
          entityId: 'habit-1',
          silent: false,
          read: false,
          readAt: null,
        },
      ],
      { unread: 1 },
    ),
});

describe('accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T09:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  const signedIn = [
    ['the dashboard', '/', 'Bugün'],
    ['habits', '/habits', 'Kitap oku'],
    ['tasks', '/tasks', 'Raporu yaz'],
    ['goals', '/goals', 'Yarı maraton'],
    ['the calendar', '/calendar', 'Kasım 2026'],
    ['the focus timer', '/focus', 'Başlat'],
    ['the journal', '/journal', 'İlk gün'],
    ['the journal editor', '/journal/new', 'Yeni günlük yazısı'],
    ['mood', '/mood', 'Bugün nasılsınız?'],
    ['achievements', '/achievements', 'Seviye 2'],
    ['settings', '/settings/profile', 'Profil'],
    ['notification settings', '/settings/notifications', 'Bildirimler'],
  ];

  for (const [name, path, landmark] of signedIn) {
    it(`finds nothing wrong with ${name}`, async () => {
      mockApi(routes());
      const { container } = renderApp(path);
      expect((await screen.findAllByText(landmark)).length).toBeGreaterThan(0);
      // The screen itself, not an error message about a request it could not make.
      expect(screen.queryByRole('button', { name: 'Yeniden dene' })).not.toBeInTheDocument();
      expect(await violationsOf(container)).toEqual([]);
    });
  }

  it('finds nothing wrong with the open notification panel and the navigation drawer', async () => {
    mockApi(routes());
    const { container } = renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /Bildirimler, 1 okunmamış/ }));
    await screen.findByText('Kitap oku için zaman geldi (09:00).');
    expect(await violationsOf(container)).toEqual([]);
  });

  for (const [name, path, landmark] of [
    ['sign-in', '/login', 'Giriş yap'],
    ['registration', '/register', 'Hesap oluştur'],
    ['the forgotten-password form', '/forgot-password', 'E-posta'],
  ]) {
    it(`finds nothing wrong with ${name}`, async () => {
      mockApi(anonymousRoutes());
      const { container } = renderApp(path);
      expect((await screen.findAllByText(new RegExp(landmark))).length).toBeGreaterThan(0);
      expect(await violationsOf(container)).toEqual([]);
    });
  }
});
