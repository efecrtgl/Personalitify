import { readFileSync } from 'node:fs';
import { hasTranslation } from '@personalitify/localization';
import { ERROR_CODES } from '@personalitify/shared-contracts';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/core/openapi.js';
import { routeRegistry } from '../src/core/routing.js';
import { anonymous, getApp } from './helpers/client.js';

describe('API documentation', () => {
  getApp();

  it('serves an OpenAPI document that covers every registered route', async () => {
    const response = await anonymous().get('/openapi.json').expect(200);
    const document = response.body;
    expect(document.openapi).toMatch(/^3\.0\./);
    expect(document.servers[0].url).toBe('/api/v1');
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe('bearer');

    for (const route of routeRegistry) {
      const path = route.path.replace(/:(\w+)/g, '{$1}');
      const operation = document.paths[path]?.[route.method];
      expect(operation, `${route.method.toUpperCase()} ${route.path}`).toBeDefined();
      expect(operation.summary, `${route.path} summary`).toEqual(expect.any(String));
      expect(operation.security).toEqual(route.auth === 'none' ? [] : [{ bearerAuth: [] }]);
      expect(Object.keys(operation.responses)).toContain(String(route.status));
      if (route.body) {
        expect(operation.requestBody.content['application/json'].schema.type).toBe('object');
      }
    }
  });

  it('gives every operation a unique id and documents path parameters', async () => {
    const { body: document } = await anonymous().get('/openapi.json');
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.values(methods).map((operation) => ({ path, operation })),
    );
    const ids = operations.map(({ operation }) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);

    for (const { path, operation } of operations) {
      const names = [...path.matchAll(/{(\w+)}/g)].map((match) => match[1]);
      const documented = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name);
      expect(documented.sort(), path).toEqual(names.sort());
    }
  });

  it('describes request bodies precisely enough to generate a client', async () => {
    const { body: document } = await anonymous().get('/openapi.json');
    const register = document.paths['/auth/register'].post;
    const schema = register.requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(
      expect.arrayContaining(['email', 'password', 'displayName', 'device']),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.device.properties.clientType.enum).toContain('desktop');
    expect(register.responses[409].description).toContain('EMAIL_ALREADY_REGISTERED');
  });

  it('serves the browsable reference with a policy that allows only its own assets', async () => {
    const page = await anonymous().get('/docs').expect(200);
    expect(page.text).toContain('swagger-ui');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    await anonymous().get('/docs/assets/swagger-ui.css').expect(200);
  });

  it('keeps the committed docs/api/openapi.json in step with the code', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../../docs/api/openapi.json', import.meta.url), 'utf8'),
    );
    // Run "npm run docs:api" after changing a route or schema.
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it('has a Turkish and an English message for every error code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(hasTranslation(`errors:${code}`), code).toBe(true);
    }
  });
});
