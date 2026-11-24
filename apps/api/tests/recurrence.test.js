import { describe, expect, it } from 'vitest';
import {
  nextOccurrence,
  occurrencesBetween,
  occursOn,
  previousOccurrence,
  recurrenceSchema,
} from '../src/core/recurrence.js';
import {
  addDays,
  diffDays,
  eachDate,
  instantAt,
  isValidLocalDate,
  localDateInZone,
  startOfLocalDay,
  startOfWeek,
  todayInZone,
  weekdayOf,
} from '../src/core/time.js';

const rule = (overrides) => recurrenceSchema.parse({ frequency: 'daily', ...overrides });

describe('calendar date arithmetic', () => {
  it('validates calendar dates strictly', () => {
    expect(isValidLocalDate('2026-02-28')).toBe(true);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-1-1')).toBe(false);
    expect(isValidLocalDate('2026-11-24T10:00:00Z')).toBe(false);
  });

  it('adds and subtracts days across months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2026-03-10', '2026-03-01')).toBe(-9);
  });

  it('is not disturbed by daylight-saving days, which are 23 or 25 hours long', () => {
    // 8 March 2026 is 23 hours long in New York, 1 November 2026 is 25 hours long.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(eachDate('2026-10-31', '2026-11-02')).toEqual([
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('knows weekdays and week starts', () => {
    expect(weekdayOf('2026-11-24')).toBe(2); // Tuesday
    expect(startOfWeek('2026-11-24', 1)).toBe('2026-11-23'); // Monday
    expect(startOfWeek('2026-11-24', 7)).toBe('2026-11-22'); // Sunday
    expect(startOfWeek('2026-11-24', 6)).toBe('2026-11-21'); // Saturday
    expect(startOfWeek('2026-11-22', 7)).toBe('2026-11-22');
  });
});

