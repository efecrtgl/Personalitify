import { DEFAULT_LANGUAGE, resources } from '@personalitify/localization';
import { API_PREFIX } from '@personalitify/shared-contracts';
import { useCallback, useEffect, useState } from 'react';

const messages = resources[DEFAULT_LANGUAGE].common;

/**
 * Infrastructure shell for Phase 1: proves that the web client reaches the API through the
 * development proxy. The application layout replaces it in Phase 3.
 */
export function App() {
  const [state, setState] = useState({ status: 'checking', version: null });

  const check = useCallback(async () => {
    setState({ status: 'checking', version: null });
    try {
      const response = await fetch(`${API_PREFIX}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      setState({ status: 'online', version: body.data.version });
    } catch {
      setState({ status: 'offline', version: null });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <h1 className="text-4xl font-semibold tracking-tight">{messages.app.name}</h1>
      <p className="text-neutral-500 dark:text-neutral-400">{messages.app.tagline}</p>
      <p role="status" className="mt-6 text-sm" data-status={state.status}>
        {messages.connection[state.status]}
      </p>
      {state.version && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {messages.connection.apiVersion.replace('{{version}}', state.version)}
        </p>
      )}
      {state.status === 'offline' && (
        <button
          type="button"
          onClick={check}
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          {messages.connection.retry}
        </button>
      )}
    </main>
  );
}
