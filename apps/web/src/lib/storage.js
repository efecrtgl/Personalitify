/**
 * Small wrapper around localStorage for per-browser preferences (theme, language,
 * installation id). Storage can be unavailable (private mode, blocked cookies); the app must
 * keep working without it, so failures fall back to the default silently by design.
 */
const PREFIX = 'pfy.';

export function readStored(key, fallback = null) {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Nothing to do: the preference simply will not survive a reload.
  }
}
