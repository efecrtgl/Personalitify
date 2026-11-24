/**
 * Turns a habit's schedule and target into sentences. Presentation only: the rules
 * themselves are evaluated by the API.
 */

const sorted = (values) => [...values].sort((a, b) => a - b);

/** "Every day", "Mon, Wed, Fri", "Every 3 days", "3 times a week" … */
export function describeSchedule(t, format, schedule) {
  if (schedule.mode === 'flexible') {
    return t(`habits:schedule.flexible_${schedule.period}`, { count: schedule.timesPerPeriod });
  }
  const { frequency, interval, weekdays, monthDays } = schedule.recurrence;

  if (frequency === 'daily') {
    return interval === 1
      ? t('habits:schedule.everyDay')
      : t('habits:schedule.everyNDays', { count: interval });
  }
  if (frequency === 'weekly') {
    const days =
      weekdays.length === 7
        ? t('habits:schedule.everyDay')
        : sorted(weekdays)
            .map((weekday) => format.weekdayName(weekday, 'short'))
            .join(', ');
    if (weekdays.length === 0) {
      return interval === 1
        ? t('habits:schedule.weekly')
        : t('habits:schedule.everyNWeeks', { count: interval });
    }
    return interval === 1 ? days : t('habits:schedule.everyNWeeksOn', { count: interval, days });
  }
  if (frequency === 'monthly') {
    const days = sorted(monthDays.filter((day) => day > 0)).map(String);
    if (monthDays.includes(-1)) days.push(t('habits:schedule.lastDay'));
    const list = days.join(', ');
    if (!list) {
      return interval === 1
        ? t('habits:schedule.monthly')
        : t('habits:schedule.everyNMonths', { count: interval });
    }
    return interval === 1
      ? t('habits:schedule.monthlyOn', { days: list })
      : t('habits:schedule.everyNMonthsOn', { count: interval, days: list });
  }
  return interval === 1
    ? t('habits:schedule.yearly')
    : t('habits:schedule.everyNYears', { count: interval });
}

/** "3 / 8 glasses", "20 / 30 min" — empty for plain check habits. */
export function describeProgress(t, format, target, value) {
  if (target.kind === 'check') return '';
  const amount = `${format.number(value)} / ${format.number(target.value)}`;
  if (target.kind === 'duration') return t('habits:progress.minutes', { amount });
  return target.unit ? `${amount} ${target.unit}` : amount;
}

/** "8 glasses a day", "30 minutes a day" — empty for plain check habits. */
export function describeTarget(t, format, target) {
  if (target.kind === 'check') return '';
  if (target.kind === 'duration') {
    return t('habits:target.minutesPerDay', { count: target.value });
  }
  return t('habits:target.countPerDay', {
    amount: format.number(target.value),
    unit: target.unit || t('habits:target.times'),
  });
}

/** "12 days", "3 weeks" */
export function describeStreak(t, streak, which = 'current') {
  return t(`habits:streak.${streak.unit}`, { count: streak[which] });
}
