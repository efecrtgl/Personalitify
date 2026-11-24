import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncEvent } from '../src/modules/events/sync-event.model.js';
import { HabitEntry } from '../src/modules/habits/habit.model.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

/** Freezes the calendar without touching timers, so network and database I/O keep working. */
function setNow(iso) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

async function createHabit(user, overrides = {}) {
  const response = await user
    .post('/habits', { name: 'Read', color: '#0a84ff', startDate: '2026-11-01', ...overrides })
    .expect(201);
  return response.body.data;
}

const complete = (user, habitId, date, body = { value: 1 }) =>
  user.put(`/habits/${habitId}/entries/${date}`, body).expect(200);

describe('habits', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  describe('management', () => {
    it('creates a habit with sensible defaults', async () => {
      setNow(NOON);
      const user = await registerUser();
      const response = await user.post('/habits', { name: '  Meditate ', color: '#30d158' });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: 'Meditate',
        version: 1,
        icon: 'star',
        startDate: TODAY, // today in the user's time zone
        endDate: null,
        archived: false,
        schedule: {
          mode: 'fixed',
          recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
        },
        target: { kind: 'check', value: 1, unit: '' },
        reminders: [],
      });
    });

    it('stores a full definition and accepts a client-generated id', async () => {
      const user = await registerUser();
      const id = randomUUID();
      const habit = await createHabit(user, {
        id,
        name: 'Drink water',
        description: 'Eight glasses a day',
        icon: 'droplet',
        schedule: { mode: 'fixed', recurrence: { frequency: 'weekly', weekdays: [5, 1, 3] } },
        target: { kind: 'count', value: 8, unit: 'glasses' },
        reminders: [{ time: '09:00' }, { time: '15:30', enabled: false }],
        endDate: '2027-01-01',
        streakGoal: 30,
      });
      expect(habit.id).toBe(id);
      expect(habit.schedule.recurrence.weekdays).toEqual([1, 3, 5]);
      expect(habit.reminders).toEqual([
        { time: '09:00', enabled: true },
        { time: '15:30', enabled: false },
      ]);
      await user.post('/habits', { id, name: 'Again', color: '#0a84ff' }).expect(409);
    });

    it('rejects inconsistent definitions with field errors', async () => {
      const user = await registerUser();
      const cases = [
        [{ name: '', color: '#0a84ff' }, 'name'],
        [{ name: 'x', color: 'blue' }, 'color'],
        [{ name: 'x', color: '#0a84ff', icon: 'rocket-ship' }, 'icon'],
        [{ name: 'x', color: '#0a84ff', startDate: '2026-02-30' }, 'startDate'],
        [
          { name: 'x', color: '#0a84ff', startDate: '2026-11-10', endDate: '2026-11-01' },
          'endDate',
        ],
        [
          {
            name: 'x',
            color: '#0a84ff',
            schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 9 },
          },
          'schedule.timesPerPeriod',
        ],
        [{ name: 'x', color: '#0a84ff', target: { kind: 'check', value: 3 } }, 'target.value'],
        [
          { name: 'x', color: '#0a84ff', reminders: [{ time: '08:00' }, { time: '08:00' }] },
          'reminders',
        ],
        [{ name: 'x', color: '#0a84ff', reminders: [{ time: '8am' }] }, 'reminders.0.time'],
        [{ name: 'x', color: '#0a84ff', categoryId: randomUUID() }, 'categoryId'],
      ];
      for (const [body, path] of cases) {
        const response = await user.post('/habits', body);
        expect(response.status, path).toBe(400);
        expect(response.body.error.details.map((detail) => detail.path)).toContain(path);
      }
    });

    it('updates nested fields without resetting their siblings', async () => {
      const user = await registerUser();
      const habit = await createHabit(user, {
        schedule: { mode: 'fixed', recurrence: { frequency: 'weekly', weekdays: [1, 3] } },
        target: { kind: 'count', value: 8, unit: 'glasses' },
      });
      const response = await user
        .patch(`/habits/${habit.id}`, {
          target: { value: 10 },
          schedule: { recurrence: { weekdays: [2, 4] } },
          baseVersion: 1,
        })
        .expect(200);
      expect(response.body.data).toMatchObject({
        version: 2,
        target: { kind: 'count', value: 10, unit: 'glasses' },
        schedule: { mode: 'fixed', recurrence: { frequency: 'weekly', weekdays: [2, 4] } },
      });
      // The result of a patch is validated as a whole.
      await user.patch(`/habits/${habit.id}`, { endDate: '2026-10-01' }).expect(400);
    });

    it('archives, restores and filters habits', async () => {
      setNow(NOON);
      const user = await registerUser();
      const keep = await createHabit(user, { name: 'Keep' });
      const old = await createHabit(user, { name: 'Old' });

      const archived = await user.post(`/habits/${old.id}/archive`).expect(200);
      expect(archived.body.data).toMatchObject({ archived: true, version: 2 });
      // Archiving twice changes nothing.
      expect((await user.post(`/habits/${old.id}/archive`).expect(200)).body.data.version).toBe(2);

      const names = async (query) =>
        (await user.get(`/habits${query}`).expect(200)).body.data.map((habit) => habit.name);
      expect(await names('')).toEqual(['Keep']);
      expect(await names('?archived=true')).toEqual(['Old']);
      expect((await names('?archived=all')).sort()).toEqual(['Keep', 'Old']);

      // An archived habit keeps its history but leaves the daily view.
      const day = await user.get('/habits/day').expect(200);
      expect(day.body.data.items.map((item) => item.habitId)).toEqual([keep.id]);

      await user.post(`/habits/${old.id}/unarchive`).expect(200);
      expect((await names('')).sort()).toEqual(['Keep', 'Old']);
    });

    it('deletes a habit together with its entries and emits tombstones', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user);
      await complete(user, habit.id, TODAY);
      await complete(user, habit.id, '2026-11-23');

      await user.delete(`/habits/${habit.id}`).expect(204);
      await user.get(`/habits/${habit.id}`).expect(404);
      expect(await HabitEntry.countDocuments({ habitId: habit.id, deletedAt: null })).toBe(0);

      const types = (await SyncEvent.find({ userId: user.userId }).sort({ seq: 1 }).lean())
        .map((event) => event.type)
        .filter((type) => type.startsWith('habit'));
      expect(types).toEqual([
        'habit.created',
        'habitEntry.created',
        'habitEntry.created',
        'habit.deleted',
        'habitEntry.deleted',
        'habitEntry.deleted',
      ]);
    });
  });

  describe('the day view and time zones', () => {
    it('decides what "today" is from the user’s time zone', async () => {
      // 21:30 UTC on the 24th: already the 25th in Istanbul, still the 24th in New York.
      setNow('2026-11-24T21:30:00.000Z');
      const istanbul = await registerUser({ timeZone: 'Europe/Istanbul' });
      const newYork = await registerUser({ timeZone: 'America/New_York' });
      await createHabit(istanbul);
      await createHabit(newYork);

      const east = (await istanbul.get('/habits/day').expect(200)).body.data;
      const west = (await newYork.get('/habits/day').expect(200)).body.data;
      expect(east).toMatchObject({ date: '2026-11-25', today: '2026-11-25' });
      expect(west).toMatchObject({ date: '2026-11-24', today: '2026-11-24' });
      expect(east.items[0].state).toBe('pending');
    });

    it('follows a change of the user’s time zone immediately', async () => {
      setNow('2026-11-24T21:30:00.000Z');
      const user = await registerUser({ timeZone: 'Europe/Istanbul' });
      const habit = await createHabit(user);
      await complete(user, habit.id, '2026-11-25');
      expect((await user.get('/habits/day')).body.data.items[0].state).toBe('completed');

      await user.patch('/settings', { timeZone: 'America/Los_Angeles' }).expect(200);
      const day = (await user.get('/habits/day').expect(200)).body.data;
      expect(day.today).toBe('2026-11-24');
      // The 25th was recorded and stays recorded; the 24th is simply open again.
      expect(day.items[0].state).toBe('pending');
      expect((await user.get('/habits/day?date=2026-11-25')).body.data.items[0].state).toBe(
        'completed',
      );
    });

    it('lists only the habits that are relevant on the day, with a summary', async () => {
      setNow(NOON);
      const user = await registerUser();
      const daily = await createHabit(user, { name: 'Daily' });
      await createHabit(user, {
        name: 'Fridays',
        schedule: { mode: 'fixed', recurrence: { frequency: 'weekly', weekdays: [5] } },
      });
      const gym = await createHabit(user, {
        name: 'Gym',
        schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 3 },
      });
      await createHabit(user, { name: 'Next month', startDate: '2026-12-01' });
      await complete(user, daily.id, TODAY);
      await complete(user, gym.id, '2026-11-23');

      const day = (await user.get('/habits/day').expect(200)).body.data;
      expect(day.items.map((item) => [item.habit.name, item.state, item.due])).toEqual([
        ['Daily', 'completed', true],
        ['Gym', 'not_due', false],
      ]);
      expect(day.items[1].period).toMatchObject({
        from: '2026-11-23',
        to: '2026-11-29',
        completed: 1,
        target: 3,
        met: false,
      });
      expect(day.summary).toEqual({ due: 1, completed: 1, skipped: 0, postponed: 0, rate: 1 });

      const friday = (await user.get('/habits/day?date=2026-11-27').expect(200)).body.data;
      expect(friday.items.map((item) => item.habit.name)).toEqual(['Daily', 'Fridays', 'Gym']);
      expect(friday.summary).toMatchObject({ due: 2, completed: 0, rate: 0 });
    });

    it('uses the user’s first day of the week for weekly quotas', async () => {
      setNow(NOON);
      const user = await registerUser();
      const gym = await createHabit(user, {
        schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 2 },
      });
      await complete(user, gym.id, '2026-11-22'); // Sunday
      const period = async () => (await user.get('/habits/day')).body.data.items[0].period;
      expect(await period()).toMatchObject({ from: '2026-11-23', completed: 0 });

      await user.patch('/settings', { weekStart: 7 }).expect(200);
      expect(await period()).toMatchObject({ from: '2026-11-22', to: '2026-11-28', completed: 1 });
    });
  });

  describe('recording a day', () => {
    it('completes a check habit and reports the streak', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user);
      for (const date of ['2026-11-21', '2026-11-22', '2026-11-23']) {
        await complete(user, habit.id, date);
      }
      const response = await complete(user, habit.id, TODAY);
      expect(response.body.data).toMatchObject({
        state: 'completed',
        due: true,
        value: 1,
        target: 1,
        progress: 1,
        streak: { current: 4, best: 4, unit: 'days' },
      });
      expect(response.body.data.entry).toMatchObject({
        date: TODAY,
        completed: true,
        version: 1,
        completedAt: NOON,
      });
    });

    it('accumulates progress towards a count target, atomically', async () => {
      setNow(NOON);
      const user = await registerUser();
      const water = await createHabit(user, {
        target: { kind: 'count', value: 3, unit: 'glasses' },
      });
      const url = `/habits/${water.id}/entries/${TODAY}`;

      const first = (await user.put(url, { increment: 1 }).expect(200)).body.data;
      expect(first).toMatchObject({ state: 'partial', value: 1, target: 3 });
      expect(first.progress).toBeCloseTo(1 / 3);
      expect(first.entry.completedAt).toBeNull();

      // Two devices tapping at the same moment must both count.
      await Promise.all([user.put(url, { increment: 1 }), user.put(url, { increment: 1 })]);
      const day = (await user.get('/habits/day').expect(200)).body.data.items[0];
      expect(day).toMatchObject({ state: 'completed', value: 3, progress: 1 });
      expect(await HabitEntry.countDocuments({ habitId: water.id, date: TODAY })).toBe(1);

      // Progress never goes below zero, and dropping below the target reopens the day.
      const lowered = (await user.put(url, { increment: -10 }).expect(200)).body.data;
      expect(lowered).toMatchObject({ state: 'pending', value: 0 });
      expect(lowered.entry.completedAt).toBeNull();

      await user.put(url, { value: 1, increment: 1 }).expect(400);
    });

    it('creates a single entry when the first two writes of a day race', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user, { target: { kind: 'count', value: 5, unit: '' } });
      const url = `/habits/${habit.id}/entries/${TODAY}`;
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => user.put(url, { increment: 1 })),
      );
      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
      const entries = await HabitEntry.find({ habitId: habit.id, date: TODAY, deletedAt: null });
      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe(4);
    });

    it('keeps the target an entry was recorded with when the habit changes', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user, { target: { kind: 'count', value: 2, unit: '' } });
      await complete(user, habit.id, '2026-11-23', { value: 2 });
      await user.patch(`/habits/${habit.id}`, { target: { value: 5 } }).expect(200);

      const history = (
        await user.get(`/habits/${habit.id}/history?from=2026-11-23&to=${TODAY}`).expect(200)
      ).body.data;
      expect(history.days).toMatchObject([
        { date: '2026-11-23', state: 'completed', value: 2, target: 2 },
        { date: TODAY, state: 'pending', value: 0, target: 5 },
      ]);
    });

    it('skips a day without breaking the streak', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user);
      await complete(user, habit.id, '2026-11-21');
      await complete(user, habit.id, '2026-11-22');
      const skipped = await complete(user, habit.id, '2026-11-23', {
        status: 'skipped',
        note: 'On a flight',
      });
      expect(skipped.body.data).toMatchObject({ state: 'skipped', value: 0 });
      expect(skipped.body.data.entry.note).toBe('On a flight');

      const today = await complete(user, habit.id, TODAY);
      expect(today.body.data.streak).toMatchObject({ current: 3, best: 3 });
    });

    it('postpones an occurrence to a later day', async () => {
      setNow(NOON);
      const user = await registerUser();
      const mondays = await createHabit(user, {
        schedule: { mode: 'fixed', recurrence: { frequency: 'weekly', weekdays: [1] } },
      });
      const url = `/habits/${mondays.id}/entries/2026-11-23`;

      await user.put(url, { status: 'postponed' }).expect(400);
      await user.put(url, { status: 'postponed', postponedTo: '2026-11-23' }).expect(400);
      await user.put(url, { status: 'postponed', postponedTo: '2027-06-01' }).expect(400);

      const moved = (await user.put(url, { status: 'postponed', postponedTo: TODAY }).expect(200))
        .body.data;
      expect(moved).toMatchObject({ state: 'postponed' });
      expect(moved.entry.postponedTo).toBe(TODAY);

      const day = (await user.get('/habits/day').expect(200)).body.data;
      expect(day.items[0]).toMatchObject({ state: 'pending', due: true });
      expect(day.summary.due).toBe(1);

      await complete(user, mondays.id, TODAY);
      const stats = (await user.get(`/habits/${mondays.id}/stats`).expect(200)).body.data;
      expect(stats.windows[0]).toMatchObject({ postponed: 1, completed: 1, missed: 0 });
    });

    it('clears a day back to its natural state', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user);
      await complete(user, habit.id, TODAY);
      const cleared = await user.delete(`/habits/${habit.id}/entries/${TODAY}`).expect(200);
      expect(cleared.body.data).toMatchObject({ state: 'pending', entry: null, value: 0 });
      await user.delete(`/habits/${habit.id}/entries/${TODAY}`).expect(404);

      // Completing again starts a fresh entry.
      const again = await complete(user, habit.id, TODAY);
      expect(again.body.data.entry.version).toBe(1);
    });

    it('rejects days outside the habit’s lifetime and days in the future', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user, { startDate: '2026-11-10', endDate: '2026-11-30' });
      const put = (date) => user.put(`/habits/${habit.id}/entries/${date}`, { value: 1 });

      expect((await put('2026-11-09')).status).toBe(400);
      expect((await put('2026-11-26')).body.error.details[0].code).toBe('date_in_future');
      expect((await put('2026-11-25')).status).toBe(200); // one day of tolerance
      expect((await put('2026-13-01')).status).toBe(400);
      expect((await put(TODAY)).status).toBe(200);
    });
  });

  describe('history and statistics', () => {
    it('reports streaks, totals and completion windows', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user, { startDate: '2026-11-10', streakGoal: 7 });
      // 10–14 completed, 15 missed, 16–23 completed.
      for (let day = 10; day <= 23; day += 1) {
        if (day !== 15) await complete(user, habit.id, `2026-11-${day}`);
      }

      const stats = (await user.get(`/habits/${habit.id}/stats`).expect(200)).body.data;
      expect(stats).toMatchObject({
        today: TODAY,
        streak: { current: 8, best: 8, unit: 'days' },
        streakGoal: 7,
        totalCompletions: 13,
        unit: 'days',
      });
      const [week, month] = stats.windows;
      // Last 7 days: 18–24. The 24th is still open, so six days are judged.
      expect(week).toMatchObject({ days: 7, due: 6, completed: 6, missed: 0, rate: 1 });
      // Last 30 days, limited to the habit's lifetime: 10–23 judged.
      expect(month).toMatchObject({ days: 30, due: 14, completed: 13, missed: 1 });
      expect(month.rate).toBeCloseTo(13 / 14);
      expect(stats.byWeekday).toHaveLength(7);
    });

    it('limits the length of a history request', async () => {
      const user = await registerUser();
      const habit = await createHabit(user);
      await user.get(`/habits/${habit.id}/history?from=2024-01-01&to=2026-11-24`).expect(400);
      await user.get(`/habits/${habit.id}/history?from=2026-11-24&to=2026-11-01`).expect(400);
      await user.get(`/habits/${habit.id}/history?from=2026-11-01`).expect(400);
    });
  });

  describe('categories', () => {
    it('manages categories and detaches habits when one is deleted', async () => {
      const user = await registerUser();
      const health = (
        await user.post('/categories', { name: 'Health', color: '#30d158', icon: 'heart' })
      ).body.data;
      const work = (await user.post('/categories', { name: 'Work', color: '#0a84ff' })).body.data;
      expect(health).toMatchObject({ name: 'Health', icon: 'heart', version: 1 });

      const habit = await createHabit(user, { categoryId: health.id });
      await createHabit(user, { name: 'Emails', categoryId: work.id });
      const filtered = await user.get(`/habits?categoryId=${health.id}`).expect(200);
      expect(filtered.body.data.map((item) => item.id)).toEqual([habit.id]);

      const renamed = await user
        .patch(`/categories/${health.id}`, { name: 'Wellbeing', baseVersion: 1 })
        .expect(200);
      expect(renamed.body.data).toMatchObject({ name: 'Wellbeing', version: 2 });

      await user.delete(`/categories/${health.id}`).expect(204);
      const categories = await user.get('/categories').expect(200);
      expect(categories.body.data.map((category) => category.name)).toEqual(['Work']);

      const detached = (await user.get(`/habits/${habit.id}`).expect(200)).body.data;
      expect(detached).toMatchObject({ categoryId: null, version: 2 });
    });
  });

  describe('ownership', () => {
    it('never exposes or changes another user’s habits, entries or categories', async () => {
      setNow(NOON);
      const alice = await registerUser();
      const bob = await registerUser();
      const habit = await createHabit(alice, { name: 'Private habit' });
      await complete(alice, habit.id, TODAY);
      const category = (await alice.post('/categories', { name: 'Mine', color: '#0a84ff' })).body
        .data;

      expect((await bob.get('/habits?archived=all').expect(200)).body.data).toEqual([]);
      expect((await bob.get('/habits/day').expect(200)).body.data.items).toEqual([]);
      expect((await bob.get('/categories').expect(200)).body.data).toEqual([]);

      await bob.get(`/habits/${habit.id}`).expect(404);
      await bob.patch(`/habits/${habit.id}`, { name: 'Taken' }).expect(404);
      await bob.delete(`/habits/${habit.id}`).expect(404);
      await bob.post(`/habits/${habit.id}/archive`).expect(404);
      await bob.get(`/habits/${habit.id}/stats`).expect(404);
      await bob.get(`/habits/${habit.id}/history?from=${TODAY}&to=${TODAY}`).expect(404);
      await bob.put(`/habits/${habit.id}/entries/${TODAY}`, { value: 0 }).expect(404);
      await bob.delete(`/habits/${habit.id}/entries/${TODAY}`).expect(404);
      await bob.patch(`/categories/${category.id}`, { name: 'Taken' }).expect(404);
      await bob.delete(`/categories/${category.id}`).expect(404);
      // Bob cannot attach his habit to Alice's category either.
      await bob
        .post('/habits', { name: 'Sneaky', color: '#0a84ff', categoryId: category.id })
        .expect(400);

      const untouched = (await alice.get('/habits/day').expect(200)).body.data.items[0];
      expect(untouched).toMatchObject({ state: 'completed' });
      expect(untouched.habit.name).toBe('Private habit');
    });

    it('includes habits and their entries in the data export', async () => {
      setNow(NOON);
      const user = await registerUser();
      const habit = await createHabit(user);
      await complete(user, habit.id, TODAY);
      const exported = (await user.get('/account/export').expect(200)).body.data.data;
      expect(exported.habit).toHaveLength(1);
      expect(exported.habitEntry).toMatchObject([{ habitId: habit.id, date: TODAY }]);
      expect(exported.category).toEqual([]);
    });
  });
});
