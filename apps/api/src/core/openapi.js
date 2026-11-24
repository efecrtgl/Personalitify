import { API_PREFIX, ERROR_CODES } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { routeRegistry } from './routing.js';
import { API_PACKAGE_VERSION } from './version.js';

/** HTTP status each documented error code is returned with. */
const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  MALFORMED_JSON: 400,
  INVALID_TOKEN: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  SESSION_REVOKED: 401,
  INVALID_REFRESH_TOKEN: 401,
  REFRESH_TOKEN_REUSED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  ID_ALREADY_EXISTS: 409,
  EMAIL_ALREADY_REGISTERED: 409,
  EMAIL_ALREADY_VERIFIED: 409,
  INVALID_STATE: 409,
  CURSOR_EXPIRED: 410,
  PAYLOAD_TOO_LARGE: 413,
  LIMIT_EXCEEDED: 422,
  UNKNOWN_ENTITY_TYPE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

const STATUS_TEXT = {
  400: 'Bad request',
  401: 'Not authenticated',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload too large',
  422: 'Unprocessable',
  429: 'Too many requests',
  500: 'Internal error',
  503: 'Service unavailable',
};

function toSchema(schema, io) {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' });
}

function toParameters(schema, location) {
  if (!schema) return [];
  const json = toSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property;
    return {
      name,
      in: location,
      required: location === 'path' || required.has(name),
      ...(description ? { description } : {}),
      schema: rest,
    };
  });
}

function errorResponses(route) {
  const codes = new Set(route.errors);
  if (route.auth !== 'none') {
    codes.add('UNAUTHENTICATED').add('TOKEN_EXPIRED').add('SESSION_REVOKED');
  }
  if (route.auth === 'admin') codes.add('FORBIDDEN');
  if (route.body || route.query || route.params) codes.add('VALIDATION_FAILED');

  const byStatus = new Map();
  for (const code of codes) {
    const status = ERROR_STATUS[code] ?? 400;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  const responses = {};
  for (const [status, statusCodes] of [...byStatus].sort(([a], [b]) => a - b)) {
    responses[status] = {
      description: `${STATUS_TEXT[status] ?? 'Error'} — \`${statusCodes.sort().join('`, `')}\``,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }
  return responses;
}

function successResponse(route) {
  if (route.status === 204) {
    return { 204: { description: 'Done. No content.' } };
  }
  const properties = { data: route.response ? toSchema(route.response, 'output') : {} };
  const required = ['data'];
  if (route.responseMeta) {
    properties.meta = toSchema(route.responseMeta, 'output');
    required.push('meta');
  }
  return {
    [route.status]: {
      description: 'Success',
      content: {
        'application/json': { schema: { type: 'object', properties, required } },
      },
    },
  };
}

function operationId(route) {
  const words = `${route.method} ${route.path}`
    .replace(/[:{}]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words
    .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('');
}

/** Builds the OpenAPI 3.0 document from the routes that are actually registered. */
export function buildOpenApiDocument() {
  const paths = {};
  const tags = new Map();

  for (const route of routeRegistry) {
    if (!tags.has(route.tag)) tags.set(route.tag, route.tagDescription);
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    paths[path] ??= {};

    const operation = {
      operationId: operationId(route),
      tags: [route.tag],
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      security: route.auth === 'none' ? [] : [{ bearerAuth: [] }],
      parameters: [...toParameters(route.params, 'path'), ...toParameters(route.query, 'query')],
      responses: { ...successResponse(route), ...errorResponses(route) },
    };
    if (operation.parameters.length === 0) delete operation.parameters;
    if (route.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: toSchema(route.body, 'input') } },
      };
    }
    paths[path][route.method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Personalitify API',
      version: API_PACKAGE_VERSION,
      description: [
        'Central backend of the Personalitify ecosystem. Every client — web, the future Rust',
        'desktop application, mobile and third-party integrations — uses this same API.',
        '',
        '**Conventions**',
        '',
        '- Successful responses are wrapped as `{ "data": …, "meta": … }`.',
        '- Failures are `{ "error": { "code", "message", "details", "requestId" } }`. Branch on',
        '  `code`; `message` is localized from `Accept-Language` (`tr` default, `en`).',
        '- Identifiers are UUID strings. Instants are ISO 8601 in UTC. Calendar dates are',
        "  `YYYY-MM-DD` in the user's time zone. Times of day are `HH:mm`.",
        '- Synchronized resources carry an integer `version`. Send it back as `baseVersion`',
        '  when updating; a stale version is merged field by field or rejected with',
        '  `409 VERSION_CONFLICT`.',
        '- Breaking changes are published under a new path prefix; this document describes',
        `  \`${API_PREFIX}\`.`,
      ].join('\n'),
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    servers: [{ url: API_PREFIX, description: 'Current API version' }],
    tags: [...tags].map(([name, description]) => ({
      name,
      ...(description ? { description } : {}),
    })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from `POST /auth/login`, `/auth/register` or `/auth/refresh`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId'],
              properties: {
                code: {
                  type: 'string',
                  enum: Object.values(ERROR_CODES),
                  description: 'Stable machine-readable error code',
                },
                message: { type: 'string', description: 'Localized, human-readable message' },
                details: {
                  description:
                    'For VALIDATION_FAILED: an array of `{ path, location, code, message }`. ' +
                    'For VERSION_CONFLICT: `{ entityType, entityId, currentVersion, ' +
                    'conflictingFields, current }`.',
                },
                requestId: { type: 'string', description: 'Also sent as `X-Request-Id`' },
              },
            },
          },
          example: {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some of the information provided is not valid.',
              details: [
                {
                  path: 'email',
                  location: 'body',
                  code: 'invalid_email',
                  message: 'Enter a valid email address.',
                },
              ],
              requestId: '0d5d0a0e-6f1c-4d0a-9d55-3f0f3c0e9a11',
            },
          },
        },
      },
    },
  };
}
