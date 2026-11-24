import { logger } from '../../core/logger.js';

/**
 * In-process dispatcher for events that have been persisted to the event log.
 *
 * Delivery is at-least-once: after a crash or a retry the same event can be dispatched again,
 * so every subscriber must be idempotent (keyed by `event.eventId` or by a natural key).
 * A failing subscriber never affects the others or the request that produced the event.
 */
const subscribers = [];

/**
 * @param {string} name     Subscriber name, used in logs.
 * @param {(event: object) => Promise<void> | void} handler
 * @param {{ types?: string[] }} [options] Restrict to specific event names.
 * @returns {() => void} Unsubscribe function.
 */
export function subscribe(name, handler, { types } = {}) {
  const entry = { name, handler, types: types ? new Set(types) : null };
  subscribers.push(entry);
  return () => {
    const index = subscribers.indexOf(entry);
    if (index !== -1) subscribers.splice(index, 1);
  };
}

export async function dispatch(event) {
  await Promise.all(
    subscribers
      .filter((subscriber) => !subscriber.types || subscriber.types.has(event.event))
      .map(async (subscriber) => {
        try {
          await subscriber.handler(event);
        } catch (error) {
          logger.error(
            { err: error, subscriber: subscriber.name, eventId: event.eventId, event: event.event },
            'Event subscriber failed',
          );
        }
      }),
  );
}
