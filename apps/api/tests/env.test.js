import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/personalitify',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('environment validation', () => {
  it('applies defaults for optional settings', () => {
    const config = parseEnv(valid);
    expect(config.port).toBe(4000);
    expect(config.env).toBe('development');
    expect(config.webOrigins).toEqual(['http://localhost:5173']);
    expect(config.auth.accessTtlSeconds).toBe(900);
    expect(config.auth.cookieSecure).toBe(false);
  });

  it('splits multiple web origins', () => {
    const config = parseEnv({ ...valid, WEB_ORIGINS: 'http://a.test, http://b.test' });
    expect(config.webOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('treats empty optional values as unset', () => {
    const config = parseEnv({ ...valid, SMTP_HOST: '', SMTP_PORT: '', COOKIE_SECURE: '' });
    expect(config.mail.host).toBeUndefined();
    expect(config.mail.port).toBe(587);
  });

  it('rejects a missing database URI and a short secret with a readable message', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' })).toThrowError(
      /MONGODB_URI: is required[\s\S]*JWT_ACCESS_SECRET: must be at least 32 characters/,
    );
  });

  it('rejects a non-MongoDB connection string', () => {
    expect(() => parseEnv({ ...valid, MONGODB_URI: 'postgres://localhost/db' })).toThrowError(
      /MONGODB_URI: must start with mongodb/,
    );
  });
});
