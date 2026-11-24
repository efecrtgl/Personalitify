import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../providers/AuthProvider.jsx';
import { parseLocalDate } from './dates.js';
import { currentLocale } from './i18n.js';

const NUMERIC_ORDERS = {
  dmy: ['day', 'month', 'year'],
  mdy: ['month', 'day', 'year'],
  ymd: ['year', 'month', 'day'],
};
const NUMERIC_SEPARATORS = { dmy: '.', mdy: '/', ymd: '-' };

const RELATIVE_STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * Builds formatters from explicit preferences. Pure, so it can be tested without React.
 *
 * @param {object} preferences
 * @param {string} preferences.locale      BCP 47 locale of the interface language.
 * @param {string} [preferences.timeZone]  IANA zone; the browser's zone when omitted.
 * @param {'24h'|'12h'} [preferences.timeFormat]
 * @param {'dmy'|'mdy'|'ymd'} [preferences.dateFormat]
 */
export function createFormatters({ locale, timeZone, timeFormat = '24h', dateFormat = 'dmy' }) {
  const zone = timeZone ? { timeZone } : {};
  const hour12 = timeFormat === '12h';
  const toDate = (value) => (value instanceof Date ? value : new Date(value));

  const longDate = new Intl.DateTimeFormat(locale, { ...zone, dateStyle: 'long' });
  const fullDate = new Intl.DateTimeFormat(locale, {
    ...zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...zone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat(locale, {
    ...zone,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const number = new Intl.NumberFormat(locale);

  function numericDate(value) {
    const lookup = Object.fromEntries(
      parts.formatToParts(toDate(value)).map((part) => [part.type, part.value]),
    );
    return NUMERIC_ORDERS[dateFormat]
      .map((part) => lookup[part])
      .join(NUMERIC_SEPARATORS[dateFormat]);
  }

  // Calendar dates (`YYYY-MM-DD`) carry no time zone: they are drawn as written.
  const calendar = (options) => {
    const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    return (date) => formatter.format(parseLocalDate(date));
  };
  const calendarLong = calendar({ dateStyle: 'long' });
  const calendarFull = calendar({ weekday: 'long', day: 'numeric', month: 'long' });
  const calendarShort = calendar({ day: 'numeric', month: 'short' });
  const calendarMonth = calendar({ month: 'long', year: 'numeric' });
  const calendarMonthShort = calendar({ month: 'short' });
  const weekdayLong = calendar({ weekday: 'long' });
  const weekdayShort = calendar({ weekday: 'short' });
  const weekdayNarrow = calendar({ weekday: 'narrow' });
  // 2 January 2023 was a Monday, so adding (weekday - 1) days gives any ISO weekday.
  const dateOfWeekday = (weekday) => `2023-01-0${weekday + 1}`;

  const wallClock = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  });

  return {
    /** A wall-clock time (`HH:mm`) in the user's 12- or 24-hour style, with no conversion. */
    wallTime: (clock) =>
      wallClock.format(
        new Date(Date.UTC(2000, 0, 1, Number(clock.slice(0, 2)), Number(clock.slice(3, 5)))),
      ),
    /** A calendar date: 24 November 2026 */
    calendarDate: calendarLong,
    /** A calendar date: Tuesday, 24 November */
    calendarWeekdayDate: calendarFull,
    /** A calendar date: 24 Nov */
    calendarShortDate: calendarShort,
    /** The month of a calendar date: November 2026 */
    calendarMonth,
    /** The month of a calendar date, short: Nov */
    calendarMonthShort,
    /** Name of an ISO weekday (1 = Monday): `long`, `short` or `narrow`. */
    weekdayName: (weekday, style = 'long') =>
      ({ long: weekdayLong, short: weekdayShort, narrow: weekdayNarrow })[style](
        dateOfWeekday(weekday),
      ),
    /** 24 November 2026 */
    date: (value) => longDate.format(toDate(value)),
    /** Tuesday, 24 November */
    weekdayDate: (value) => fullDate.format(toDate(value)),
    /** 24.11.2026 — honours the user's day/month/year order */
    numericDate,
    time: (value) => time.format(toDate(value)),
    dateTime: (value) => `${numericDate(value)} ${time.format(toDate(value))}`,
    /** "3 hours ago", "yesterday", "in 2 days" */
    relative(value, now = Date.now()) {
      const seconds = Math.round((toDate(value).getTime() - now) / 1000);
      for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(seconds) >= size) {
          return relative.format(Math.round(seconds / size), unit);
        }
      }
      return relative.format(0, 'minute');
    },
    number: (value) => number.format(value),
  };
}

/** Formatters that follow the interface language and the signed-in user's preferences. */
export function useFormat() {
  const { i18n } = useTranslation();
  const { settings } = useAuth();
  const language = i18n.language;
  const { timeZone, timeFormat, dateFormat } = settings ?? {};
  return useMemo(
    () => createFormatters({ locale: currentLocale(language), timeZone, timeFormat, dateFormat }),
    [language, timeZone, timeFormat, dateFormat],
  );
}
