import { createRequire } from 'node:module';
import { API_PREFIX } from '@personalitify/shared-contracts';
import express from 'express';
import { buildOpenApiDocument } from '../../core/openapi.js';

const require = createRequire(import.meta.url);

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Personalitify API</title>
    <link rel="stylesheet" href="${API_PREFIX}/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${API_PREFIX}/docs/assets/swagger-ui-bundle.js"></script>
    <script src="${API_PREFIX}/docs/init.js"></script>
  </body>
</html>`;

const INIT = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '${API_PREFIX}/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    persistAuthorization: false,
  });
});`;

/** The docs page loads only its own bundled assets, so its policy can stay strict. */
const DOCS_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";

/**
 * Serves the machine-readable OpenAPI document and a browsable reference.
 * Both are generated from the registered routes at first request.
 */
export function createDocsRouter() {
  const router = express.Router();
  let document;

  router.get('/openapi.json', (req, res) => {
    document ??= buildOpenApiDocument();
    res.json(document);
  });

  const assets = require('swagger-ui-dist').getAbsoluteFSPath();
  router.use('/docs', (req, res, next) => {
    res.setHeader('Content-Security-Policy', DOCS_CSP);
    next();
  });
  router.get('/docs', (req, res) => res.type('html').send(PAGE));
  router.get('/docs/init.js', (req, res) => res.type('application/javascript').send(INIT));
  router.use('/docs/assets', express.static(assets, { index: false, maxAge: '1d' }));

  return router;
}
