import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

/** Version of the API package, reported by the health endpoint and the OpenAPI document. */
export const API_PACKAGE_VERSION = packageJson.version;
