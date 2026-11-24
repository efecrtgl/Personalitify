import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import request from 'supertest';
import { createApp } from '../../src/app.js';

export const API = '/api/v1';

let server;
/**
 * One listening HTTP server per test file, shared by every request of that file.
 * Passing the bare Express application to supertest would open and close a new server for
 * each request, hundreds of times per run.
 */
export function getApp() {
  if (!server) {
    server = createServer(createApp());
    server.listen(0, '127.0.0.1');
    server.unref();
  }
  return server;
}

export function deviceInput(overrides = {}) {
  return {
    installationId: randomUUID(),
    name: 'Test desktop',
    clientType: 'desktop',
    platform: 'windows',
    appId: 'personalitify-desktop',
    appVersion: '0.1.0',
    ...overrides,
  };
}

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${counter}@example.test`;
}

export const DEFAULT_PASSWORD = 'correct horse battery';

/**
 * Registers a new account as a native client and returns helpers bound to its access token.
 */
export async function registerUser(overrides = {}) {
  const credentials = {
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? DEFAULT_PASSWORD,
  };
  const device = overrides.device ?? deviceInput();
  const response = await request(getApp())
    .post(`${API}/auth/register`)
    .set('Accept-Language', overrides.language ?? 'en')
    .send({
      ...credentials,
      displayName: overrides.displayName ?? 'Test User',
      language: overrides.language ?? 'en',
      timeZone: overrides.timeZone ?? 'Europe/Istanbul',
      device,
    });
  if (response.status !== 201) {
    throw new Error(`registration failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return createSessionHelpers({ ...response.body.data, credentials, device });
}

/** Signs in an existing account from another device. */
export async function loginUser(credentials, device = deviceInput()) {
  const response = await request(getApp())
    .post(`${API}/auth/login`)
    .set('Accept-Language', 'en')
    .send({ ...credentials, device });
  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return createSessionHelpers({ ...response.body.data, credentials, device });
}

function createSessionHelpers(session) {
  const call = (method, path) =>
    request(getApp())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${session.tokens.accessToken}`)
      .set('Accept-Language', 'en');

  return {
    ...session,
    userId: session.user.id,
    get: (path) => call('get', path),
    post: (path, body) => call('post', path).send(body ?? {}),
    patch: (path, body) => call('patch', path).send(body ?? {}),
    put: (path, body) => call('put', path).send(body ?? {}),
    delete: (path, body) => (body ? call('delete', path).send(body) : call('delete', path)),
  };
}

/** Unauthenticated request helper. */
export function anonymous() {
  const call = (method, path) =>
    request(getApp())[method](`${API}${path}`).set('Accept-Language', 'en');
  return {
    get: (path) => call('get', path),
    post: (path, body) => call('post', path).send(body ?? {}),
    patch: (path, body) => call('patch', path).send(body ?? {}),
    delete: (path) => call('delete', path),
  };
}
