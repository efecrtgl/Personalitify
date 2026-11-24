import { io as defaultIo } from 'socket.io-client';
import { EventSequencer } from './event-sequencer.js';

/** Codes with which the server refuses a connection for good; signing in again is needed. */
const FINAL_REFUSALS = new Set(['UNAUTHENTICATED', 'SESSION_REVOKED']);

/**
 * Connects to the realtime endpoint and delivers the user's events in order, exactly once.
 *
 * @param {object} options
 * @param {string} [options.url]  Origin of the API (`https://api.example`). Omit in a
 *                                browser that is served from the same origin.
 * @param {() => Promise<string|null>} options.getToken  A valid access token; asked again
 *                                before every (re)connection.
 * @param {(event: object) => void} options.onEvent
 * @param {(status: 'connecting'|'connected'|'disconnected'|'unauthorized') => void} [options.onStatus]
 * @param {() => void} [options.onReset]   Too much was missed: reload instead of replaying.
 * @param {(error: unknown) => void} [options.onError]
 * @param {number} [options.cursor]        Resume position of a client that stores it.
 * @param {typeof defaultIo} [options.io]  Socket.IO client factory; replaceable in tests.
 */
export function createRealtime({
  url,
  getToken,
  onEvent,
  onStatus,
  onReset,
  onError,
  cursor = null,
  io = defaultIo,
}) {
  let stopped = false;
  let retryTimer = null;
  const status = (value) => onStatus?.(value);

  const socket = io(url, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // The token is fetched for every attempt, so a reconnect never uses a stale one.
    auth: (callback) => {
      Promise.resolve()
        .then(getToken)
        .then((token) => callback({ token }))
        .catch(() => callback({ token: null }));
    },
  });

  const replay = (after) =>
    new Promise((resolve, reject) => {
      socket.timeout(15_000).emit('replay', { after, limit: 500 }, (error, answer) => {
        if (error || !answer?.ok) reject(error ?? new Error(answer?.code ?? 'REPLAY_FAILED'));
        else resolve(answer);
      });
    });

  const sequencer = new EventSequencer({
    onEvent,
    fetchAfter: replay,
    onReset,
    onError,
    cursor,
  });

  const reconnectSoon = (delay = 1000) => {
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!stopped) socket.connect();
    }, delay);
  };

  socket.on('ready', ({ headSeq }) => {
    status('connected');
    sequencer.start(headSeq).catch(() => {});
  });
  socket.on('event', (event) => sequencer.push(event));
  // The token ran out: the server closes the connection and a fresh one is opened.
  socket.on('auth:expired', () => reconnectSoon(0));
  socket.on('auth:revoked', () => {
    stopped = true;
    status('unauthorized');
  });
  socket.on('disconnect', (reason) => {
    if (stopped) return;
    status('disconnected');
    // After a disconnect by the server, Socket.IO does not reconnect by itself.
    if (reason === 'io server disconnect') reconnectSoon();
  });
  socket.on('connect_error', (error) => {
    if (stopped) return;
    const code = error?.data?.code;
    if (FINAL_REFUSALS.has(code)) {
      stopped = true;
      status('unauthorized');
      return;
    }
    status('disconnected');
    // A refusal by the server (for example an expired token) is not retried by Socket.IO.
    if (code) reconnectSoon();
  });

  return {
    connect() {
      stopped = false;
      status('connecting');
      socket.connect();
    },
    disconnect() {
      stopped = true;
      clearTimeout(retryTimer);
      socket.disconnect();
    },
    /** The position up to which events have been delivered; null before the first `ready`. */
    getCursor: () => sequencer.cursor,
    isConnected: () => socket.connected,
  };
}
