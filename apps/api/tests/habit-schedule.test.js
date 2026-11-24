import { describe, expect, it } from 'vitest';
import {
  computeCompletion,
  computeStreaks,
  dayState,
  indexEntries,
  periodProgress,
} from '../src/modules/habits/habit-schedule.js';

const TODAY = '2026-11-24'; // a Tuesday

function habit(overrides = {}) {
  return {
    startDate: '2026-11-01',
    endDate: null,
    target: { kind: 'check', value: 1, unit: '' },
    ...overrides,
    schedule: {
      mode: 'fixed',
      recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
      period: 'week',
      timesPerPeriod: 1,
      ...overrides.schedule,
    },
  };
}

const done = (date, value = 1, target = 1) => ({ date, status: 'active', value, target });
const skipped = (date) => ({ date, status: 'skipped', value: 0, target: 1 });
const postponed = (date, postponedTo) => ({
  date,
  status: 'postponed',
  value: 0,
  target: 1,
  postponedTo,
});
const stateOf = (h, date, entries, today = TODAY) =>
  dayState(h, date, indexEntries(entries), today).state;
const streaks = (h, entries, today = TODAY, weekStart = 1) =>
  computeStreaks(h, indexEntries(entries), today, weekStart);

describe('state of a habit on a day', () => {
  const daily = habit();

  it('is pending today, missed in the past and not due before the start', () => {
    expect(stateOf(daily, TODAY, [])).toBe('pending');
    expect(stateOf(daily, '2026-11-23', [])).toBe('missed');
    expect(stateOf(daily, '2026-11-25', [])).toBe('pending');
    expect(stateOf(daily, '2026-10-31', [])).toBe('not_due');
  });

  it('is completed only when the day’s target is reached', () => {
    const water = habit({ target: { kind: 'count', value: 8, unit: 'glasses' } });
    expect(stateOf(water, TODAY, [done(TODAY, 3, 8)])).toBe('partial');
    expect(stateOf(water, TODAY, [done(TODAY, 8, 8)])).toBe('completed');
    expect(stateOf(water, '2026-11-23', [done('2026-11-23', 7, 8)])).toBe('missed');
  });

  it('judges an entry against the target it was recorded with', () => {
    // The habit now asks for 10, but the day was completed when the target was 8.
    const raised = habit({ target: { kind: 'count', value: 10, unit: '' } });
    expect(stateOf(raised, '2026-11-20', [done('2026-11-20', 8, 8)])).toBe('completed');
  });

  it('respects the schedule and the end date', () => {
    const weekdays = habit({
      schedule: { recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] } },
    });
    expect(stateOf(weekdays, '2026-11-23', [])).toBe('missed'); // Monday
    expect(stateOf(weekdays, TODAY, [])).toBe('not_due'); // Tuesday
    const ended = habit({ endDate: '2026-11-20' });
    expect(stateOf(ended, '2026-11-20', [])).toBe('missed');
    expect(stateOf(ended, '2026-11-21', [])).toBe('not_due');
  });

  it('treats skipped and postponed days as deliberate', () => {
    expect(stateOf(daily, '2026-11-23', [skipped('2026-11-23')])).toBe('skipped');
    expect(stateOf(daily, '2026-11-23', [postponed('2026-11-23', TODAY)])).toBe('postponed');
  });

  it('makes a day due when an occurrence was postponed to it', () => {
    const mondays = habit({
      schedule: { recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] } },
    });
    const entries = [postponed('2026-11-23', TODAY)];
    const index = indexEntries(entries);
    expect(dayState(mondays, TODAY, index, TODAY)).toMatchObject({ state: 'pending', due: true });
    expect(dayState(mondays, '2026-11-25', index, TODAY)).toMatchObject({ state: 'not_due' });
    // Completing it on the new day counts.
    expect(stateOf(mondays, TODAY, [...entries, done(TODAY)])).toBe('completed');
  });

  it('counts a completion on a day that was not due as completed, without making it due', () => {
    const mondays = habit({
      schedule: { recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] } },
    });
    expect(dayState(mondays, TODAY, indexEntries([done(TODAY)]), TODAY)).toMatchObject({
      state: 'completed',
      due: false,
    });
  });
});

describe('streaks of fixed schedules', () => {
  const daily = habit();
  const days = (from, to) => {
    const result = [];
    for (let d = from; d <= to; d += 1) result.push(done(`2026-11-${String(d).padStart(2, '0')}`));
    return result;
  };

  it('counts consecutive completed due days up to today', () => {
    expect(streaks(daily, days(20, 24))).toMatchObject({ current: 5, best: 5, unit: 'days' });
  });

  it('is not broken by a today that is still open', () => {
    expect(streaks(daily, days(20, 23))).toMatchObject({ current: 4, best: 4 });
  });

  it('is broken by a missed day and remembers the best run', () => {
    // 1–10 completed, 11 missed, 12–23 completed.
    const entries = [...days(1, 10), ...days(12, 23)];
    expect(streaks(daily, entries)).toMatchObject({ current: 12, best: 12 });
    expect(streaks(daily, [...days(1, 10), ...days(21, 23)])).toMatchObject({
      current: 3,
      best: 10,
    });
    expect(streaks(daily, days(1, 10))).toMatchObject({ current: 0, best: 10 });
  });

  it('is not broken by skipped or postponed days, which do not count either', () => {
    const entries = [...days(18, 20), skipped('2026-11-21'), ...days(22, 23)];
    expect(streaks(daily, entries)).toMatchObject({ current: 5, best: 5 });
    const moved = [...days(18, 20), postponed('2026-11-21', '2026-11-22'), ...days(22, 23)];
    expect(streaks(daily, moved)).toMatchObject({ current: 5 });
  });

  it('only looks at due days, so gaps in the schedule are harmless', () => {
    const weekdays = habit({
      schedule: { recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] } },
    });
    const entries = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23'].map((d) => done(d));
    expect(streaks(weekdays, entries)).toMatchObject({ current: 4, best: 4 });
  });

  it('stops at the end date of a finished habit', () => {
    const ended = habit({ endDate: '2026-11-10' });
    expect(streaks(ended, days(5, 10))).toMatchObject({ current: 6, best: 6 });
  });

  it('is zero for a habit that starts in the future', () => {
    expect(streaks(habit({ startDate: '2026-12-01' }), [])).toMatchObject({ current: 0, best: 0 });
  });
});

