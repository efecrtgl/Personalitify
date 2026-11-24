import { APP_IDS } from '@personalitify/shared-contracts';
import { readStored, writeStored } from './storage.js';

/** Version of the web bundle, injected at build time from package.json. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Stable identifier of this browser installation; created on first use. */
function installationId() {
  const existing = readStored('installationId');
  if (existing) return existing;
  const created = crypto.randomUUID();
  writeStored('installationId', created);
  return created;
}

function describeBrowser() {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\//.test(agent)
      ? 'Opera'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Chrome\//.test(agent)
          ? 'Chrome'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'Browser';
  const system = /Windows/.test(agent)
    ? 'Windows'
    : /Android/.test(agent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(agent)
        ? 'iOS'
        : /Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : '';
  return system ? `${browser} · ${system}` : browser;
}

/** The `device` object sent when registering or signing in. */
export function deviceDescriptor() {
  return {
    installationId: installationId(),
    name: describeBrowser(),
    clientType: 'web',
    platform: 'web',
    appId: APP_IDS.WEB,
    appVersion: APP_VERSION,
  };
}

/** Time zone reported by the browser, used as the default for new accounts. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
