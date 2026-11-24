import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getConfig } from '../config/env.js';

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// OWASP-recommended scrypt work factors. The test environment uses a small cost so the
// suite stays fast; the parameters are stored with each hash, so both verify correctly.
const PRODUCTION_PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const TEST_PARAMS = { N: 2 ** 10, r: 8, p: 1 };

function currentParams() {
  return getConfig().isTest ? TEST_PARAMS : PRODUCTION_PARAMS;
}

function derive(password, salt, { N, r, p }) {
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (base64url parts). */
export async function hashPassword(password) {
  const params = currentParams();
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** True when a stored hash was created with weaker parameters than the current ones. */
export function passwordNeedsRehash(stored) {
  const [, N, r, p] = String(stored).split('$');
  const params = currentParams();
  return Number(N) < params.N || Number(r) < params.r || Number(p) < params.p;
}

/** Cryptographically random URL-safe token. */
export function generateToken(bytes = 48) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * One-way fingerprint used to store tokens. Tokens are high-entropy random values, so a
 * fast hash is appropriate (unlike for passwords).
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
