import { THEMES } from '@personalitify/shared-contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readStored, writeStored } from '../lib/storage.js';

const ThemeContext = createContext(null);
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

function storedPreference() {
  const stored = readStored('theme');
  return THEMES.includes(stored) ? stored : 'system';
}

/**
 * Theme preference (`system`, `light`, `dark`) and the theme that results from it.
 * The resolved theme is written to `<html data-theme>`, which every color token follows.
 * The preference is kept in localStorage so the right theme is applied before sign-in and
 * before the first paint (see the inline script in index.html).
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(storedPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setPreferenceState(next);
    writeStored('theme', next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
