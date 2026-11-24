import { Router } from 'express';
import { getConfig } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { parseOrThrow } from './validation.js';

/**
 * Every route declared through `createModule` is recorded here.
 * The OpenAPI document is generated from this registry, so the documentation always
 * describes the routes that actually exist. The synchronization engine replays queued
 * operations through the same entries, so an operation that was made offline is validated
 * and carried out exactly like the request it stands for.
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

/** Turns `/tasks/:taskId/complete` into a matcher that extracts `{ taskId }`. */
function compilePath(path) {
  const names = [];
  const pattern = path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  const expression = new RegExp(`^${pattern}/?$`);
  return (candidate) => {
    const match = expression.exec(candidate);
    if (!match) return null;
    return Object.fromEntries(
      names.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
    );
  };
}

/**
 * Finds the declared route for a method and a concrete path such as `/tasks/123/complete`.
 * Static segments win over parameters, as in the HTTP router.
 * @returns {{ route: object, params: object } | null}
 */
export function matchRoute(method, path) {
  const wanted = method.toLowerCase();
  let best = null;
  for (const route of routeRegistry) {
    if (route.method !== wanted) continue;
    const params = route.match(path);
    if (!params) continue;
    const specificity = route.path.split('/').filter((segment) => !segment.startsWith(':')).length;
    if (!best || specificity > best.specificity) best = { route, params, specificity };
  }
  return best && { route: best.route, params: best.params };
}

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

    /**
     * Validates the inputs, runs the handler and shapes the answer. Used by the HTTP route
     * below and by anything that carries out the same operation without an HTTP request.
     * `req` and `res` are absent then; handlers that need them are HTTP-only.
     * @returns {Promise<{ status: number, data?: unknown, meta?: unknown }>}
     */
    async function execute(input) {
      const context = {
        req: input.req ?? null,
        res: input.res ?? null,
        auth: input.auth ?? null,
        language: input.language,
        params: params ? parseOrThrow(params, input.params ?? {}, 'params') : (input.params ?? {}),
        query: query ? parseOrThrow(query, input.query ?? {}, 'query') : {},
        body: body ? parseOrThrow(body, input.body ?? {}, 'body') : undefined,
      };

      const result = await handler(context);
      // A handler that wrote the response itself (a download, a redirect) is done.
      if (context.res?.headersSent) return { status };
      if (status === 204) return { status };

      const reply = result instanceof Reply ? result : new Reply(result);
      // Outside production every response is checked against its documented schema, so the
      // test suite fails whenever the implementation and the API contract drift apart.
      const data =
        response && !config.isProduction ? response.parse(reply.data) : (reply.data ?? null);
      return { status, data, meta: reply.meta };
    }

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
      match: compilePath(fullPath),
      execute,
    });

    const stack = [...middleware];
    if (auth !== 'none') {
      stack.unshift(authenticate({ role: auth === 'admin' ? 'admin' : undefined }));
    }

    router[method](fullPath, ...stack, async (req, res) => {
      const outcome = await execute({
        req,
        res,
        auth: req.auth,
        language: req.language,
        params: req.params,
        query: req.query,
        body: req.body,
      });
      if (res.headersSent) return;
      if (outcome.status === 204) {
        res.status(204).end();
        return;
      }
      res
        .status(outcome.status)
        .json(outcome.meta ? { data: outcome.data, meta: outcome.meta } : { data: outcome.data });
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
