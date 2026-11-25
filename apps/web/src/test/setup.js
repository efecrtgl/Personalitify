import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Pages are loaded on demand. The first render of a page in a test worker fetches and
// evaluates its module, which on a busy machine can take longer than the default second.
configure({ asyncUtilTimeout: 5000 });

// --- Browser APIs that jsdom does not provide ------------------------------------------

/** Controllable `prefers-color-scheme`; tests call `setSystemDark(true)`. */
const colorSchemeListeners = new Set();
let systemDark = false;

window.matchMedia = (query) => ({
  media: query,
  get matches() {
    return query.includes('prefers-color-scheme: dark') ? systemDark : false;
  },
  addEventListener: (type, listener) => colorSchemeListeners.add(listener),
  removeEventListener: (type, listener) => colorSchemeListeners.delete(listener),
});

export function setSystemDark(value) {
  systemDark = value;
  for (const listener of colorSchemeListeners) listener({ matches: value });
}

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
}

window.scrollTo = () => {};

// --- Isolation between tests -----------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  systemDark = false;
  delete document.documentElement.dataset.theme;
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  const [{ api, queryClient }, { i18n }] = await Promise.all([
    import('../lib/api.js'),
    import('../lib/i18n.js'),
  ]);
  api.tokenStore.clear();
  queryClient.clear();
  await i18n.changeLanguage('tr');
  window.localStorage.clear();
});
