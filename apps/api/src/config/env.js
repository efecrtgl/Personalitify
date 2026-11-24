import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const envFile = resolve(repositoryRoot, '.env');

// Values already present in the process environment take precedence over the file.
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const booleanFlag = z
  .preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false'))
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  PUBLIC_WEB_URL: z.url().default('http://localhost:5173'),

  MONGODB_URI: z
    .string({ error: 'is required' })
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),

  JWT_ACCESS_SECRET: z
    .string({ error: 'is required' })
    .min(32, 'must be at least 32 characters long'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: booleanFlag,

  SYNC_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(90),

  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().default(587)),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default('Personalitify <no-reply@personalitify.local>'),
});

/**
 * Validates the given environment and returns a frozen configuration object.
 * Throws an Error listing every invalid variable.
 */
export function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'Run "npm run dev" from the repository root to create a .env file, ' +
        'or compare your .env with .env.example.',
    );
  }
  const value = result.data;
  return Object.freeze({
    env: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    logLevel: value.LOG_LEVEL,
    host: value.API_HOST,
    port: value.API_PORT,
    webOrigins: value.WEB_ORIGINS,
    publicWebUrl: value.PUBLIC_WEB_URL.replace(/\/$/, ''),
    mongoUri: value.MONGODB_URI,
    auth: Object.freeze({
      accessSecret: value.JWT_ACCESS_SECRET,
      accessTtlSeconds: value.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: value.REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: value.COOKIE_SECURE,
    }),
    sync: Object.freeze({
      // How long the event log and deletion markers are kept for devices that are away.
      retentionDays: value.SYNC_RETENTION_DAYS,
    }),
    mail: Object.freeze({
      host: value.SMTP_HOST,
      port: value.SMTP_PORT,
      user: value.SMTP_USER,
      password: value.SMTP_PASSWORD,
      from: value.MAIL_FROM,
    }),
  });
}

let cached;

/** Lazily parsed process configuration. */
export function getConfig() {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
