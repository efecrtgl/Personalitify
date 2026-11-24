import { CALENDAR_EVENT_KINDS } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { recurrenceFields, serializeRecurrence } from '../../core/recurrence.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_EXCLUDED_DATES = 366;
export const MAX_REMINDERS = 5;

/**
 * A calendar event.
 *
 * Timed events are stored as wall-clock times in the event's own time zone (`timeZone`):
 * "10:00 in Istanbul" stays 10:00 in Istanbul on every occurrence, across daylight-saving
 * changes, and is shown at the corresponding local time to a user in another zone.
 * All-day events are plain calendar dates and are never shifted by time zones.
 */
const calendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 4000 },
    location: { type: String, default: '', trim: true, maxlength: 200 },
    categoryId: { type: String, default: null },
    color: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
    kind: { type: String, enum: CALENDAR_EVENT_KINDS, default: 'event' },

    allDay: { type: Boolean, default: false },
    timeZone: { type: String, required: true, maxlength: 64 },
    // First (or only) occurrence. `endDate` is inclusive for all-day events.
    startDate: { type: String, required: true, match: LOCAL_DATE },
    startTime: { type: String, default: null, match: TIME_OF_DAY },
    endDate: { type: String, required: true, match: LOCAL_DATE },
    endTime: { type: String, default: null, match: TIME_OF_DAY },

    recurring: { type: Boolean, default: false },
    recurrence: recurrenceFields,
    recurrenceEndDate: { type: String, default: null, match: LOCAL_DATE },
    // Occurrences removed from the series. Bounded.
    excludedDates: {
      type: [String],
      default: [],
      validate: (value) => value.length <= MAX_EXCLUDED_DATES,
    },

    // Minutes before the start at which to remind. Bounded.
    reminderMinutes: {
      type: [Number],
      default: [],
      validate: (value) => value.length <= MAX_REMINDERS,
    },

    taskId: { type: String, default: null },
    habitId: { type: String, default: null },
    goalId: { type: String, default: null },
  },
  { collection: 'calendarEvents' },
);

calendarEventSchema.plugin(syncedEntity);
calendarEventSchema.path('recurrence.frequency').required(false);
// Range queries: one-off events by their dates, recurring events by when their series runs.
calendarEventSchema.index({ userId: 1, deletedAt: 1, recurring: 1, startDate: 1, endDate: 1 });
calendarEventSchema.index({ userId: 1, categoryId: 1 });
calendarEventSchema.index({ userId: 1, goalId: 1 });
calendarEventSchema.index({ userId: 1, taskId: 1 });
calendarEventSchema.index({ userId: 1, habitId: 1 });

export const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

export function serializeCalendarEvent(event) {
  return {
    ...baseResource(event),
    title: event.title,
    description: event.description,
    location: event.location,
    categoryId: event.categoryId ?? null,
    color: event.color ?? null,
    kind: event.kind,
    allDay: event.allDay,
    timeZone: event.timeZone,
    startDate: event.startDate,
    startTime: event.startTime ?? null,
    endDate: event.endDate,
    endTime: event.endTime ?? null,
    recurrence: event.recurring ? serializeRecurrence(event.recurrence) : null,
    recurrenceEndDate: event.recurring ? (event.recurrenceEndDate ?? null) : null,
    excludedDates: [...event.excludedDates].sort(),
    reminderMinutes: [...event.reminderMinutes].sort((a, b) => a - b),
    taskId: event.taskId ?? null,
    habitId: event.habitId ?? null,
    goalId: event.goalId ?? null,
  };
}
