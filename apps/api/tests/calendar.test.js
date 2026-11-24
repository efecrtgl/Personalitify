import { afterEach, describe, expect, it, vi } from 'vitest';
import { expandEvent, findConflicts, taskItem } from '../src/modules/calendar/calendar-items.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const rule = (overrides) => ({
  frequency: 'daily',
  interval: 1,
  weekdays: [],
  monthDays: [],
  ...overrides,
});

function event(overrides = {}) {
  return {
    _id: 'e1',
    title: 'Meeting',
    color: null,
    categoryId: null,
    kind: 'event',
    location: '',
    allDay: false,
    timeZone: 'Europe/Istanbul',
    startDate: '2026-11-24',
    startTime: '10:00',
    endDate: '2026-11-24',
    endTime: '11:00',
    recurring: false,
    recurrence: rule(),
    recurrenceEndDate: null,
    excludedDates: [],
    ...overrides,
  };
}

describe('calendar items', () => {
  it('positions a timed event in the viewer’s time zone', () => {
    const [same] = expandEvent(event(), '2026-11-24', '2026-11-24', 'Europe/Istanbul');
    expect(same).toMatchObject({
      id: 'event:e1:2026-11-24',
      kind: 'event',
      allDay: false,
      date: '2026-11-24',
      startTime: '10:00',
      endTime: '11:00',
      startsAt: '2026-11-24T07:00:00.000Z',
      endsAt: '2026-11-24T08:00:00.000Z',
    });

    // The same event seen from New York (UTC-5) is at 02:00.
    const [west] = expandEvent(event(), '2026-11-24', '2026-11-24', 'America/New_York');
    expect(west).toMatchObject({ date: '2026-11-24', startTime: '02:00', endTime: '03:00' });
    expect(west.startsAt).toBe(same.startsAt);
  });

  it('moves an event to the neighbouring day when the zones put it there', () => {
    // 01:00 in Istanbul is 17:00 of the previous day in New York.
    const late = event({ startTime: '01:00', endTime: '02:00' });
    expect(expandEvent(late, '2026-11-24', '2026-11-24', 'America/New_York')).toEqual([]);
    const [item] = expandEvent(late, '2026-11-23', '2026-11-23', 'America/New_York');
    expect(item).toMatchObject({
      date: '2026-11-23',
      startTime: '17:00',
      occurrenceDate: '2026-11-24',
    });
  });

  it('never shifts all-day events between zones', () => {
    const holiday = event({ allDay: true, startTime: null, endTime: null, endDate: '2026-11-26' });
    for (const zone of ['Europe/Istanbul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      const [item] = expandEvent(holiday, '2026-11-20', '2026-11-30', zone);
      expect(item).toMatchObject({
        allDay: true,
        date: '2026-11-24',
        endDate: '2026-11-26',
        startsAt: null,
      });
    }
    // A multi-day event is found from any day it covers.
    expect(expandEvent(holiday, '2026-11-26', '2026-11-26', 'UTC')).toHaveLength(1);
    expect(expandEvent(holiday, '2026-11-27', '2026-11-27', 'UTC')).toEqual([]);
  });

  it('expands a series, honouring its end date and removed occurrences', () => {
    const weekly = event({
      recurring: true,
      recurrence: rule({ frequency: 'weekly', weekdays: [2, 4] }),
      recurrenceEndDate: '2026-12-03',
      excludedDates: ['2026-11-26'],
    });
    const items = expandEvent(weekly, '2026-11-23', '2026-12-13', 'Europe/Istanbul');
    expect(items.map((item) => item.date)).toEqual(['2026-11-24', '2026-12-01', '2026-12-03']);
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('keeps the wall-clock time of a series across a daylight-saving change', () => {
    const standup = event({
      timeZone: 'America/New_York',
      startDate: '2026-03-06',
      endDate: '2026-03-06',
      startTime: '09:00',
      endTime: '09:30',
      recurring: true,
    });
    const items = expandEvent(standup, '2026-03-07', '2026-03-09', 'America/New_York');
    expect(items.map((item) => [item.date, item.startTime])).toEqual([
      ['2026-03-07', '09:00'],
      ['2026-03-08', '09:00'],
      ['2026-03-09', '09:00'],
    ]);
    // Still 09:00 locally, but an hour earlier in UTC once clocks have moved forward.
    expect(items.map((item) => item.startsAt.slice(11, 16))).toEqual(['14:00', '13:00', '13:00']);
    // For a viewer whose clocks did not change, the event appears to move by an hour.
    const istanbul = expandEvent(standup, '2026-03-07', '2026-03-09', 'Europe/Istanbul');
    expect(istanbul.map((item) => item.startTime)).toEqual(['17:00', '16:00', '16:00']);
  });

  it('carries an event past midnight', () => {
    const night = event({ startTime: '23:00', endDate: '2026-11-25', endTime: '01:00' });
    const [item] = expandEvent(night, '2026-11-25', '2026-11-25', 'Europe/Istanbul');
    expect(item).toMatchObject({ date: '2026-11-24', endDate: '2026-11-25', endTime: '01:00' });
  });

  it('places tasks by their time block, else by their due date', () => {
    const base = { _id: 't1', title: 'Write', status: 'todo', recurring: false, categoryId: null };
    expect(
      taskItem(
        {
          ...base,
          scheduledDate: '2026-11-25',
          scheduledTime: '14:00',
          durationMinutes: 90,
          dueDate: '2026-11-30',
        },
        'Europe/Istanbul',
      ),
    ).toMatchObject({ date: '2026-11-25', startTime: '14:00', endTime: '15:30', allDay: false });
    expect(taskItem({ ...base, scheduledDate: '2026-11-25', dueDate: null }, 'UTC')).toMatchObject({
      date: '2026-11-25',
      allDay: true,
    });
    expect(taskItem({ ...base, dueDate: '2026-11-30', dueTime: '17:00' }, 'UTC')).toMatchObject({
      date: '2026-11-30',
      startTime: '17:00',
      endTime: '17:30',
    });
    expect(taskItem({ ...base, dueDate: '2026-11-30' }, 'UTC')).toMatchObject({ allDay: true });
  });

  it('finds overlapping timed items and nothing else', () => {
    const item = (id, start, end, extra = {}) => ({
      id,
      kind: 'event',
      allDay: false,
      status: null,
      startsAt: `2026-11-24T${start}:00.000Z`,
      endsAt: `2026-11-24T${end}:00.000Z`,
      ...extra,
    });
    const conflicts = findConflicts([
      item('a', '09:00', '10:00'),
      item('b', '09:30', '10:30'),
      item('c', '10:00', '11:00'), // touches a, overlaps b
      item('d', '13:00', '14:00'),
      item('done', '09:00', '10:00', { kind: 'task', status: 'done' }),
      { id: 'allday', kind: 'event', allDay: true, status: null, startsAt: null, endsAt: null },
      item('habit', '09:00', '10:00', { kind: 'habit' }),
    ]);
    expect(conflicts).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });
});

describe('calendar API', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const createEvent = async (user, body) =>
    (
      await user
        .post('/calendar/events', {
          title: 'Meeting',
          startDate: TODAY,
          startTime: '10:00',
          endTime: '11:00',
          ...body,
        })
        .expect(201)
    ).body.data;
  const feed = async (user, from, to, include) =>
    (
      await user
        .get(`/calendar?from=${from}&to=${to}${include ? `&include=${include}` : ''}`)
        .expect(200)
    ).body.data;

  it('creates an event in the user’s time zone with defaults', async () => {
    setNow();
    const user = await registerUser({ timeZone: 'Europe/Istanbul' });
    const { event: created, conflicts } = await createEvent(user);
    expect(created).toMatchObject({
      title: 'Meeting',
      version: 1,
      kind: 'event',
      allDay: false,
      timeZone: 'Europe/Istanbul',
      startDate: TODAY,
      endDate: TODAY,
      startTime: '10:00',
      endTime: '11:00',
      recurrence: null,
      excludedDates: [],
    });
    expect(conflicts).toEqual([]);
  });

  it('validates timing', async () => {
    const user = await registerUser();
    const post = (body) => user.post('/calendar/events', { title: 'x', startDate: TODAY, ...body });
    const cases = [
      [{}, 'startTime'],
      [{ startTime: '10:00' }, 'endTime'],
      [{ startTime: '10:00', endTime: '09:00' }, 'endTime'],
      [{ startTime: '10:00', endTime: '11:00', endDate: '2026-11-20' }, 'endDate'],
      [{ allDay: true, endDate: '2027-02-01' }, 'endDate'],
      [{ startTime: '10:00', endTime: '11:00', timeZone: 'Mars/Phobos' }, 'timeZone'],
      [
        {
          startTime: '10:00',
          endTime: '11:00',
          recurrence: { frequency: 'daily' },
          recurrenceEndDate: '2026-11-01',
        },
        'recurrenceEndDate',
      ],
      [
        { startTime: '10:00', endTime: '11:00', reminderMinutes: [1, 2, 3, 4, 5, 6] },
        'reminderMinutes',
      ],
    ];
    for (const [body, path] of cases) {
      const response = await post(body);
      expect(response.status, path).toBe(400);
      expect(response.body.error.details.map((detail) => detail.path)).toContain(path);
    }
    // An all-day event needs no times, and any it is given are dropped.
    const allDay = (await post({ allDay: true, startTime: '10:00', endTime: '11:00' }).expect(201))
      .body.data.event;
    expect(allDay).toMatchObject({ allDay: true, startTime: null, endTime: null });
  });

  it('merges events, tasks and habits into one feed', async () => {
    setNow();
    const user = await registerUser();
    await createEvent(user, { title: 'Dentist', startTime: '09:00', endTime: '09:45' });
    await createEvent(user, {
      title: 'Holiday',
      allDay: true,
      startDate: '2026-11-25',
      endDate: '2026-11-26',
    });
    await user.post('/tasks', {
      title: 'Report',
      dueDate: '2026-11-30',
      scheduledDate: TODAY,
      scheduledTime: '14:00',
      durationMinutes: 60,
    });
    await user.post('/tasks', { title: 'Pay rent', dueDate: '2026-11-25' });
    const dropped = (await user.post('/tasks', { title: 'Dropped', dueDate: TODAY })).body.data;
    await user.patch(`/tasks/${dropped.id}`, { status: 'cancelled' });
    const habit = (
      await user.post('/habits', { name: 'Read', color: '#0a84ff', startDate: '2026-11-01' })
    ).body.data;
    await user.put(`/habits/${habit.id}/entries/${TODAY}`, { value: 1 });
    await user.post('/habits', {
      name: 'Gym',
      color: '#ff9f0a',
      startDate: '2026-11-01',
      schedule: { mode: 'flexible', timesPerPeriod: 3 },
    });

    const calendar = await feed(user, TODAY, '2026-11-25');
    expect(calendar).toMatchObject({
      from: TODAY,
      to: '2026-11-25',
      today: TODAY,
      timeZone: 'Europe/Istanbul',
    });
    expect(
      calendar.items.map((item) => [item.date, item.kind, item.title, item.startTime, item.status]),
    ).toEqual([
      [TODAY, 'habit', 'Read', null, 'completed'],
      [TODAY, 'event', 'Dentist', '09:00', null],
      [TODAY, 'task', 'Report', '14:00', 'todo'],
      ['2026-11-25', 'event', 'Holiday', null, null],
      ['2026-11-25', 'task', 'Pay rent', null, 'todo'],
      ['2026-11-25', 'habit', 'Read', null, 'pending'],
    ]);

    const onlyEvents = await feed(user, TODAY, '2026-11-25', 'event');
    expect(onlyEvents.items.every((item) => item.kind === 'event')).toBe(true);
  });

  it('limits and validates the requested range', async () => {
    const user = await registerUser();
    await user.get('/calendar?from=2026-11-01&to=2027-02-01').expect(400);
    await user.get('/calendar?from=2026-11-10&to=2026-11-01').expect(400);
    await user.get(`/calendar?from=${TODAY}`).expect(400);
    await user.get(`/calendar?from=${TODAY}&to=${TODAY}&include=event,meeting`).expect(400);
  });

  it('shows each user the same event in their own time zone', async () => {
    setNow();
    const user = await registerUser({ timeZone: 'Europe/Istanbul' });
    await createEvent(user, {
      title: 'Call',
      startTime: '01:00',
      endTime: '02:00',
      startDate: '2026-11-25',
    });
    const before = await feed(user, '2026-11-24', '2026-11-25');
    expect(before.items[0]).toMatchObject({ date: '2026-11-25', startTime: '01:00' });

    // After moving to New York the stored event is unchanged, but it is shown at local time.
    await user.patch('/settings', { timeZone: 'America/New_York' }).expect(200);
    const after = await feed(user, '2026-11-24', '2026-11-25');
    expect(after.timeZone).toBe('America/New_York');
    expect(after.items[0]).toMatchObject({
      date: '2026-11-24',
      startTime: '17:00',
      endTime: '18:00',
      occurrenceDate: '2026-11-25',
    });
    expect(after.items[0].startsAt).toBe(before.items[0].startsAt);
  });

  it('reports overlapping items in the feed and when saving', async () => {
    setNow();
    const user = await registerUser();
    const first = await createEvent(user, {
      title: 'Workshop',
      startTime: '10:00',
      endTime: '12:00',
    });
    await user.post('/tasks', {
      title: 'Deep work',
      scheduledDate: TODAY,
      scheduledTime: '11:30',
      durationMinutes: 60,
    });
    const second = await createEvent(user, {
      title: 'Lunch',
      startTime: '12:00',
      endTime: '13:00',
    });

    // Lunch touches the workshop without overlapping it, but overlaps the task block.
    expect(first.conflicts).toEqual([]);
    expect(second.conflicts.map((item) => item.title)).toEqual(['Deep work']);

    const calendar = await feed(user, TODAY, TODAY);
    const titleOf = Object.fromEntries(calendar.items.map((item) => [item.id, item.title]));
    expect(calendar.conflicts.map((pair) => pair.map((id) => titleOf[id]))).toEqual([
      ['Workshop', 'Deep work'],
      ['Deep work', 'Lunch'],
    ]);
  });

  describe('repeating events', () => {
    it('lists every occurrence, removes one and ends the series', async () => {
      setNow();
      const user = await registerUser();
      const { event: series } = await createEvent(user, {
        title: 'Stand-up',
        startTime: '09:00',
        endTime: '09:15',
        recurrence: { frequency: 'weekly', weekdays: [1, 2, 3, 4, 5] },
      });
      const dates = async () =>
        (await feed(user, '2026-11-23', '2026-11-30', 'event')).items.map((item) => item.date);
      expect(await dates()).toEqual([
        '2026-11-24',
        '2026-11-25',
        '2026-11-26',
        '2026-11-27',
        '2026-11-30',
      ]);

      const excluded = (
        await user.delete(`/calendar/events/${series.id}/occurrences/2026-11-26`).expect(200)
      ).body.data;
      expect(excluded.excludedDates).toEqual(['2026-11-26']);
      expect(await dates()).toEqual(['2026-11-24', '2026-11-25', '2026-11-27', '2026-11-30']);

      // Not an occurrence (a Saturday), or already removed.
      await user.delete(`/calendar/events/${series.id}/occurrences/2026-11-28`).expect(400);
      await user.delete(`/calendar/events/${series.id}/occurrences/2026-11-26`).expect(400);

      await user
        .patch(`/calendar/events/${series.id}`, { recurrenceEndDate: '2026-11-27' })
        .expect(200);
      expect(await dates()).toEqual(['2026-11-24', '2026-11-25', '2026-11-27']);

      const single = (
        await user.patch(`/calendar/events/${series.id}`, { recurrence: null }).expect(200)
      ).body.data.event;
      expect(single).toMatchObject({ recurrence: null, excludedDates: [] });
      expect(await dates()).toEqual(['2026-11-24']);
    });

    it('detaches a dragged occurrence into its own event', async () => {
      setNow();
      const user = await registerUser();
      const { event: series } = await createEvent(user, {
        title: 'Yoga',
        startTime: '18:00',
        endTime: '19:00',
        recurrence: { frequency: 'daily' },
        reminderMinutes: [15],
      });
      await user.post(`/calendar/events/${series.id}/move`, { date: '2026-11-27' }).expect(400);

      const moved = (
        await user
          .post(`/calendar/events/${series.id}/move`, {
            date: '2026-11-26',
            startTime: '07:00',
            occurrenceDate: '2026-11-25',
          })
          .expect(200)
      ).body.data.event;
      expect(moved).toMatchObject({
        title: 'Yoga',
        recurrence: null,
        startDate: '2026-11-26',
        startTime: '07:00',
        endTime: '08:00',
        reminderMinutes: [15],
      });
      expect(moved.id).not.toBe(series.id);

      const items = (await feed(user, '2026-11-24', '2026-11-26', 'event')).items;
      expect(items.map((item) => [item.date, item.startTime, item.recurring])).toEqual([
        ['2026-11-24', '18:00', true],
        ['2026-11-26', '07:00', false],
        ['2026-11-26', '18:00', true],
      ]);
    });
  });

  describe('rescheduling', () => {
    it('moves an event to another day and time, keeping its length', async () => {
      setNow();
      const user = await registerUser();
      const { event: created } = await createEvent(user, { startTime: '10:00', endTime: '11:30' });

      const sameTime = (
        await user.post(`/calendar/events/${created.id}/move`, { date: '2026-11-26' }).expect(200)
      ).body.data.event;
      expect(sameTime).toMatchObject({
        startDate: '2026-11-26',
        startTime: '10:00',
        endDate: '2026-11-26',
        endTime: '11:30',
        version: 2,
      });

      const late = (
        await user
          .post(`/calendar/events/${created.id}/move`, { date: '2026-11-27', startTime: '23:30' })
          .expect(200)
      ).body.data.event;
      expect(late).toMatchObject({
        startDate: '2026-11-27',
        startTime: '23:30',
        endDate: '2026-11-28',
        endTime: '01:00',
      });
    });

    it('interprets the drop position in the viewer’s zone for an event from another zone', async () => {
      setNow();
      const user = await registerUser({ timeZone: 'Europe/Istanbul' });
      const { event: created } = await createEvent(user, {
        timeZone: 'America/New_York',
        startTime: '09:00',
        endTime: '10:00',
      });
      // 09:00 New York is 17:00 Istanbul. Dropped at 10:00 Istanbul time on the 26th:
      const moved = (
        await user
          .post(`/calendar/events/${created.id}/move`, { date: '2026-11-26', startTime: '10:00' })
          .expect(200)
      ).body.data.event;
      expect(moved).toMatchObject({
        timeZone: 'America/New_York',
        startDate: '2026-11-26',
        startTime: '02:00',
        endTime: '03:00',
      });
      const [item] = (await feed(user, '2026-11-26', '2026-11-26')).items;
      expect(item).toMatchObject({ date: '2026-11-26', startTime: '10:00', endTime: '11:00' });
    });

    it('moves all-day events by whole days', async () => {
      const user = await registerUser();
      const { event: trip } = await createEvent(user, {
        allDay: true,
        startDate: '2026-12-01',
        endDate: '2026-12-03',
      });
      const moved = (
        await user.post(`/calendar/events/${trip.id}/move`, { date: '2026-12-10' }).expect(200)
      ).body.data.event;
      expect(moved).toMatchObject({ startDate: '2026-12-10', endDate: '2026-12-12', allDay: true });
    });
  });

  it('unlinks events when a linked item is deleted and protects other users’ events', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const goal = (await alice.post('/goals', { title: 'Launch', color: '#0a84ff' })).body.data;
    const { event: created } = await createEvent(alice, { title: 'Private', goalId: goal.id });

    expect((await feed(bob, TODAY, TODAY)).items).toEqual([]);
    await bob.get(`/calendar/events/${created.id}`).expect(404);
    await bob.patch(`/calendar/events/${created.id}`, { title: 'Taken' }).expect(404);
    await bob.delete(`/calendar/events/${created.id}`).expect(404);
    await bob.post(`/calendar/events/${created.id}/move`, { date: TODAY }).expect(404);
    await bob
      .post('/calendar/events', { title: 'x', allDay: true, startDate: TODAY, goalId: goal.id })
      .expect(400);

    await alice.delete(`/goals/${goal.id}`).expect(204);
    const after = (await alice.get(`/calendar/events/${created.id}`).expect(200)).body.data;
    expect(after).toMatchObject({ title: 'Private', goalId: null, version: 2 });

    await alice.delete(`/calendar/events/${created.id}`).expect(204);
    expect((await feed(alice, TODAY, TODAY)).items).toEqual([]);
  });
});