describe('flexible schedules', () => {
  const thrice = habit({ schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 3 } });

  it('reports progress within the current week, following the user’s week start', () => {
    const entries = [done('2026-11-22'), done('2026-11-23'), done(TODAY)];
    const index = indexEntries(entries);
    // Week starting Monday 23 November: two completions.
    expect(periodProgress(thrice, TODAY, index, 1)).toEqual({
      from: '2026-11-23',
      to: '2026-11-29',
      completed: 2,
      target: 3,
      met: false,
    });
    // Week starting Sunday 22 November: three completions.
    expect(periodProgress(thrice, TODAY, index, 7)).toMatchObject({
      from: '2026-11-22',
      completed: 3,
      met: true,
    });
  });

  it('is never due or missed on a particular day', () => {
    expect(stateOf(thrice, '2026-11-20', [])).toBe('not_due');
    expect(stateOf(thrice, TODAY, [done(TODAY)])).toBe('completed');
  });

  it('counts streaks in weeks that met the quota', () => {
    const week = (monday) =>
      [0, 2, 4].map((offset) => done(`2026-11-${String(monday + offset).padStart(2, '0')}`));
    // Weeks of 2, 9 and 16 November met; the current week (23rd) has one completion so far.
    const entries = [...week(2), ...week(9), ...week(16), done('2026-11-23')];
    expect(streaks(thrice, entries)).toMatchObject({ current: 3, best: 3, unit: 'weeks' });

    // Missing the week of the 9th breaks it.
    expect(streaks(thrice, [...week(2), ...week(16)])).toMatchObject({ current: 1, best: 1 });
  });

  it('counts monthly quotas in months', () => {
    const monthly = habit({
      startDate: '2026-09-01',
      schedule: { mode: 'flexible', period: 'month', timesPerPeriod: 2 },
    });
    const entries = ['2026-09-03', '2026-09-20', '2026-10-01', '2026-10-31', '2026-11-05'].map(
      (d) => done(d),
    );
    expect(streaks(monthly, entries)).toMatchObject({ current: 2, best: 2, unit: 'months' });
  });
});

describe('completion figures', () => {
  const daily = habit();
  const figures = (h, entries, from, to) =>
    computeCompletion(h, indexEntries(entries), from, to, TODAY, 1);

  it('divides completed due days by due days that could be judged', () => {
    const entries = [
      done('2026-11-18'),
      done('2026-11-19'),
      skipped('2026-11-20'),
      // 21 and 22 missed
      done('2026-11-23'),
    ];
    const result = figures(daily, entries, '2026-11-18', TODAY);
    // Today is still open and the skipped day is excused: 3 completed of 5 judged days.
    expect(result).toMatchObject({ due: 5, completed: 3, missed: 2, skipped: 1, postponed: 0 });
    expect(result.rate).toBeCloseTo(0.6);
  });

  it('has no rate when nothing could be judged', () => {
    expect(figures(daily, [], TODAY, TODAY).rate).toBeNull();
    expect(figures(habit({ startDate: '2026-12-01' }), [], '2026-11-01', TODAY).rate).toBeNull();
  });

  it('never counts days before the habit started or after it ended', () => {
    const short = habit({ startDate: '2026-11-20', endDate: '2026-11-22' });
    const result = figures(short, [done('2026-11-20')], '2026-11-01', TODAY);
    expect(result).toMatchObject({ due: 3, completed: 1, missed: 2 });
  });

  it('breaks completion down by weekday', () => {
    const entries = [done('2026-11-16'), done('2026-11-23')]; // two Mondays
    const { byWeekday } = figures(daily, entries, '2026-11-16', '2026-11-23');
    expect(byWeekday[0]).toEqual({ weekday: 1, due: 2, completed: 2 });
    expect(byWeekday[1]).toEqual({ weekday: 2, due: 1, completed: 0 }); // Tuesday 17th missed
  });

  it('reports completions on non-due days separately', () => {
    const mondays = habit({
      schedule: { recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] } },
    });
    const result = figures(mondays, [done('2026-11-16'), done('2026-11-18')], '2026-11-16', TODAY);
    expect(result).toMatchObject({ due: 2, completed: 1, missed: 1, extra: 1 });
  });

  it('judges flexible habits per period', () => {
    const twice = habit({ schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 2 } });
    const entries = ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-17', '2026-11-19'].map(
      (d) => done(d),
    );
    // Weeks of 2 Nov (met), 9 Nov (missed), 16 Nov (met); the week of 23 Nov is still open.
    const result = figures(twice, entries, '2026-11-02', TODAY);
    expect(result).toMatchObject({ due: 3, completed: 2, missed: 1 });
  });
});
