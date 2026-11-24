// Creates a local .env from .env.example on first run and fills in generated secrets.
// Existing .env files are never modified.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

if (existsSync(envPath)) {
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error('[setup] .env.example is missing; cannot create .env.');
  process.exit(1);
}

const generated = readFileSync(examplePath, 'utf8').replace(
  /^JWT_ACCESS_SECRET=$/m,
  `JWT_ACCESS_SECRET=${randomBytes(48).toString('base64url')}`,
);

writeFileSync(envPath, generated, { encoding: 'utf8', mode: 0o600 });
console.log('[setup] Created .env with a generated JWT secret (local development only).');
