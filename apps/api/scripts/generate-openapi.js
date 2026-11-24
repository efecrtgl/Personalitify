// Writes docs/api/openapi.json from the routes registered in the application.
// Run with: npm run docs:api
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Building the document needs the route definitions, not a database or real secrets.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/personalitify';
process.env.JWT_ACCESS_SECRET ??= 'documentation-build-only-secret-0123456789';

await import('../src/app.js');
const { buildOpenApiDocument } = await import('../src/core/openapi.js');

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/api/openapi.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`, 'utf8');
console.log(`OpenAPI document written to ${target}`);
