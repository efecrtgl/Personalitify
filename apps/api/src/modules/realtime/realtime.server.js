import { ERROR_CODES } from '@personalitify/shared-contracts';
import { Server } from 'socket.io';
import { getConfig } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { resolveAuth } from '../../middleware/authenticate.js';
import { onSessionsRevoked } from '../auth/session.service.js';
import { subscribe } from '../events/event-bus.js';
import { MAX_EVENTS_PER_READ, getHeadSeq, readEvents } from '../events/events.service.js';

/**
 * Realtime delivery of the event log over Socket.IO.
 *
 * The connection adds nothing to the data model: it pushes the same events that
 * `GET /events` returns, in the same order, to every connected device of the user. A client
 * that was away asks for what it missed by sequence number (`replay`), so a dropped
 * connection can never lose a change.
 *
 * Messages (see docs/architecture/event-system.md):
 *   server → client  `ready`        { userId, deviceId, headSeq, serverTime }
 *   server → client  `event`        a domain event
 *   server → client  `auth:expired` the access token ran out; reconnect with a fresh one
 *   server → client  `auth:revoked` the session was closed; sign in again
 *   client → server  `replay`       { after, limit } → { ok, events, headSeq, hasMore }
 */

/** Open connections one account may hold; the oldest is closed when one more arrives. */
export const MAX_CONNECTIONS_PER_USER = 20;
/** Replay requests one connection may make per ten seconds. */
const MAX_REPLAYS_PER_WINDOW = 30;
const REPLAY_WINDOW_MS = 10_000;

const userRoom = (userId) => `user:${userId}`;
const sessionRoom = (sessionId) => `session:${sessionId}`;
const deviceRoom = (userId, deviceId) => `device:${userId}:${deviceId}`;

let io = null;
let unsubscribe = null;

function handshakeError(code) {
  const error = new Error(code);
  // Socket.IO delivers `data` to the client's `connect_error` handler.
  error.data = { code };
  return error;
}

async function authenticateSocket(socket, next) {
  try {
    socket.data.auth = await resolveAuth(socket.handshake.auth?.token);
    next();
  } catch (error) {
    next(handshakeError(error?.code ?? ERROR_CODES.UNAUTHENTICATED));
  }
}

function onConnection(socket) {
  const { userId, sessionId, deviceId, expiresAt } = socket.data.auth;
  socket.join([userRoom(userId), sessionRoom(sessionId), deviceRoom(userId, deviceId)]);
  limitConnections(userId).catch((error) =>
    logger.error({ err: error, userId }, 'Realtime connection limit failed'),
  );

  // A connection lives no longer than the token it was opened with: the client is told,
  // disconnected, and reconnects with a fresh token.
  const expiry = setTimeout(
    () => {
      socket.emit('auth:expired');
      socket.disconnect(true);
    },
    Math.max(0, expiresAt.getTime() - Date.now()),
  );
  expiry.unref();
  socket.on('disconnect', () => clearTimeout(expiry));

  // A buggy or hostile client must not be able to make the server read the log in a loop.
  let replays = 0;
  let windowStartedAt = Date.now();
  socket.on('replay', async (request, acknowledge) => {
    if (typeof acknowledge !== 'function') return;
    if (Date.now() - windowStartedAt > REPLAY_WINDOW_MS) {
      replays = 0;
      windowStartedAt = Date.now();
    }
    replays += 1;
    if (replays > MAX_REPLAYS_PER_WINDOW) {
      acknowledge({ ok: false, code: ERROR_CODES.RATE_LIMITED });
      return;
    }
    try {
      const after = Number.isInteger(request?.after) && request.after >= 0 ? request.after : 0;
      const limit =
        Number.isInteger(request?.limit) && request.limit > 0
          ? Math.min(request.limit, MAX_EVENTS_PER_READ)
          : 200;
      acknowledge({ ok: true, ...(await readEvents(userId, { after, limit })) });
    } catch (error) {
      logger.error({ err: error, userId }, 'Realtime replay failed');
      acknowledge({ ok: false, code: ERROR_CODES.INTERNAL_ERROR });
    }
  });

  getHeadSeq(userId)
    .then((headSeq) =>
      socket.emit('ready', { userId, deviceId, headSeq, serverTime: new Date().toISOString() }),
    )
    .catch((error) => logger.error({ err: error, userId }, 'Realtime ready failed'));
}

/** Keeps an account from holding connections without end: beyond the limit the oldest go. */
async function limitConnections(userId) {
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  const excess = sockets.length - MAX_CONNECTIONS_PER_USER;
  if (excess <= 0) return;
  sockets
    .sort((a, b) => a.handshake.issued - b.handshake.issued)
    .slice(0, excess)
    .forEach((socket) => socket.disconnect(true));
}

/** Closes the connections of revoked sessions at once instead of when their token expires. */
function onRevoked({ userId, sessionId, deviceId, exceptSessionId }) {
  if (!io) return;
  let target;
  if (sessionId) target = io.in(sessionRoom(sessionId));
  else if (deviceId) target = io.in(deviceRoom(userId, deviceId));
  else target = io.in(userRoom(userId));
  if (exceptSessionId) target = target.except(sessionRoom(exceptSessionId));
  target.emit('auth:revoked');
  target.disconnectSockets(true);
}
onSessionsRevoked(onRevoked);

/** Attaches the realtime server to an HTTP server. Call once per process. */
export function attachRealtime(httpServer) {
  const allowed = new Set(getConfig().webOrigins);
  io = new Server(httpServer, {
    serveClient: false,
    // Browsers only from the configured origins; native clients send no Origin header.
    cors: {
      origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
      credentials: true,
    },
    // Events are small JSON documents; nothing legitimate comes close to this.
    maxHttpBufferSize: 100_000,
  });
  io.use(authenticateSocket);
  io.on('connection', onConnection);
  unsubscribe = subscribe('realtime.fanout', (event) => {
    io?.to(userRoom(event.userId)).emit('event', event);
  });
  return io;
}

export async function closeRealtime() {
  unsubscribe?.();
  unsubscribe = null;
  const server = io;
  io = null;
  if (server) await server.close();
}

/** Number of open connections; for health information and tests. */
export const connectionCount = () => io?.engine.clientsCount ?? 0;