describe('time zones', () => {
  it('derives the calendar date from the user’s zone, not from UTC', () => {
    const instant = new Date('2026-11-24T21:30:00.000Z');
    expect(localDateInZone(instant, 'UTC')).toBe('2026-11-24');
    expect(localDateInZone(instant, 'Europe/Istanbul')).toBe('2026-11-25'); // 00:30 next day
    expect(localDateInZone(instant, 'America/Los_Angeles')).toBe('2026-11-24');
    expect(todayInZone('Pacific/Kiritimati', instant)).toBe('2026-11-25'); // UTC+14
    expect(todayInZone('Pacific/Pago_Pago', instant)).toBe('2026-11-24'); // UTC-11
  });

  it('keeps one calendar date through both halves of a repeated hour', () => {
    // 1 November 2026 in New York: 01:30 happens twice.
    expect(todayInZone('America/New_York', new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(todayInZone('America/New_York', new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    expect(todayInZone('America/New_York', new Date('2026-11-01T03:59:59Z'))).toBe('2026-10-31');
  });

  it('finds the first instant of a day, including shortened and missing-midnight days', () => {
    expect(startOfLocalDay('2026-11-25', 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-24T21:00:00.000Z',
    );
    // Spring forward at 02:00: midnight exists, the day is 23 hours long.
    const springStart = startOfLocalDay('2026-03-08', 'America/New_York');
    const nextStart = startOfLocalDay('2026-03-09', 'America/New_York');
    expect(springStart.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect((nextStart - springStart) / 3_600_000).toBe(23);

    // Clocks in Beirut jump from 00:00 to 01:00, so this day has no midnight at all.
    const beirut = startOfLocalDay('2026-03-29', 'Asia/Beirut');
    expect(localDateInZone(beirut, 'Asia/Beirut')).toBe('2026-03-29');
    expect(localDateInZone(new Date(beirut.getTime() - 1), 'Asia/Beirut')).toBe('2026-03-28');
  });

  it('places a wall-clock time on a calendar day', () => {
    expect(instantAt('2026-11-25', '08:30', 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-25T05:30:00.000Z',
    );
    // The same wall-clock time is a different instant after the clocks change.
    expect(instantAt('2026-03-07', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-03-07T13:00:00.000Z',
    );
    expect(instantAt('2026-03-09', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-03-09T12:00:00.000Z',
    );
  });
});

describe('recurrence rules', () => {
  it('never occurs before the start date', () => {
    expect(occursOn(rule(), '2026-11-24', '2026-11-23')).toBe(false);
    expect(occursOn(rule(), '2026-11-24', '2026-11-24')).toBe(true);
  });

  it('repeats daily and every N days', () => {
    expect(occurrencesBetween(rule(), '2026-11-24', '2026-11-24', '2026-11-27')).toHaveLength(4);
    expect(
      occurrencesBetween(rule({ interval: 3 }), '2026-11-24', '2026-11-20', '2026-12-05'),
    ).toEqual(['2026-11-24', '2026-11-27', '2026-11-30', '2026-12-03']);
  });

  it('repeats on chosen weekdays', () => {
    const weekdays = rule({ frequency: 'weekly', weekdays: [1, 3, 5] });
    expect(occurrencesBetween(weekdays, '2026-11-23', '2026-11-23', '2026-12-04')).toEqual([
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
      '2026-11-30',
      '2026-12-02',
      '2026-12-04',
    ]);
  });

  it('uses the start date’s weekday when none is chosen', () => {
    const weekly = rule({ frequency: 'weekly' });
    expect(occurrencesBetween(weekly, '2026-11-26', '2026-11-20', '2026-12-12')).toEqual([
      '2026-11-26',
      '2026-12-03',
      '2026-12-10',
    ]);
  });

  it('counts every-other-week in calendar weeks, also when starting mid-week', () => {
    // Starts on a Wednesday; Monday and Friday are chosen.
    const biweekly = rule({ frequency: 'weekly', interval: 2, weekdays: [1, 5] });
    expect(occurrencesBetween(biweekly, '2026-11-25', '2026-11-23', '2026-12-25')).toEqual([
      '2026-11-27', // Friday of the starting week (its Monday is before the start)
      '2026-12-07',
      '2026-12-11',
      '2026-12-21',
      '2026-12-25',
    ]);
  });

  it('repeats monthly and falls back to the last day in shorter months', () => {
    const on31 = rule({ frequency: 'monthly', monthDays: [31] });
    expect(occurrencesBetween(on31, '2026-01-31', '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
    expect(occursOn(on31, '2028-01-31', '2028-02-29')).toBe(true); // leap year
    expect(occursOn(on31, '2028-01-31', '2028-02-28')).toBe(false);
  });

  it('supports several days per month, the last day, and month intervals', () => {
    const twice = rule({ frequency: 'monthly', monthDays: [1, 15] });
    expect(occurrencesBetween(twice, '2026-11-10', '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-15',
      '2026-12-01',
      '2026-12-15',
    ]);
    const lastDay = rule({ frequency: 'monthly', monthDays: [-1] });
    expect(occurrencesBetween(lastDay, '2026-01-01', '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    const quarterly = rule({ frequency: 'monthly', interval: 3 });
    expect(occurrencesBetween(quarterly, '2026-01-15', '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });

  it('repeats yearly, moving 29 February to the 28th in other years', () => {
    const yearly = rule({ frequency: 'yearly' });
    expect(occurrencesBetween(yearly, '2028-02-29', '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
    const everyTwoYears = rule({ frequency: 'yearly', interval: 2 });
    expect(occursOn(everyTwoYears, '2026-06-01', '2027-06-01')).toBe(false);
    expect(occursOn(everyTwoYears, '2026-06-01', '2028-06-01')).toBe(true);
  });

  it('stops at the end date and at the limit', () => {
    expect(
      occurrencesBetween(rule(), '2026-11-01', '2026-11-01', '2026-11-30', {
        endDate: '2026-11-03',
      }),
    ).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(
      occurrencesBetween(rule(), '2026-11-01', '2026-11-01', '2026-11-30', { limit: 2 }),
    ).toHaveLength(2);
  });

  it('finds the next and the previous occurrence', () => {
    const fridays = rule({ frequency: 'weekly', weekdays: [5] });
    expect(nextOccurrence(fridays, '2026-11-01', '2026-11-24')).toBe('2026-11-27');
    expect(nextOccurrence(fridays, '2026-11-01', '2026-11-27')).toBe('2026-11-27');
    expect(previousOccurrence(fridays, '2026-11-01', '2026-11-24')).toBe('2026-11-20');
    expect(previousOccurrence(fridays, '2026-11-21', '2026-11-24')).toBeNull();
    expect(
      nextOccurrence(fridays, '2026-11-01', '2026-11-24', { endDate: '2026-11-25' }),
    ).toBeNull();
  });

  it('is the same sequence across daylight-saving changes', () => {
    // A daily rule over the spring-forward weekend produces exactly one occurrence per date.
    const days = occurrencesBetween(rule(), '2026-03-01', '2026-03-06', '2026-03-10');
    expect(days).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('validates rule input', () => {
    expect(recurrenceSchema.parse({ frequency: 'weekly' })).toEqual({
      frequency: 'weekly',
      interval: 1,
      weekdays: [],
      monthDays: [],
    });
    expect(recurrenceSchema.safeParse({ frequency: 'hourly' }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ frequency: 'daily', interval: 0 }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ frequency: 'weekly', weekdays: [0] }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ frequency: 'monthly', monthDays: [32] }).success).toBe(
      false,
    );
    expect(recurrenceSchema.safeParse({ frequency: 'daily', until: '2027-01-01' }).success).toBe(
      false,
    );
  });
});
