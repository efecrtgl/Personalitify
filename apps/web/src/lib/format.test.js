import { describe, expect, it } from 'vitest';
import { greetingKey } from '../pages/dashboard/DashboardPage.jsx';
import { createFormatters } from './format.js';

// 24 November 2026, 21:30 UTC — already the 25th in Istanbul (UTC+3).
const instant = '2026-11-24T21:30:00.000Z';

describe('createFormatters', () => {
  it('uses the user’s time zone, not the machine’s', () => {
    const istanbul = createFormatters({ locale: 'tr-TR', timeZone: 'Europe/Istanbul' });
    const newYork = createFormatters({ locale: 'tr-TR', timeZone: 'America/New_York' });
    expect(istanbul.numericDate(instant)).toBe('25.11.2026');
    expect(istanbul.time(instant)).toBe('00:30');
    expect(newYork.numericDate(instant)).toBe('24.11.2026');
    expect(newYork.time(instant)).toBe('16:30');
  });

  it('orders day, month and year as the user prefers', () => {
    const base = { locale: 'en-US', timeZone: 'UTC' };
    expect(createFormatters({ ...base, dateFormat: 'dmy' }).numericDate(instant)).toBe(
      '24.11.2026',
    );
    expect(createFormatters({ ...base, dateFormat: 'mdy' }).numericDate(instant)).toBe(
      '11/24/2026',
    );
    expect(createFormatters({ ...base, dateFormat: 'ymd' }).numericDate(instant)).toBe(
      '2026-11-24',
    );
  });

  it('switches between 24-hour and 12-hour time', () => {
    const base = { locale: 'en-US', timeZone: 'UTC' };
    expect(createFormatters({ ...base, timeFormat: '24h' }).time(instant)).toBe('21:30');
    expect(createFormatters({ ...base, timeFormat: '12h' }).time(instant)).toMatch(/^9:30\sPM$/);
  });

  it('writes long dates in the interface language', () => {
    expect(createFormatters({ locale: 'tr-TR', timeZone: 'UTC' }).date(instant)).toBe(
      '24 Kasım 2026',
    );
    expect(createFormatters({ locale: 'en-US', timeZone: 'UTC' }).date(instant)).toBe(
      'November 24, 2026',
    );
    expect(createFormatters({ locale: 'tr-TR', timeZone: 'UTC' }).weekdayDate(instant)).toBe(
      '24 Kasım Salı',
    );
  });

  it('describes distances in time relative to now', () => {
    const now = Date.parse(instant);
    const english = createFormatters({ locale: 'en-US' });
    const turkish = createFormatters({ locale: 'tr-TR' });
    expect(english.relative(now - 20_000, now)).toBe('this minute');
    expect(english.relative(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(english.relative(now - 26 * 3600_000, now)).toBe('yesterday');
    expect(english.relative(now + 2 * 86_400_000, now)).toBe('in 2 days');
    expect(turkish.relative(now - 3 * 3600_000, now)).toBe('3 saat önce');
    expect(turkish.relative(now - 26 * 3600_000, now)).toBe('dün');
  });
});

describe('greetingKey', () => {
  it('greets according to the hour in the user’s time zone', () => {
    const date = new Date('2026-11-24T04:30:00.000Z');
    expect(greetingKey(date, 'UTC')).toBe('night');
    expect(greetingKey(date, 'Europe/Istanbul')).toBe('morning'); // 07:30
    expect(greetingKey(date, 'Asia/Tokyo')).toBe('afternoon'); // 13:30
    expect(greetingKey(date, 'Pacific/Kiritimati')).toBe('evening'); // 18:30
  });
});
