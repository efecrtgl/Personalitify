import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { redactMongoUri } from '../src/database/connection.js';
import { useTestDatabase } from './helpers/database.js';

describe('health endpoints', () => {
  useTestDatabase();
  const app = createApp();

  it('reports liveness with version information', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body.data).toMatchObject({
      status: 'ok',
      service: 'personalitify-api',
      apiVersion: 'v1',
    });
    expect(Number.isNaN(Date.parse(response.body.data.serverTime))).toBe(false);
  });

  it('reports readiness when the database is connected', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(200);
    expect(response.body.data.checks.database).toBe('up');
  });

  it('answers unknown routes with a structured 404', async () => {
    const response = await request(app).get('/api/v1/does-not-exist').expect(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('redactMongoUri', () => {
  it('hides credentials', () => {
    expect(redactMongoUri('mongodb://user:secret@db.example:27017/app')).toBe(
      'mongodb://***@db.example:27017/app',
    );
  });
});
