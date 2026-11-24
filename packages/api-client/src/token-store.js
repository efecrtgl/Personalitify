/**
 * Holds the current token set in memory.
 *
 * Browser clients use it as is: the access token lives only in memory and the refresh token
 * never reaches JavaScript (it is an HttpOnly cookie). Native clients should provide a store
 * with the same four methods that keeps the refresh token in the operating system's secure
 * storage.
 */
export function createMemoryTokenStore() {
  let tokens = null;
  return {
    getAccessToken: () => tokens?.accessToken ?? null,
    getAccessTokenExpiry: () =>
      tokens?.accessTokenExpiresAt ? Date.parse(tokens.accessTokenExpiresAt) : null,
    getRefreshToken: () => tokens?.refreshToken ?? null,
    setTokens(next) {
      tokens = {
        accessToken: next.accessToken,
        accessTokenExpiresAt: next.accessTokenExpiresAt,
        // A response without a refresh token (cookie delivery) keeps the stored one.
        refreshToken: next.refreshToken ?? tokens?.refreshToken ?? null,
        sessionId: next.sessionId,
        deviceId: next.deviceId,
      };
    },
    getSession: () => (tokens ? { sessionId: tokens.sessionId, deviceId: tokens.deviceId } : null),
    clear() {
      tokens = null;
    },
  };
}
