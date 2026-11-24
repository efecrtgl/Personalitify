import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApiClient, createMemoryTokenStore } from '../src/index.js';

/**
 * The API reference is generated from the routes that exist (docs/api/openapi.json, kept in
 * step by a test of the API). This test holds the client against it: every operation of the
 * API must be reachable through a method of the client, and the client must not call
 * anything the API does not have.
 */
const openapi = JSON.parse(
  readFileSync(new URL('../../../docs/api/openapi.json', import.meta.url), 'utf8'),
);

/** Operations that are not meant to be called through the client. */
const NOT_IN_CLIENT = new Set([
  // Interactive documentation, opened in a browser.
  'GET /docs',
  'GET /docs/openapi.json',
]);

const PLACEHOLDER = 'placeholder-1';

/** Every `METHOD /path` the client requests when each of its methods is called once. */
async function recordClientRequests() {
  const requests = new Set();
  const tokenStore = createMemoryTokenStore();
  tokenStore.setTokens({
    accessToken: 'token',
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshToken: 'refresh',
    sessionId: 's',
    deviceId: 'd',
  });
  const client = createApiClient({
    tokenStore,
    fetch: async (url, init) => {
      const { pathname } = new URL(url, 'http://localhost');
      requests.add(`${init.method} ${pathname.replace('/api/v1', '')}`);
      const body = { data: { tokens: {}, items: [] }, meta: {} };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const visit = async (node) => {
    for (const [name, value] of Object.entries(node)) {
      if (['http', 'tokenStore'].includes(name)) continue;
      if (typeof value === 'function') {
        // Path parameters come first in every method; extra arguments are ignored.
        await Promise.resolve(value(PLACEHOLDER, PLACEHOLDER, PLACEHOLDER)).catch(() => {});
      } else if (value && typeof value === 'object') {
        await visit(value);
      }
    }
  };
  await visit(client);
  return requests;
}

/** `/tasks/{taskId}/complete` as a pattern that the recorded `/tasks/placeholder-1/complete` matches. */
const toPattern = (path) =>
  new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);

describe('client coverage', () => {
  it('reaches every operation of the API and nothing else', async () => {
    const requests = [...(await recordClientRequests())];
    const operations = Object.entries(openapi.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => ({
        id: `${method.toUpperCase()} ${path.replace('/api/v1', '')}`,
        method: method.toUpperCase(),
        pattern: toPattern(path.replace('/api/v1', '')),
      })),
    );
    const matches = (request, operation) => {
      const [method, path] = request.split(' ');
      return method === operation.method && operation.pattern.test(path);
    };

    const missing = operations
      .filter((operation) => !NOT_IN_CLIENT.has(operation.id))
      .filter((operation) => !requests.some((request) => matches(request, operation)))
      .map((operation) => operation.id);
    expect(missing).toEqual([]);

    const unknown = requests.filter(
      (request) => !operations.some((operation) => matches(request, operation)),
    );
    expect(unknown).toEqual([]);
  });
});
