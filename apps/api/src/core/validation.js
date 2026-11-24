import { ERROR_CODES } from '@personalitify/shared-contracts';
import { IANAZone } from 'luxon';
import { z } from 'zod';
import { AppError } from './errors.js';

/** Prefix that marks a zod message as a key in the `errors:validation.*` catalog. */
const KEY_PREFIX = 'v:';

/** Use as a zod message to point at a localized validation message. */
export const vmsg = (key) => `${KEY_PREFIX}${key}`;

const FORMAT_KEYS = {
  email: 'invalid_email',
  uuid: 'invalid_uuid',
  date: 'invalid_date',
  datetime: 'invalid_datetime',
  time: 'invalid_time',
};

const SIZE_ORIGINS = { string: 'string', array: 'array', set: 'array' };

function describeIssue(issue) {
  if (typeof issue.message === 'string' && issue.message.startsWith(KEY_PREFIX)) {
    return { key: issue.message.slice(KEY_PREFIX.length), params: {} };
  }
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? { key: 'required', params: {} }
        : { key: 'invalid_type', params: {} };
    case 'invalid_value':
      return { key: 'invalid_value', params: {} };
    case 'invalid_format':
      return { key: FORMAT_KEYS[issue.format] ?? 'invalid_format', params: {} };
    case 'too_small': {
      const kind = SIZE_ORIGINS[issue.origin] ?? 'number';
      if (kind === 'string' && Number(issue.minimum) === 1) {
        return { key: 'required', params: {} };
      }
      return { key: `too_small_${kind}`, params: { minimum: issue.minimum } };
    }
    case 'too_big': {
      const kind = SIZE_ORIGINS[issue.origin] ?? 'number';
      return { key: `too_big_${kind}`, params: { maximum: issue.maximum } };
    }
    case 'unrecognized_keys':
      return { key: 'unrecognized_keys', params: { keys: issue.keys.join(', ') } };
    default:
      return { key: 'invalid', params: {} };
  }
}

/** Converts a ZodError into the `details` array of a VALIDATION_FAILED response. */
export function issuesToDetails(error, location) {
  return error.issues.map((issue) => {
    const { key, params } = describeIssue(issue);
    return {
      path: issue.path.join('.'),
      ...(location ? { location } : {}),
      code: key,
      messageKey: `errors:validation.${key}`,
      params,
    };
  });
}

/** Parses `input` with `schema` or throws a VALIDATION_FAILED AppError. */
export function parseOrThrow(schema, input, location) {
  const result = schema.safeParse(input, { reportInput: true });
  if (!result.success) {
    throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, {
      details: issuesToDetails(result.error, location),
    });
  }
  return result.data;
}

// --- Reusable field schemas ------------------------------------------------------------

export const idSchema = z.uuid().describe('UUID identifier');

/** Calendar date without a time zone, `YYYY-MM-DD`. */
export const localDateSchema = z.iso.date().describe('Calendar date, YYYY-MM-DD');

/** Time of day, `HH:mm`. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, vmsg('invalid_time'))
  .describe('Time of day, HH:mm (24-hour)');

/** Instant in UTC, ISO 8601. */
export const instantSchema = z.iso
  .datetime({ offset: true })
  .describe('Instant, ISO 8601 with offset');

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine((zone) => IANAZone.isValidZone(zone), vmsg('invalid_time_zone'))
  .describe('IANA time zone name, e.g. Europe/Istanbul');

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, vmsg('invalid_format'))
  .describe('Color as #RRGGBB');

/** Optimistic concurrency token sent with updates. */
export const baseVersionSchema = z
  .int()
  .min(1)
  .optional()
  .describe(
    'Version of the resource this change was based on. When it is stale the server merges ' +
      'non-overlapping fields or answers 409 VERSION_CONFLICT. Omit to apply to the latest version.',
  );

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Items per page'),
};

export const paginationMetaSchema = z.strictObject({
  page: z.int(),
  limit: z.int(),
  total: z.int(),
  totalPages: z.int(),
});

export function paginationMeta({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Rejects keys that MongoDB could interpret as operators or paths. */
export function findForbiddenKey(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 12) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__') {
      return key;
    }
    const found = findForbiddenKey(child, depth + 1);
    if (found) return found;
  }
  return null;
}
