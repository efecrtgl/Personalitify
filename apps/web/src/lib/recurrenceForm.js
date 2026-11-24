/**
 * Maps between the repeat choices offered by forms and the platform's recurrence rules.
 * Forms offer a handful of understandable choices; the API accepts the general rule.
 */

export const REPEAT_CHOICES = ['daily', 'weekdays', 'interval', 'monthly', 'yearly'];

/** Which form choice describes a stored recurrence rule. */
export function repeatOf(recurrence) {
  if (recurrence.frequency === 'weekly') return 'weekdays';
  if (recurrence.frequency === 'monthly') return 'monthly';
  if (recurrence.frequency === 'yearly') return 'yearly';
  return recurrence.interval > 1 ? 'interval' : 'daily';
}

/**
 * The recurrence rule for a form state with `repeat`, `interval`, `weekdays` and `monthDays`.
 */
export function recurrenceOf({ repeat, interval, weekdays, monthDays }) {
  switch (repeat) {
    case 'weekdays':
      return { frequency: 'weekly', interval: 1, weekdays, monthDays: [] };
    case 'interval':
      return { frequency: 'daily', interval: Number(interval), weekdays: [], monthDays: [] };
    case 'monthly':
      return { frequency: 'monthly', interval: 1, weekdays: [], monthDays };
    case 'yearly':
      return { frequency: 'yearly', interval: 1, weekdays: [], monthDays: [] };
    default:
      return { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] };
  }
}
