import { APP_IDS, REMOTE_CONFIG_DEFAULTS } from '@personalitify/shared-contracts';
import { useQuery } from '@tanstack/react-query';
import { api, queryKeys } from './api.js';
import { APP_VERSION, getInstallationId } from './device.js';

const MINUTE = 60_000;

/**
 * The settings the server can change without a new release. Until the answer arrives, and
 * whenever the server cannot be reached, every key has its built-in default — the
 * application never waits for this.
 */
export function useRemoteConfig() {
  const config = useQuery({
    queryKey: queryKeys.platform.config,
    queryFn: () => api.platform.config({ appId: APP_IDS.WEB, installationId: getInstallationId() }),
    staleTime: 5 * MINUTE,
    refetchInterval: 15 * MINUTE,
    retry: false,
  });
  return { ...REMOTE_CONFIG_DEFAULTS, ...config.data?.values };
}

/**
 * Whether a newer version of the web application has been published. For a web application
 * "updating" is loading the page again; this tells the user when that is worth doing, and
 * when it is required.
 */
export function useUpdateCheck() {
  const check = useQuery({
    queryKey: queryKeys.platform.update,
    queryFn: () =>
      api.platform.checkForUpdate({
        appId: APP_IDS.WEB,
        platform: 'web',
        version: APP_VERSION,
        installationId: getInstallationId(),
      }),
    staleTime: 10 * MINUTE,
    refetchInterval: 30 * MINUTE,
    retry: false,
  });
  return check.data ?? null;
}
