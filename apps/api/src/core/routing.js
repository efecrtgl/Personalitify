import { Router } from 'express';
import { getConfig } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { parseOrThrow } from './validation.js';

/**
 * Every route declared through `createModule` is recorded here.
 * The OpenAPI document is generated from this registry, so the documentation always
 * describes the routes that actually exist.
 */
export const routeRegistry = [];

class Reply {
  constructor(data, meta) {
    this.data = data;
    this.meta = meta;
  }
}

/** Return from a handler to attach `meta` (for example pagination) to the response. */
export const withMeta = (data, meta) => new Reply(data, meta);

/**
 * Declares the routes of one domain module.
 *
 * A handler receives `{ body, query, params, auth, language, req, res }` with inputs already
 * validated, and returns the response data. Sending the envelope, the status code, input
 * validation, authentication and (outside production) response-shape verification are handled
 * here, which keeps handlers down to a single service call.
 */
export function createModule({ tag, description, basePath = '' }) {
  const router = Router();
  const config = getConfig();

  function register(method, path, definition, handler) {
    const {
      summary,
      description: routeDescription,
      auth = 'user',
      body,
      query,
      params,
      response,
      responseMeta,
      status = 200,
      errors = [],
      middleware = [],
    } = definition;
    const fullPath = `${basePath}${path}`;

    routeRegistry.push({
      method,
      path: fullPath,
      tag,
      tagDescription: description,
      summary,
      description: routeDescription,
      auth,
      body,
      query,
      params,
      response,
      responseMeta,
      status,
      errors,
    });

    const stack = [...middleware];
    if (auth !== 'none') {
      stack.unshift(authenticate({ role: auth === 'admin' ? 'admin' : undefined }));
    }

    router[method](fullPath, ...stack, async (req, res) => {
      const context = {
        req,
        res,
        auth: req.auth ?? null,
        language: req.language,
        params: params ? parseOrThrow(params, req.params, 'params') : req.params,
        query: query ? parseOrThrow(query, req.query, 'query') : {},
        body: body ? parseOrThrow(body, req.body ?? {}, 'body') : undefined,
      };

      const result = await handler(context);
      if (res.headersSent) {
        return;
      }
      if (status === 204) {
        res.status(204).end();
        return;
      }

      const reply = result instanceof Reply ? result : new Reply(result);
      // Outside production every response is checked against its documented schema, so the
      // test suite fails whenever the implementation and the API contract drift apart.
      const data =
        response && !config.isProduction ? response.parse(reply.data) : (reply.data ?? null);
      res.status(status).json(reply.meta ? { data, meta: reply.meta } : { data });
    });
  }

  return {
    router,
    get: (path, definition, handler) => register('get', path, definition, handler),
    post: (path, definition, handler) => register('post', path, definition, handler),
    put: (path, definition, handler) => register('put', path, definition, handler),
    patch: (path, definition, handler) => register('patch', path, definition, handler),
    delete: (path, definition, handler) => register('delete', path, definition, handler),
  };
}
